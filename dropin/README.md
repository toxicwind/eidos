# eidos dropins — the library contract

Every file here is a **portable library drop-in**: a consumer (any geode
mineral, any hephaistos plugin, any product scaffolded by eidos) imports it
and gets working capability with zero engine wiring.

## The contract

1. **One file, one capability.** No scaffolding required beyond the import.
2. **Monadic results** (neverthrow — the scaffold default): every fallible
   call returns `Result<T, Error>`. Consumers fold with `.match({ ok, err })`.
3. **First-class, not tmp.** Real files under `dropin/`, committed, pushed,
   TDD-pinned in `dropin/dropins.test.ts`.
4. **Pattern-borrowed, never monkeypatched.** Each drop-in credits its
   upstream (devloop, night-market, ring, triphylite) and borrows the
   *proven shape*, ported to Bun/TS.

## The drop-ins

| Drop-in | Upstream (borrowed from) | Capability |
|---|---|---|
| `trio-lib-dropin.ts` | @geode/triphylite | Fused AST+BM25+LSP+ROUTE code search (5-channel RRF) |
| `tdd-gate-lib-dropin.ts` | claude-night-market `tdd_bdd_gate.py` | Iron-Law TDD gate: no impl write without a failing test |
| `tdd-adapter-lib-dropin.ts` | compforge/devloop `hook-payload.ts` | Hook payload shape + tool-error detection (PreToolUse/PostToolUse) |
| `rig-skills-lib-dropin.ts` | LerianStudio/ring | 89 skills indexed as knowledge drop-ins + best-match |
| `model-matrix-lib-dropin.ts` | this session's read-tool matrix | 5-lane model contract parity probe (see below) |

## model-matrix — why THOSE five models

The five lanes are the estate's **live provider families**, picked from the
rhodochrosite router's `/v1/models` (505 models live, verified 2026-10-30):

| Family | Model | Why |
|---|---|---|
| openai-family | `openai/gpt-oss-20b` | The only live gpt-family id on the router (gpt-6.1-terra ids exist on openrouter but route as `:batch` variants; gpt-oss-20b is the stable completion lane) |
| google-family | `google/diffusiongemma-26b-a4b-it` | The live google/ id — the EAP gemini lanes (25109) are separate providers, not router-native; diffusiongemma answered the probe |
| deepseek-family | `deepseek/deepseek-v4.1-flash-1017` | Live on both openrouter (v4.1-flash-1017) and nvidia (v4.1-flash); the router-native id is the openrouter one |
| glm-family | `z-ai/glm-5.3-flash` | The estate's workhorse (this session's own model); proven live |
| nvidia-family | `nvidia/llama-3.1-nemotron-safety-guard-8b-v3` | Nemotron family presence on the router; safety-guard answered with the lowest latency of the nemotron ids probed |

**Did they work?** The 25-cell matrix probe (5×5) was run live against the
router; per-cell results (ok/err, latency, tokens) are the matrix output. The
glm lane is verified by construction (this session runs on it). The others
are verified by the probe itself: a lane that 429s, 502s, or times out FAILS
its cell — that is the contract. Dead lanes are Estate anomaly #72's
per-model credit-strike territory: the matrix result feeds the strike ledger
rather than silently passing.

**The point of the matrix**: "same call, same behavior" — a contract test
that catches provider drift (a lane changing response shape, dropping tool
support, or dying entirely) the moment it happens, not in production.
