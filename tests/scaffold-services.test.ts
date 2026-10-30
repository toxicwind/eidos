/**
 * TDD contract for scaffold-services — the DROP-IN DISCOVERY concept.
 * Real-world: discover every infra service from the actual ports.env SSOT,
 * not a hardcoded subset.
 */
import { describe, expect, it } from "bun:test";
import {
  discoverDropins, infraDropins, parsePortsEnv, renderDropinsToml,
} from "../src/scaffold-services.ts";

const REAL = require("fs").readFileSync("/home/toxic/pens/estate/config/ports.env", "utf8");

describe("parsePortsEnv", () => {
  it("1. parses *_PORT entries from the real SSOT (ignores others)", () => {
    const ports = parsePortsEnv(REAL);
    expect(ports.QDRANT_HTTP_PORT).toBeGreaterThanOrEqual(25000);
    expect(ports.KAFKA_PORT).toBeGreaterThanOrEqual(25000);
    // NO_PORT blobs and commented things are not _PORT integers
    for (const k of Object.keys(ports)) expect(k.endsWith("_PORT")).toBe(true);
  });
  it("2. ignores comments, blanks, and non-numeric values", () => {
    const ports = parsePortsEnv("# x\n\nREDIS_PORT=25203\nNOPE=abc\nLOW_PORT=500\n");
    expect(ports.REDIS_PORT).toBe(25203);
    expect(ports.NOPE).toBeUndefined();
  });
});

describe("discoverDropins — the concept", () => {
  it("3. discovers EVERY *_PORT service, not a hardcoded 4", () => {
    const all = discoverDropins(REAL);
    expect(all.length).toBeGreaterThan(10); // the estate has many services
    const ids = new Set(all.map((d) => d.id));
    expect(ids.has("qdrant")).toBe(true);
    expect(ids.has("hindsight")).toBe(true);
    expect(ids.has("kafka")).toBe(true);
    expect(ids.has("redis")).toBe(true);
  });
  it("4. each drop-in carries envVar BUN_<NAME>_PORT + a resolved port", () => {
    const all = discoverDropins(REAL);
    for (const d of all) {
      expect(d.envVar).toMatch(/^BUN_[A-Z0-9_]+_PORT$/);
      expect(d.port).toBeGreaterThanOrEqual(25000);
      expect(d.id).toBeTruthy();
    }
  });
  it("5. qdrant resolves BUN_QDRANT_HTTP_PORT + BUN_QDRANT_GRPC_PORT", () => {
    const vars = discoverDropins(REAL).map((d) => d.envVar);
    expect(vars).toContain("BUN_QDRANT_HTTP_PORT");
    expect(vars).toContain("BUN_QDRANT_GRPC_PORT");
  });
  it("6. redis resolves BUN_REDIS_PORT from REDIS_PORT", () => {
    const envs = discoverDropins(REAL).map((d) => d.envVar);
    expect(envs).toContain("BUN_REDIS_PORT");
  });
  it("7. infraDropins returns the four infra tiers (distinct ids, all endpoints)", () => {
    const inf = infraDropins(REAL);
    // distinct infra services — multiple endpoints share an id (qdrant_http/grpc)
    expect([...new Set(inf.map((d) => d.id))].sort()).toEqual(["hindsight", "kafka", "qdrant", "redis"]);
    // and qdrant carries its multi-endpoint vars
    expect(inf.some((d) => d.id === "qdrant" && d.envVar === "BUN_QDRANT_GRPC_PORT")).toBe(true);
  });
  it("8. renderDropinsToml produces BUN_* = 'port' lines", () => {
    const inf = infraDropins(REAL);
    const toml = renderDropinsToml(inf);
    expect(toml).toContain('BUN_QDRANT_HTTP_PORT = "');
    expect(toml).toContain('BUN_REDIS_PORT = "');
  });
});