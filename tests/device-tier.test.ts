/**
 * TDD contract for the DEVICE tier — every android entry drops into the ONE
 * shizuku-backed flotilla transport (not none, not ad-hoc adb).
 */
import { describe, expect, it } from "bun:test";
import { discoverDropins, deviceDropins, infraDropins } from "../src/scaffold-services.ts";

const REAL = require("fs").readFileSync("/home/toxic/pens/estate/config/ports.env", "utf8");

describe("device tier", () => {
  it("1. flotilla is a DEVICE-kind drop-in (shizuku-backed transport)", () => {
    const dev = deviceDropins(REAL);
    expect(dev.length).toBe(1);
    expect(dev[0].id).toBe("flotilla");
    expect(dev[0].kind).toBe("device");
    expect(dev[0].envVar).toBe("BUN_FLOTILLA_MCP_PORT");
    expect(dev[0].port).toBe(25245);
    expect(dev[0].clientHint).toMatch(/SHIZUKU/);
  });
  it("2. device tier is disjoint from the infra tiers", () => {
    const devIds = new Set(deviceDropins(REAL).map((d) => d.id));
    const infIds = new Set(infraDropins(REAL).map((d) => d.id));
    for (const id of devIds) expect(infIds.has(id)).toBe(false);
  });
  it("3. every drop-in still carries env+port (device tier included)", () => {
    const all = discoverDropins(REAL);
    expect(all.length).toBeGreaterThanOrEqual(5);
    for (const d of all) expect(d.port).toBeGreaterThanOrEqual(25000);
  });
});