/**
 * dropin/hephaistos.ts — eidos product hosting a hephaistos MCP server.
 *
 * Hephaistos (ergasterion/hephaistos) is itself an MCP server that loads
 * plugins (forge search/write/release, logs, memory, …) and serves them
 * over stdio or WSS. A product scaffolded by eidos can therefore expose
 * the whole hephaistos surface as its drop-in MCP surface — no raw node
 * server needed, just the borrowed drop-in wiring:
 *
 *   1. ports.env       <NAME>_PORT=<free-25xxx>
 *   2. pitchfork.toml  [daemons."<name>-mcp"]  run = "hephaistos --plugins=<…> --workspace=<target>"
 *   3. thresher config mcp_config.json http entry
 *   4. hephaistos.config.json per product (plugins + options)
 *   5. bunfig [env]    BUN_<NAME>_PORT
 *
 * Dry-run by default: prints the exact blocks to append. Use --write to apply.
 */
import { discoverDropins, infraDropins } from "../src/scaffold-services.ts";
import { suggestFreePort } from "./borrow-dropin.ts";

const PITCHFORK = "/home/toxic/estate/pitchfork.toml";
const THRESHER = "/home/toxic/estate/ranch/thresher/mcp_config.json";

export interface HephaistosDropinSpec {
  name: string;              // product name → <name>-mcp daemon
  target: string;            // product dir (workspace for hephaistos)
  plugins: string[];         // hephaistos plugin ids, e.g. ["forge","logs","memory"]
  port?: number;             // resolved free port if absent
  namespacePrefix?: string;  // MCP tool namespace prefix, default the product name
}

/** Next free port suggestion in the estate 25xxx range, avoiding used ports. */
export function suggestFreePort(existing: number[] = []): number {
  const used = new Set(existing);
  for (let p = 25200; p < 25299; p++) if (!used.has(p)) return p;
  return 25999;
}

/** Borrowed ports.env stanza (R-301 owner-comment convention). */
export function portsEnvBlock(spec: HephaistosDropinSpec): string {
  return `# owner: ${spec.name} (${spec.name}-mcp hephaistos via eidos)\n${spec.name.toUpperCase()}_PORT=${spec.port}\n`;
}

/** Borrowed pitchfork monolith daemon stanza — runs hephaistos as the MCP server. */
export function pitchforkBlock(spec: HephaistosDropinSpec): string {
  const pluginsArg = spec.plugins.join(",");
  const nsArg = spec.namespacePrefix ?? spec.name;
  return [
    "",
    `[daemons."${spec.name}-mcp"]`,
    `run = "hephaistos --plugins=${pluginsArg} --workspace=${spec.target} --namespace-prefix=${nsArg}"`,
    'auto = ["start"]',
    "retry = true",
    "mise = true",
    `port = ${spec.port}`,
    `ready_http = "http://127.0.0.1:${spec.port}/mcp"`,
    "",
  ].join("\n");
}

/** Borrowed thresher mcp_config.json http entry (copy-an-existing verbatim rule). */
export function thresherBlock(spec: HephaistosDropinSpec): string {
  const pluginsArg = spec.plugins.join(",");
  const nsArg = spec.namespacePrefix ?? spec.name;
  return `{
  "name": "${spec.name}-mcp",
  "command": "hephaistos --plugins=${pluginsArg} --workspace=${spec.target} --namespace-prefix=${nsArg}",
  "protocol": "http",
  "url": "http://127.0.0.1:${spec.port}/mcp",
  "enabled": true,
  "timeout": 30
}`;
}

/** Borrowed hephaistos.config.json per product — pins the plugin set + options. */
export function hephaistosConfig(spec: HephaistosDropinSpec): string {
  const plugins: Record<string, unknown> = {};
  for (const p of spec.plugins) plugins[p] = {};
  return JSON.stringify(
    {
      plugins,
      namespacePrefix: spec.namespacePrefix ?? spec.name,
      corePrefix: spec.name,
    },
    null,
    2,
  );
}

/** Full borrowed drop-in plan for one hephaistos-backed product. */
export function borrowHephaistosDropinPlan(spec: HephaistosDropinSpec): {
  portsEnv: string; pitchfork: string; thresher: string; hephaistosConfig: string; envVars: string[];
} {
  const dropins = discoverDropins();
  const used = dropins.map((d) => d.port);
  // also avoid the ports the four infra tiers already claim
  const tierPorts = infraDropins().map((d) => d.port);
  const port = spec.port ?? suggestFreePort([...used, ...tierPorts]);
  const envVars = dropins
    .filter((d) => d.id === spec.name.toLowerCase())
    .map((d) => `${d.envVar}=${d.port}`);
  return {
    portsEnv: portsEnvBlock({ ...spec, port }),
    pitchfork: pitchforkBlock({ ...spec, port }),
    thresher: thresherBlock({ ...spec, port }),
    hephaistosConfig: hephaistosConfig(spec),
    envVars,
  };
}

const version = "1.0.0-hephaistos-dropin";
export { version, PITCHFORK, THRESHER };
