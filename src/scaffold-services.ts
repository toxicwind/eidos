"use strict";
/**
 * src/scaffold-services.ts — drop-in infra-service wiring for the bun scaffold.
 *
 * A "drop-in" is an estate infra service a scaffolded product can connect to.
 * They are DISCOVERED, not hardcoded:
 *   - config/ports.env (the numeric SSOT) — every *_PORT service
 *   - pitchfork.toml      — the supervised daemon set
 *
 * Infra tiers are grouped by base id (qdrant_http/qdrant_grpc → qdrant) and
 * the DEVICE tier (shizuku-backed pixel control) is first-class: every android
 * entry drops into the ONE flotilla transport instead of none/ad-hoc adb.
 */
import { existsSync, readFileSync } from "node:fs";

const PORTS_ENV = "/home/toxic/pens/estate/config/ports.env";

export interface DropinService {
  id: string;
  kind: "http" | "grpc" | "tcp" | "http-rest" | "device";
  port: number;
  envVar: string;
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

/** Client hints per infra tier; other services get a generic one. */
const HINTS: Record<string, { kind: DropinService["kind"]; hint: string }> = {
  qdrant: { kind: "http-rest", hint: "vector store — use @qdrant/js-client-rest" },
  hindsight: { kind: "http", hint: "memory/session API — REST /" },
  kafka: { kind: "tcp", hint: "event stream — use kafkajs (Bun-compatible)" },
  redis: { kind: "tcp", hint: "valkey/redis protocol — use ioredis (Bun-compatible)" },
  flotilla: { kind: "device", hint: "SHIZUKU-backed pixel device control (the one android transport; shizuku_mode default) — every android entry drops into THIS" },
};

/** Coalesce *_PORT names onto their base service id (qdrant_http → qdrant). */
function baseServiceId(name: string): string {
  const core = name.replace(/_PORT$/, "");
  const first = core.split("_")[0].toLowerCase();
  return core.includes("_") ? first : core.toLowerCase();
}

/** Discover every drop-in from ports.env, grouped by base id. */
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
      envVar: `BUN_${name}`,
      clientHint: meta.hint,
    });
  }
  return out.sort((a, b) => (a.id + a.envVar).localeCompare(b.id + b.envVar));
}

/** The four infra tiers + the device tier (all endpoints grouped by id). */
export function infraDropins(portsEnvText?: string): DropinService[] {
  const wanted = new Set(["qdrant", "hindsight", "kafka", "redis"]);
  return discoverDropins(portsEnvText).filter((d) => wanted.has(d.id));
}

/** The DEVICE tier: shizuku-backed pixel control — every android entry drops into flotilla. */
export function deviceDropins(portsEnvText?: string): DropinService[] {
  return discoverDropins(portsEnvText).filter((d) => d.kind === "device");
}

/** Render an `[env]` block for a scaffolded product's bunfig. */
export function renderDropinsToml(dropins: DropinService[]): string {
  if (!dropins.length) return "# no drop-in services resolve";
  return dropins
    .sort((a, b) => a.envVar.localeCompare(b.envVar))
    .map((d) => `${d.envVar} = "${d.port}"`)
    .join("\n");
}

export const scaffoldServicesVersion = "1.2.0-device-tier";
