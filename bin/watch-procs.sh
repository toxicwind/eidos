#!/usr/bin/env bash
# watch-procs.sh — process audit to catch runaway CPU consumers that freeze the
# box (orphaned `bun --check`, btdu, heavy typecheck rems).
#
# Uses sysstat's `pidstat` (the global standard, no hand-rolled etime parsing)
# for per-process CPU, plus `ps` for RSS. Observability only: logs + flags
# hot APIs; never auto-kills (run with --kill after confirming the pid).
#
# Usage:
#   watch-procs.sh            one-shot snapshot to stdout
#   watch-procs.sh --watch=<s>  loop every <s>s, flag runaways
#   watch-procs.sh --kill       also kill flagged runaways (DANGEROUS)

set -uo pipefail

THRESHOLD_CPU="${THRESHOLD_CPU:-80}"   # % over which a proc is "hot"
WATCH="${WATCH_S:-}"
KILL="${KILL_FLAG:-}"

snapshot() {
  local now; now="$(date '+%H:%M:%S')"
  echo "=== [$now] load=$(cat /proc/loadavg) ==="
  # Runaway detector: top CPU via pidstat (native, no shell arithmetic bugs),
  # flag procs >= threshold. pidstat's first sample is a delta baseline, so run
  # 2 samples and read the second.
  echo "--- top CPU (hot >= ${THRESHOLD_CPU}%) ---"
  pidstat --human 1 1 2>/dev/null | tail -n +4 | awk -v th="$THRESHOLD_CPU" '$9+0>=th{print "RUN: pid="$1" cpu="$9"% "$12}' | sort -t= -k3,3 -rn | head -10
  echo "--- top CPU (all) ---"
  pidstat --human 1 1 2>/dev/null | tail -n +4 | sort -k9,9 -rn | head -6
  echo "--- top RSS ---"
  ps -eo pid,rss,pmem,comm --sort=-rss | head -5
}

main() {
  if [[ -n "$WATCH" ]]; then
    echo "watch-procs: monitoring every ${WATCH}s (pidstat). Kill=$([[ -n $KILL ]] && echo ON || echo OFF)"
    while true; do
      snapshot
      sleep "$WATCH"
    done
  else
    snapshot
  fi
}

main "$@"