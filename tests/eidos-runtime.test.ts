/**
 * TDD contract for eidos-runtime — mise + pitchfork awareness.
 * Real-world: reads the actual ports.env SSOT; emits all three surfaces.
 */
import { describe, expect, it } from "bun:test";
import {
  nextFreePort, generateMiseToml, generatePitchforkStanza, generateDropinEnv, emitRuntimeWiring,
} from "../src/eidos-runtime.ts";

const REAL = require("fs").readFileSync("/home/toxic/pens/estate/config/ports.env", "utf8");

describe("eidos runtime wiring (mise + pitchfork aware)", () => {
  it("1. nextFreePort finds a free estate port from the real SSOT", () => {
    const p = nextFreePort(REAL);
    expect(p).toBeGreaterThanOrEqual(25200);
    expect(p).toBeLessThanOrEqual(25299);
    expect(REAL).not.toMatch(new RegExp(`=${p}\\b`));
  });
  it("2. generateMiseToml emits the gate set + ports.env SSOT import", () => {
    const toml = generateMiseToml({ name: "eidos-demo", entry: "src/index.ts" });
    expect(toml).toContain(`_.file = "/home/toxic/pens/estate/config/ports.env"`);
    expect(toml).toContain("[tasks.typecheck]");
    expect(toml).toContain("[tasks.validate]");
    expect(toml).toContain('bun = "latest"');
  });
  it("3. serving product → pitchfork daemon stanza with dashes + health_http", () => {
    const stanza = generatePitchforkStanza({ name: "my-svc", entry: "src/server.ts", serve: { kind: "mcp" } });
    expect(stanza).toContain('[daemons."my-svc"]');
    expect(stanza).toContain('auto = ["start"]');
    expect(stanza).toContain("retry = true");
    expect(stanza).toContain("ready_http = \"http://127.0.0.1:");
    expect(stanza).toContain("[daemons.\"my-svc\".health_http]");
    // the DAEMON ID is dashes-never-underscores (pitchfork convention);
    // underscore in the health_http TOML section suffix is fine.
    const ids = [...stanza.matchAll(/daemons\."([^"]+)"/g)].map((m) => m[1]);
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) expect(id).not.toContain("_");
  });
  it("4. non-serving product → no daemon stanza", () => {
    const stanza = generatePitchforkStanza({ name: "plain-lib", entry: "src/index.ts" });
    expect(stanza).toContain("no daemon stanza");
  });
  it("5. generateDropinEnv emits BUN_*_PORT from the real SSOT", () => {
    const env = generateDropinEnv();
    expect(env).toContain('BUN_QDRANT_HTTP_PORT = "25133"');
    expect(env).toContain('BUN_REDIS_PORT = "25203"');
    expect(env).toContain('BUN_KAFKA_PORT = "25144"');
  });
  it("6. emitRuntimeWiring returns all three surfaces", () => {
    const w = emitRuntimeWiring({ name: "full", entry: "src/server.ts", serve: { kind: "health" } });
    expect(w.miseToml).toContain("[tools]");
    expect(w.pitchforkStanza).toContain('[daemons."full"]');
    expect(w.dropinEnv).toContain("BUN_");
  });
});