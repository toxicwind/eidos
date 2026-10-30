import { describe, expect, it } from "bun:test";
import { agentRelaunch } from "../dropin/agent-relaunch-lib-dropin.ts";

describe("agent-relaunch dropin — daemon-aware relaunch (FAILS FIRST)", () => {
  it("discovers all pitchfork agent daemons via live state + /proc ground truth", async () => {
    const rel = agentRelaunch();
    const r = await rel.discover();
    expect(r.isOk()).toBe(true);
    const daemons = r.value;
    expect(daemons.length).toBeGreaterThan(50); // 90+ pitchfork daemons estate-wide
    // every daemon has ground-truth fields
    for (const d of daemons.slice(0, 5)) {
      expect(d.id).toBeTruthy();
      expect(["running", "stopped", "errored"]).toContain(d.status);
    }
  });

  it("diagnoses stopped/errored daemons with root-cause class", async () => {
    const rel = agentRelaunch();
    const r = await rel.discover();
    const sick = r.value.filter((d) => d.status !== "running");
    expect(sick.length).toBeGreaterThan(0); // the estate always has some
    const diag = await rel.diagnose(sick.slice(0, 3));
    expect(diag.isOk()).toBe(true);
    for (const d of diag.value) {
      expect(d.rootCause).toBeTruthy();
      expect(["ghost-path", "port-conflict", "binary-missing", "config-error", "probe-401-flap", "unknown"]).toContain(d.rootCause);
    }
  });

  it("relaunches a safely-relaunchable daemon and verifies health", async () => {
    const rel = agentRelaunch();
    const r = await rel.discover();
    const safe = r.value.find((d) => d.status === "stopped" && d.safeRelaunch);
    if (!safe) return; // honestly skip if nothing safely relaunchable right now
    const res = await rel.relaunch(safe.id);
    expect(res.isOk()).toBe(true);
    expect(res.value.restarted).toBe(true);
    expect(res.value.healthy).toBe(true);
  }, 60_000);
});
