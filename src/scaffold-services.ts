/**
 * src/scaffold-services.ts — discover + wire INFRA DROP-INS for the bun
 * scaffold.
 *
 * CONCEPT: a "drop-in" is an estate infra service a scaffolded product can
 * connect to. They are NOT hardcoded per-product — they're DISCOVERED from
 * the estate's single source of truth:
 *
 *   config/ports.env  -- every `*_PORT` service (numeric SSOT)
 *   pitchfork.toml    -- the supervised daemon set (+ their groups)
 *
 * `discoverDropins()` reads ports.env and returns every service with a
 * resolved port. Each becomes a drop-in ready to wire into a scaffolded
 * product's `[env]` (as `BUN_<NAME>=<port>`) or as a client-hint. The
 * four first-class infra tiers (qdrant/hindsight/kafka/redis) are given
 * richer metadata, but nothing stops any other supervised service
 * (e.g. thresher, vansrouter, xerj) from being a drop-in — they all live
 * in ports.env and all come in.
 */
import { existsSync, readFileSync } from "node:fs";

const PORTS_ENV = "/home/toxic/pens/estate/config/ports.env";

export interface DropinService {
  /** Service id: the `*_PORT` name without the trailing _PORT (lowercase). */
  id: string;
  /** Kind, for the client-hint. */
  kind: "http" | "grpc" | "tcp" | "http-rest";
  /** Port value from ports.env. */
  port: number;
  /** Full env var name (BUN_<NAME>=<port>) a product exports. */
  envVar: string;
  /** Client hint — which package/endpoint to use. */
  clientHint: string;
}

/** Parse ports.env into name -> port (skips comments/blanks, keeps *_PORT). */
export function parsePortsEnv(text: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const line of text.split("\n")) {
    const clean = line.split("#")[0].trim();
    if (!clean || !clean.includes("=")) continue;
    const eq = clean.indexOf("=");
    const name = clean.slice(0, eq).trim();
    const val = clean.slice(eq + 1).trim();
    const n = Number(val);
    if (name && /_PORT$/.test(name) && Number.isInteger(n) && n >= 25000) out[name] = n;
  }
  return out;
}

/** Known client hints per infra tier; other services get a generic one. */
const HINTS: Record<string, { kind: DropinService["kind"]; hint: string }> = {
  qdrant: { kind: "http-rest", hint: "vector store — use @qdrant/js-client-rest" },
  hindsight: { kind: "http", hint: "memory/session API — REST /" },
  kafka: { kind: "tcp", hint: "event stream — use kafkajs (Bun-compatible)" },
  redis: { kind: "tcp", hint: "valkey/redis protocol — use ioredis (Bun-compatible)" },
};

/**
 * DISCOVER every drop-in: read ports.env, enumerate all *_PORT services,
 * resolve each to a DropinService with client hint. Sorted by id.
 */
/**
 * Group a `*_PORT` env-var name onto its BASE service id. QDRANT_HTTP_PORT and
 * QDRANT_PORT are the SAME service (qdrant) with different endpoints, so they
 * must coalesce onto one id.
 */
function baseServiceId(name: string): string {
  // name is like QDRANT_HTTP_PORT / QDRANT_GRPC_PORT / QDRANT_PORT / REDIS_PORT
  const core = name.replace(/_PORT$/, ""); // QDRANT_HTTP, QDRANT, REDIS
  // The infra tiers have well-known single-word bases; a compound like
  // QDRANT_HTTP belongs to the FIRST segment. Generic *_PORT services (e.g.
  // FLOTILLA_MCP_PORT) keep their full name as their own id.
  const first = core.split("_")[0].toLowerCase();
  return core.includes("_") ? first : core.toLowerCase();
}

export function discoverDropins(portsEnvText?: string): DropinService[] {
  const text = portsEnvText ?? (existsSync(PORTS_ENV) ? readFileSync(PORTS_ENV, "utf8") : "");
  const ports = parsePortsEnv(text);
  const out: DropinService[] = [];
  for (const [name, port] of Object.entries(ports)) {
    const id = baseServiceId(name);
    const meta = HINTS[id] ?? { kind: "http" as const, hint: "estate service — see pen docs" };
    out.push({
      id,
      kind: meta.kind,
      port,
      envVar: `BUN_${name}`, // BUN_QDRANT_HTTP_PORT
      clientHint: meta.hint,
    });
  }
  // sort by id then envVar so a service's endpoints stay grouped
  return out.sort((a, b) => (a.id + a.envVar).localeCompare(b.id + b.envVar));
}

/** The four first-class infra tiers (all their endpoints grouped by id). */
export function infraDropins(portsEnvText?: string): DropinService[] {
  const wanted = new Set(["qdrant", "hindsight", "kafka", "redis"]);
  return discoverDropins(portsEnvText).filter((d) => wanted.has(d.id));
}

/** Render an `[env]` block for a scaffolded product's bunfig. */
export function renderDropinsToml(dropins: DropinService[]): string {
  if (!dropins.length) return "# no drop-in services resolve";
  return dropins
    .sort((a, b) => a.envVar.localeCompare(b.envVar))
    .map((d) => `${d.envVar} = "${d.port}"`)
    .join("\n");
}

export const scaffoldServicesVersion = "1.1.0-dropin-discovery";