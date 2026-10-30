---
name: estate-mcp-dropin-ship
description: "Ship a new MCP surface into the fleet: streamable-HTTP drop-in server, ports.env, pitchfork monolith, thresher federation, and the verification loop that doesn't lie."
---

# Estate MCP drop-in ship procedure

Full walkthrough (SSOT): `/home/toxic/estate/docs/mcp-guide-thresher.md` — written live 2026-10-28 shipping flotilla-mcp. This skill is the fast path; the guide has the detail.

## Pattern (copy, never invent)

Reference shapes: `pens/ranch/android-fleet/flotilla/mcp/server.ts`, `pens/ranch/arroyo/overlord/src/taas.ts`. Contract: `POST /mcp` JSON-RPC 2.0 (initialize → notifications/initialized → tools/list → tools/call), `GET /health`, bind 127.0.0.1 unless LAN clients need it.

1. **Port**: append `<NAME>_PORT=<free-25xxx>` to `/home/toxic/estate/config/ports.env` (SSOT) with owner comment.
2. **Daemon**: append `[daemons."<name>-mcp"]` block to the MONOLITH `/home/toxic/pens/estate/pitchfork.toml` (`run` exec bun <server>, `auto=["start"]`, `retry=true`, `mise=true`, `port`, `ready_http`). NEVER edit pitchfork.d fragments (dead litter). No deprecated keys (`expected_port`/`auto_bump_port`) beside `port`. Sync the estate clone copy (`/home/toxic/estate/pitchfork.toml`) after editing.
3. **Federation**: append entry to the LIVE thresher config `/home/toxic/estate/ranch/thresher/mcp_config.json` (verify via `/proc/<pid>/cmdline`; `pens/ranch/thresher/` copy is a stale mirror — never edit). Copy an existing http entry verbatim (`"protocol": "http"`, `"url": "http://127.0.0.1:<port>/mcp"`) — a wrong enum string crashed the whole gateway once (anomaly #21). Then `pitchfork restart estate/thresher`, poll `:25127/health`.
4. **LAN clients only**: add the port to the `10.0.0.0/24` tcp set in `/etc/nftables.conf` (`inet awrawr_filter`) + `sudo nft -f` reload. Box-side `curl <lan-ip>:port` does NOT traverse this path — always probe from the real client (e.g. `adb shell nc -z <box> <port>`).

## Verify (the part that lies)

- `GET /health` on the upstream: server alive.
- `/api/v1/servers` on thresher may return `{"servers":[]}` while federation WORKS; gateway `tools/list` shows only ~12 ROUTER tools (routing_mode=retrieve_tools). Neither proves nor disproves anything.
- **Real proof**: sessioned routed call — POST `initialize` to `:25127/mcp`, capture `Mcp-Session-Id` response header, then `tools/call` `retrieve_tools` `{"query":"<keyword>"}` with the session header; responses are SSE-framed (`data:` lines — parse them). Expect your tools namespaced `<server>:<tool>`. Discovery is async (30s–2m) after a fresh restart.

## Traps

- gramJS (telegram surfaces): liveness is `client.connected`; `client.authorizationState` doesn't exist (permanent-502 trap); `client.connect()` resolves void (throws on failure); use raw `new Api.auth.SendCode({phoneNumber, apiId, apiHash, settings: new Api.CodeSettings({})})` — the high-level helper shape-drifts.
- Daemon loops must not shell out to optional binaries — a missing dep + `|| break` = daemon dead after one pass (keepalive/isleep incident).
- The `/etc/nftables.conf` file is self-flushing (no global flush ruleset — docker/tailscale own tables); edit + `sudo nft -f /etc/nftables.conf` is idempotent.
