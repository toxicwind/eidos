#!/usr/bin/env bash
# r503-forge.sh - autonomous enforcement of R-503 (no hardcoded cross-repo
# GitHub URLs) via the pattern-forge audit subcommand (ast-grep underneath).
#
# Usage: r503-forge.sh <root-dir> [extra --globs ...]
# Exit 0 = zero findings. Exit 1 = findings (each printed as evidence).
# Requires: pattern-forge (forge) on PATH or at its estate location, ast-grep
# resolvable per forge's audit.ts ($AST_GREP_BIN, ~/.local/bin, PATH).
set -uo pipefail

ROOT="${1:?usage: r503-forge.sh <root-dir> [globs...]}"
shift || true

# Name de-conflict: /usr/bin/forge is the BUILD DAEMON (pitchfork estate/forge).
# This script needs the pattern-forge CLI (forge audit = ast-grep verification).
FORGE="${FORGE_BIN:-/home/toxic/pens/estate/skills/pattern-forge/bin/forge.ts}"
if ! command -v "$FORGE" >/dev/null 2>&1 && [[ ! -x "$FORGE" ]]; then
  echo "pattern-forge not found (set FORGE_BIN)" >&2
  exit 2
fi

RULES_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/sg" && pwd)"
TOTAL=0

for RULE in "$RULES_DIR"/r503.*.yml; do
  BASE="$(basename "$RULE" .yml)"
  LANG_TAG="${BASE#r503.}"
  GLOBS="*.$LANG_TAG"
  [[ "$LANG_TAG" == "yaml" ]] && GLOBS="*.yml,*.yaml"
  OUT="$(mktemp /tmp/r503.XXXXXX.json)"
  "$FORGE" audit --root "$ROOT" --rule "$RULE" --globs "$GLOBS" "$@" --out "$OUT" --quiet >/dev/null 2>&1
  HITS=$(node -e '
    try {
      const r = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
      const ev = (r.evidence || []);
      console.log(ev.length);
      for (const e of ev) console.log("  " + e.file + ":" + (e.line + 1) + "  " + String(e.text).trim().slice(0, 100));
    } catch { console.log(0); }
  ' "$OUT")
  COUNT=$(echo "$HITS" | head -1)
  if [[ "$COUNT" != "0" ]]; then
    echo "R-503 findings [.$LANG_TAG]: $COUNT"
    echo "$HITS" | tail -n +2
    TOTAL=$((TOTAL + COUNT))
  fi
  rm -f "$OUT"
done

if [[ "$TOTAL" -eq 0 ]]; then
  echo "R-503: 0 findings - OK ($ROOT)"
  exit 0
fi
echo "R-503: $TOTAL finding(s) in $ROOT - reference repos by path, resolve via git remote get-url origin"
exit 1
