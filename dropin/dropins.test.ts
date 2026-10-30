import { describe, expect, it } from "bun:test";
import { tddGate, testCandidatesFor } from "../dropin/tdd-gate-lib-dropin.ts";
import { indexRigSkills, matchRigSkill } from "../dropin/rig-skills-lib-dropin.ts";
import { normalizeToolInput, isToolError } from "../dropin/tdd-adapter-lib-dropin.ts";

describe("tdd-gate dropin (night-market port)", () => {
  it("blocks impl writes with no co-located test", () => {
    const v = tddGate({ path: "/tmp/no-such-src/feature.ts", op: "write" });
    expect(v.isOk()).toBe(true);
    expect(v.value.blocked).toBe(true);
    expect(v.value.kind).toBe("impl");
  });
  it("never blocks test files themselves", () => {
    const v = tddGate({ path: "/x/test/feature.test.ts", op: "write" });
    expect(v.value.blocked).toBe(false);
    expect(v.value.kind).toBe("test");
  });
  it("never blocks docs", () => {
    const v = tddGate({ path: "/x/README.md", op: "write" });
    expect(v.value.kind).toBe("non-code");
  });
});

describe("rig-skills dropin (ring port)", () => {
  it("indexes ring skills (knowledge dropins)", () => {
    const r = indexRigSkills();
    expect(r.isOk()).toBe(true);
    expect(r.value.length).toBeGreaterThan(0);
  });
  it("matches a query to the best skill", () => {
    const r = matchRigSkill("test-driven development gate");
    expect(r.isOk()).toBe(true);
    expect(r.value).not.toBeNull();
  });
});

describe("tdd-adapter dropin (devloop port)", () => {
  it("normalizes tool input (devloop semantics)", () => {
    const ti = normalizeToolInput({ tool_input: { a: 1 }, session_id: "s1" });
    expect(ti.a).toBe(1);
    expect(ti.session_id).toBe("s1");
  });
  it("detects tool errors (feeds reactive-error)", () => {
    expect(isToolError({ tool_response: { error: "x" } })).toBe(true);
    expect(isToolError({ tool_response: { ok: 1 } })).toBe(false);
  });
});
