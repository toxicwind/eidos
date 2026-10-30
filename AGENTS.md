<!-- eidos:begin -->

# eidos (εἶδος) host hints

The FORGE — bun-scaffold's form-stamping, drop-in discovery, AST-grep
validators. Sibling of hephaistos/ergane/hestia in ergasterion.

See `docs/delendai/host-hints/agent-instructions.generated.md` for the live agent catalog (legacy path — migrated to `docs/eidos/` on rebrand).

- Bootstrap §7 (repo-level rules) is in effect.

<!-- eidos:end -->

# eidos standing rules

1. **Commit-first, always.** "Dirty" is how work gets LOST — every change is
   staged, committed, and pushed to main immediately. Deletions are real
   state; backup refs (`backup/main-<date>`) preserve history before any
   force-push. Never gatekeep a commit on "dangerous" — snapshot and push.
2. **eidos is the parent of all drop-ins.** Infra services are DISCOVERED
   from `estate/config/ports.env` (`discoverDropins()` — 132 `*_PORT`
   services), never hardcoded. The device tier (shizuku-backed flotilla
   pixel control) is first-class: every android entry drops into the ONE
   flotilla transport.
3. **MCP is the integration.** eidos is a first-party `@hephaistos` plugin
   (`definePlugin`, verified consent contract shape). Capabilities surface
   as hephaistos MCP tools — not bolt-on CLI features.
4. **Rename doctrine.** ONE engine (`rename-roundup`, borrowed in as the
   hephaistos `rename` plugin). camelCase declared-forms match verbatim
   (tokenVariants.declared first). NEVER sweep vendor/vendored/fixture/
   adjacent content; provenance lines ("formerly X") are untouchable.
   Archive-before-delete into `sovereign/scratch-archive/<date>-<slug>/`.
5. **Pens layout.** `pens/tmp` is a PEN (kitchen-sink ignore, scratch pen,
   ἔκτρωμα). Scratch lives there or in `sovereign/scratch-archive/` — never
   loose in `/tmp` where the eval budget kills it.
6. **Docs lie; /proc wins.** Ground-truth every daemon claim via
   `/proc/<pid>/cmdline` before trusting a doc (the "flicker :25148" ghost
   was mbx-cache all along).
7. **LLM lane.** freeinference deepseek-v4-flash via the REAL bridge
   (`hephaistos/packages/cli/src/complete-bridge.mjs`). Ghost paths
   (`estate/ranch/borrowed/delendai`) are dead — never repoint at them.
