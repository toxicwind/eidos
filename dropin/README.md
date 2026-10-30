# ⤵️ dropins guide — eidos parented drop-ins

> **A drop-in** = any product/service scaffolded by (or wired through) `eidos`
> as its parent. This guide lives *in* the scaffold's `dropin/` folder and
> governs how a drop-in is authored, wired, and certified — borrowed verbatim
> from the estate's proven patterns (it was not invented; it was found and
> adapted, per pattern-borrow doctrine).

---

## 1. What a drop-in IS (doctrine)

The estate has **two** drop-in senses that share one shape — a thing that
*drops into* a parent assembler:

| Sense | Parent | Drop-in | Proof artifacts |
|---|---|---|---|
| **Infra service** | eidos (bunfig) | qdrant / hindsight / kafka / redis / +128 more | `config/ports.env` `*_PORT` |
| **MCP server** | thresher gateway | flotilla-mcp, and every `*-mcp` | `pitchfork.toml` daemon + thresher `mcp_config.json` |
| **Replacement** (strict) | original impl | a rewritten port | `dropin-certification-contract.json` (12 hard gates) |

**Parenting rule:** a drop-in is discovered by the parent, never hand-registered
twice. eidos is the parent that *discovers* infra services from
`ports.env` and emits the wiring.

## 2. The four drop-in wiring stanzas (borrowed)

Every drop-in gets four blocks emitted by `dropin/borrow-dropin.ts`:

```
ports.env          <NAME>_PORT=<free-25xxx> + owner comment     [R-301]
pitchfork.toml     [daemons."<name>-mcp"] auto=start retry      [monolith, never .d]
thresher config    mcp_config.json http entry (copy-existing)    [R-301/R-303]
bunfig [env]       BUN_<NAME>_PORT (from discoverDropins)        [scaffold]
```

## 3. Guards (from the catalog — never violate)

- **Content-Length framing** — an MCP drop-in MUST write
  `Content-Length: <bytes>\r\n\r\n<json>` (R-101). Newline-only peers connect
  but expose zero tools.
- **Thresher is the gateway** — NO agent-mcp-gateway layer (R-304).
- **Live config only** — thresher config = `/home/toxic/pens/estate/ranch/thresher/mcp_config.json`
  (verify via `/proc/<pid>/cmdline`); the ranch copy is a stale mirror.
- **Edition is additive** — ports.env + pitchfork MONOLITH + new daemon. Never
  `pitchfork.d` fragments, never deprecate keys.
- **Certification fail-closed** — a *strict*-drop-in claim requires every hard
  gate G01–G12 pass with evidence; `overall_verdict` MUST equal `CERTIFIED`.

## 4. Discovery (the concept)

`src/scaffold-services.ts` discovers drop-ins the modern way (Bun 1.4.4 +
tinyglobby):
- `discoverDropins()` reads `config/ports.env`, returns every `*_PORT` service
  as a `DropinService` (id, port, `BUN_<NAME>_PORT` env, client hint).
- `infraDropins()` → the four first-class tiers (all endpoints grouped by id).
- Rename presets are harvested the same way (see `pairs-harvest` true-mirror).

## 5. Parented products (as of 2026-10-30)

27 products carry the scaffold's bunfig signature (`telemetry=false` +
coverage `lines=90`) — they are the drop-in population under this parent.
Regenerate with: `bun src/apply-scaffold.ts --dropin --target <dir>`.

## 6. Reference homes — ALL consolidated under eidos `dropin/` (2026-10-30)

- **Guides**: `dropin/guides/mcp-dropin-guide/` (MCP drop-in server authoring)
- **Skill**: `dropin/skill/estate-mcp-dropin-ship/` (ship procedure)
- **Contracts**: `dropin/contracts/` (dropin-certification-contract, parity-gap-ledger,
  upstream-baseline, feature-inventory, sdk-contract, certification-verdict)
- **Library**: `dropin/borrow-dropin.ts` (emits the 4 wiring stanzas)
- **Discovery**: `src/scaffold-services.ts` (`discoverDropins` from ports.env)
- SSOT (unchanged, not a drop-in): `estate/docs/mcp-guide-thresher.md`

> Rename note: these were moved `mv` from `pens/guide/`, `.tau/managed-skills/`,
> and `nim-repos/…/docs/` into eidos's `dropin/` — their parent is now
> the scaffold, matching the parenting doctrine.

Generated 2026-10-30 — drop-in concept consolidated into eidos.