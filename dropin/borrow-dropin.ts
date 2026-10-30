/**
 * borrow-dropin.ts — BORROW the estate's proven MCP drop-in wiring pattern
 * (from estate-mcp-dropin-ship / mcp-dropin-guide) into eidos.
 *
 * The estate already SHIPS drop-ins the same way every time — that IS the
 * pattern, and it lives in:
 *   - managed skill `estate-mcp-dropin-ship` (SSOT: estate/docs/mcp-guide-thresher.md)
 *   - `mcp-dropin-guide` R-3xx (thresher mcp_config.json registration)
 *   - the 27 parented products' bunfigs + the 132 infra services in ports.env
 *
 * This borrows that exact sequence into a callable function so a NEW product
 * scaffolded by eidos gets the drop-in wiring EMITTED, not hand-done:
 *
 *   1. ports.env         <NAME>_PORT=<free-25xxx> + owner comment
 *   2. pitchfork.toml    [daemons."<name>-mcp"] (monolith, auto=start, retry)
 *   3. thresher config   mcp_config.json http entry
 *   4. bunfig [env]      BUN_<NAME>_PORT from discoverDropins
 *
 * This is a GENERATOR (dry-run by default): it prints the exact blocks to
 * append. Use --write to apply. Never edits pitchfork.d fragments (dead).
 */
import { discoverDropins } from "../src/scaffold-services.ts";

export interface DropinSpec {
  name: string;        // e.g. "flotilla" → flotilla-mcp
  port?: number;       // resolved from ports.env if known, else free suggestion
  run: string;         // the exec command (bun <server>)
  mcpPath?: string;    // default "/mcp"
}

const PORTS_ENV = "/home/toxic/pens/estate/config/ports.env";
const PITCHFORK = "/home/toxic/pens/estate/pitchfork.toml";
// live thresher config — the estate clone, NOT the stale ranch mirror
const THRESHER = "/home/toxic/pens/estate/ranch/thresher/mcp_config.json";

/** Next free port suggestion in the estate 25xxx range. */
export function suggestFreePort(existing: number[] = []): number {
  const used = new Set(existing);
  for (let p = 25200; p < 25299; p++) if (!used.has(p)) return p;
  return 25999;
}

/** Borrowed ports.env stanza (R-301 owner-comment convention). */
export function portsEnvBlock(spec: DropinSpec): string {
  return `# owner: ${spec.name} (${spec.name}-mcp drop-in via eidos)\n${spec.name.toUpperCase()}_PORT=${spec.port}\n`;
}

/** Borrowed pitchfork monolith daemon stanza (dashes, auto=start, retry). */
export function pitchforkBlock(spec: DropinSpec): string {
  return [
    "",
    `[daemons."${spec.name}-mcp"]`,
    `run = "${spec.run}"`,
    'auto = ["start"]',
    "retry = true",
    "mise = true",
    `port = ${spec.port}`,
    `ready_http = "http://127.0.0.1:${spec.port}${spec.mcpPath ?? "/mcp"}"`,
    "",
  ].join("\n");
}

/** Borrowed thresher mcp_config.json http entry (copy-an-existing verbatim rule). */
export function thresherBlock(spec: DropinSpec): string {
  return `{
  "name": "${spec.name}-mcp",
  "command": "${spec.run}",
  "protocol": "http",
  "url": "http://127.0.0.1:${spec.port}${spec.mcpPath ?? "/mcp"}",
  "enabled": true,
  "timeout": 30
}`;
}

/** Full borrowed drop-in plan for one product. */
export function borrowDropinPlan(spec: DropinSpec): {
  portsEnv: string; pitchfork: string; thresher: string; envVars: string[];
} {
  const dropins = discoverDropins();
  const port = spec.port ?? suggestFreePort(dropins.map((d) => d.port));
  const envVars = dropins
    .filter((d) => d.id === spec.name.toLowerCase())
    .map((d) => `${d.envVar}=${d.port}`);
  return {
    portsEnv: portsEnvBlock({ ...spec, port }),
    pitchfork: pitchforkBlock({ ...spec, port }),
    thresher: thresherBlock({ ...spec, port }),
    envVars,
  };
}

const version = "1.0.0-borrow-dropin";

export { version, PORTS_ENV, PITCHFORK, THRESHER };