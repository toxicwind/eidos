import { describe, expect, it } from "bun:test";
import { agentRelaunch } from "../dropin/agent-relaunch-lib-dropin.ts";
import { ok } from "neverthrow";

describe("agent-relaunch — queue-aware relaunch (starter fail)", () => {
  it("detects a daemon in 429-concurrency flap and QUEUES the relaunch (backoff, no hammering)", async () => {
    const rel = agentRelaunch();
    // simulate: relaunch called while the lane is 429-limited
    const r = await rel.relaunchWithQueue("test-daemon", {
      isLimited: () => true,          // lane reports 429 concurrency_limit
      queueDelayMs: 50,               // test-speed backoff
      maxQueueAttempts: 3,
      relaunchFn: async () => ok({ restarted: true, healthy: true }),  // inject: the relaunch itself succeeds
    });
    expect(r.isOk()).toBe(true);
    expect(r.value.queued).toBe(true);
    expect(r.value.queueAttempts).toBeGreaterThanOrEqual(1);
    expect(r.value.queueAttempts).toBeLessThanOrEqual(3);
    // the queued relaunch must NOT have hammered: attempts <= max
    expect(r.value.hammered).toBe(false);
  }, 30_000);

  it("relaunches immediately when the lane is NOT limited", async () => {
    const rel = agentRelaunch();
    const r = await rel.relaunchWithQueue("test-daemon", {
      isLimited: () => false,
      queueDelayMs: 10,
      maxQueueAttempts: 3,
      relaunchFn: async () => ok({ restarted: true, healthy: true }),
    });
    expect(r.value.queued).toBe(false);
    expect(r.value.restarted).toBe(true);
  }, 30_000);
});
