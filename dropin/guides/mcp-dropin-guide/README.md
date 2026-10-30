<div align="center">

# mcp-dropin-guide

**A style guide for writing MCP drop-in servers: stdio JSON-RPC, Content-Length framing, tool schemas, and doorbell registration.**

*Synthesised for the assisted-by-AI era. Rules carry flat R-NNN ids so they can be cited in code review, commit messages, and PR replies. Renumbering is forbidden.*

</div>

---

1. [Scope](#scope)
2. [Rules](#rules)
3. [Gates](#gates)
4. [Contributing](CONTRIBUTING.md)

---

## Scope

This guide governs the creation of MCP (Model Context Protocol) drop-in servers - standalone stdio processes that expose tools to coding agents via the MCP protocol. It covers:

| Area | Convention | Source of truth |
|---|---|---|
| Transport | stdio JSON-RPC with Content-Length framing | MCP spec 2024-11-05 |
| Framing | `Content-Length: N\r\n\r\n` + JSON body | MCP spec |
| Tool naming | `mcp__<server>_<tool>` (sanitized) | MCP tool bridge |
| Registration | thresher `mcp_config.json` + doorbell | Estate MCP convention |
| Server lifecycle | enabled/quarantined/healthy | doorbell health checks |
| Gateway layer | None - thresher IS the gateway | Estate MCP convention |

Out of scope: HTTP/SSE transports, OAuth auth flows, resource/prompts subscriptions.

## Rules

### R-1xx: Transport & Framing

**R-101.** Every MCP server must speak stdio JSON-RPC 2.0 with Content-Length framing: `Content-Length: <bytes>\r\n\r\n<json>`. Newline-delimited JSON alone is NOT sufficient - mcpproxy-go's stdio path ignores Content-Length-only peers.

*Why.* The doorbell proxy's stdio transport expects Content-Length framing. Servers that emit only newline-delimited JSON will connect but discover zero tools. Observed: fleet-bus-mcp initially failed because it omitted Content-Length headers. (Provenance: estate-original, incident 2026-10-16.)

Correct:
```typescript
process.stdout.write(`Content-Length: ${Buffer.byteLength(s, "utf8")}\r\n\r\n${s}`);
```

Avoid:
```typescript
process.stdout.write(JSON.stringify(res) + "\n");
```

**R-102.** Accept both Content-Length and newline-delimited JSON on input (dual framing). Thresher (mcpproxy-go) speaks newline-delimited JSON; direct stdio clients may use Content-Length.

*Why.* Dual framing maximizes compatibility across doorbell, thresher, and direct clients. Observed: grasp-hub-mcp implements dual framing and works with both. (Provenance: grasp-hub/mcp/server.ts, estate-original.)

**R-103.** Every `initialize` response must declare `protocolVersion: "2024-11-05"` and `capabilities: { tools: {} }`. Server info must include `name` and `version`.

*Why.* Door bell's MCP initialize handshake validates the protocol version. Servers that omit it fail the handshake and are marked unhealthy with retry loops. (Provenance: MCP spec 2024-11-05; doorbell health checks.)

### R-2xx: Tool Definitions

**R-201.** Every tool must have a non-empty `name`, `description`, and `inputSchema` with `type: "object"`. Tool names are sanitized to lowercase with non-`[a-z0-9_]` chars replaced by `_`.

*Why.* The MCP tool bridge generates `mcp__<server>_<tool>` names. Unsantized names cause collisions or invalid identifiers. (Provenance: MCP tool bridge spec.)

**R-202.** Every tool's `inputSchema` properties must have descriptions. Required fields must be listed in `required`.

*Why.* Agent-facing tools need self-documenting schemas so agents can invoke them without reading source code. (Provenance: estate-original.)

**R-203.** Mutating tools (write, delete, send, execute) must require an explicit `confirm: true` argument. Read-only tools must not require confirmation.

*Why.* Prevents accidental destructive operations through agent tool calls. Observed: tmux-mcp gates `tmux_send` behind `confirm:true`. (Provenance: tmux-mcp/server.ts, estate-original.)

### R-3xx: Registration & thresher

**R-301.** Every MCP server must be registered in thresher `mcp_config.json` (`/home/toxic/pens/estate/ranch/barn/thresher/mcp_config.json`) with `command`, `args`, `enabled: true`, and `timeout`. The path must point to an existing file.

*Why.* Thresher reads `mcp_config.json` to discover servers. Missing or wrong paths cause "failed to connect" errors and retry loops. All MCP servers must be registered directly in thresher - there is no separate agent-mcp-gateway layer. (Provenance: estate-original, incident 2026-10-16.)

**R-302.** Server names must match `[a-zA-Z0-9_.:-]+` and be unique across all config sources. Duplicate names shadow, not merge.

*Why.* The capability loader dedupes by server name (first win = highest priority). Duplicate names cause silent shadowing. (Provenance: MCP config-writer.ts validation.)

**R-303.** A server that fails its MCP initialize handshake is marked unhealthy and retried. Check doorbell health before declaring a server "working": `doorbell-upstream_servers list | grep <name>`.

*Why.* Syntax-valid configs can still fail at connect time (wrong path, missing module, framing mismatch). Validation is structural, not reachability. (Provenance: MCP config validation docs.)

**R-304.** agent-mcp-gateway is NOT a separate upstream server. Its functionality (policy engine, proxy, access control, audit, metrics, config watching) is built into thresher natively. Register upstream MCP servers directly in thresher `mcp_config.json`, not through agent-mcp-gateway.

*Why.* agent-mcp-gateway as a standalone upstream server creates a redundant layer: doorbell -> thresher -> agent-mcp-gateway -> other MCP servers. The correct topology is doorbell -> thresher -> MCP servers. (Provenance: estate-original, incident 2026-10-16.)

### R-4xx: Code Quality

**R-401.** All tracked text files are LF-only and ASCII-only.

*Why.* The main estate host is Arch Linux; CRLF from Windows authoring breaks shebangs. (Provenance: estate-original.)

**R-402.** Every MCP server must have a machine gate: a `bin/validate.js` that parses the server source, checks framing, and verifies tool schemas. Exit 0 = done.

*Why.* Broken MCP servers fail silently at load time. The gate is the proof command. (Provenance: estate-original; grasp-hub validator pattern.)

## Gates

Every change must pass all gates before merge. Run from repo root:

```bash
node bin/validate.js        # convention gate: frontmatter, ASCII/LF, SDD trio
bash bin/r503-forge.sh .    # R-503 autonomous scan (pattern-forge audit / ast-grep)
```

`bin/validate.js` is the canonical proof command of the TASK phase
(`.github/prompts/task.prompt.md`). A change is not done until both gates exit 0.

## SDD workflow

This repo dogfoods spec-driven development:

1. `/spec` - elicit a behavioral spec into `specs/NNN-<slug>/spec.md` (Plan agent, read-only).
2. `/task` - synthesize the rule + gate, one proof-gated step at a time.
3. `/verifySpec` - independent verification: Spec Fidelity + gate reproduction.

Synthesis and release authority are separated (SDAD, arXiv 2608.20341).
Elicitation precedes synthesis (SpecFirst, arXiv 2607.27167).
