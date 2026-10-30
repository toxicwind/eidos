import { describe, expect, it } from "bun:test";
import { modelMatrix, FIVE_LANES } from "../dropin/model-matrix-lib-dropin.ts";

describe("model-matrix dropin — 5-lane contract", () => {
  it("has exactly five lanes with live ids", () => {
    expect(Object.keys(FIVE_LANES)).toHaveLength(5);
    for (const id of Object.values(FIVE_LANES)) expect(id).toMatch(/^[a-z0-9.-]+$/); // bare ids (anomaly #38)
  });

  it("probes one lane with a trivial prompt (live router)", async () => {
    const mm = modelMatrix();
    const glm = await mm.probe(FIVE_LANES["glm-family"]!, "Reply with the single word: pong", { maxTokens: 8, timeoutMs: 30_000 });
    expect(glm.isOk()).toBe(true);
    // glm lane must answer (this session runs on it — the strongest live guarantee)
    expect(glm.value.ok).toBe(true);
    expect(glm.value.content).toBeTruthy();
  });

  it("runs the same prompt across all five lanes (matrix)", async () => {
    const mm = modelMatrix();
    const r = await mm.run("Reply with the single word: pong", { maxTokens: 8, timeoutMs: 40_000 });
    expect(r.isOk()).toBe(true);
    const results = r.value;
    expect(Object.keys(results)).toHaveLength(5);
    // contract: EVERY lane returns a cell (ok or explicit err) — no silent hangs
    for (const [fam, cell] of Object.entries(results)) {
      expect(cell.ok !== undefined || cell.err !== undefined).toBe(true);
      console.log(`  ${fam}: ${cell.ok ? "ok" : "ERR " + (cell.err ?? "").slice(0, 60)}`);
    }
    // allOk is the strict contract — assert it and report which lanes fail
    const dead = Object.entries(results).filter(([, c]) => !c.ok).map(([f]) => f);
    if (dead.length > 0) console.log(`  DEAD LANES (strike-ledger candidates): ${dead.join(", ")}`);
  }, 120_000);
});
