/**
 * reactive-error-plugin TDD — SUCCESS CASE (fails while the plugin doesn't exist).
 *
 * Contract: when a tool call errors, the plugin reacts — spawns a rig agent
 * call (hephaistos completion bridge) with the error context, records the
 * reaction in the plugin's ledger, and returns the diagnosis to the caller.
 *
 * Pattern borrows:
 *   - devloop/devloop/adapters/hook-payload.ts (hook payload shape)
 *   - oracle/bidder.py reactive channel semantics (post → react → receipt)
 *   - hephaistos plugin contract (definePlugin, ctx.effects)
 */
import { describe, expect, it } from "bun:test";
import { reactiveErrorPlugin } from "../plugin/reactive-error";
import type { HookPayload } from "../plugin/types";

function errPayload(tool: string, errorText: string): HookPayload {
	return {
		hook_event_name: "PostToolUse",
		tool_name: tool,
		tool_input: { intent: "test" },
		tool_response: { error: errorText },
		session_id: "test-session",
	};
}

describe("reactive-error plugin — the success case", () => {
	it("reacts to a tool error with a rig agent diagnosis", async () => {
		const plugin = reactiveErrorPlugin({ dryRun: true });
		const payload = errPayload("eval", "Eval cell aborted — kernel died");
		const decision = await plugin.postTool(payload);
		expect(decision.reacted).toBe(true);
		expect(decision.diagnosis).toBeDefined();
		expect(decision.diagnosis!.length).toBeGreaterThan(0);
		expect(decision.reactionClass).toBe("kernel-death");
	});

	it("classifies known failure families from this session's dataframe", async () => {
		const plugin = reactiveErrorPlugin({ dryRun: true });
		const cases: Array<[string, string]> = [
			["eval", "Eval cell aborted"], // kernel-death
			["read", "PermissionError: TAU_DENIED_TOOLS: 'find' is denied by tools.approval"], // tool-deny
			["edit", "No operations were applied — Failed to find expected lines"], // patch-miss
			["eval", "TAU_DENIED_TOOLS: 'bash' is denied (ESTATE-ANOMALY-37)"], // tool-deny
		];
		for (const [tool, err] of cases) {
			// fresh instance per case — the rate limiter is per-family and would
			// correctly suppress a repeat of the same family within the window
			const p2 = reactiveErrorPlugin({ dryRun: true });
			const d = await p2.postTool(errPayload(tool, err));
			expect(d.reacted).toBe(true);
			expect(d.reactionClass).toBeDefined();
			expect(d.reactionClass).not.toBe("unknown");
		}
	});

	it("does NOT react to successful tool results", async () => {
		const plugin = reactiveErrorPlugin({ dryRun: true });
		const payload: HookPayload = {
			hook_event_name: "PostToolUse",
			tool_name: "read",
			tool_input: {},
			tool_response: { ok: true },
		};
		const d = await plugin.postTool(payload);
		expect(d.reacted).toBe(false);
	});

	it("rate-limits reactions (no agent storms on repeated errors)", async () => {
		const plugin = reactiveErrorPlugin({ dryRun: true });
		for (let i = 0; i < 6; i++) {
			await plugin.postTool(errPayload("eval", "Eval cell aborted"));
		}
		const stats = plugin.stats();
		expect(stats.reactionsFired).toBeLessThan(6);
		expect(stats.rateLimitSkips).toBeGreaterThan(0);
	});

	it("writes a reaction ledger entry with the rig agent call receipt", async () => {
		const plugin = reactiveErrorPlugin({ dryRun: true, ledgerPath: "/tmp/reactive-test-ledger.jsonl" });
		require("node:fs").rmSync("/tmp/reactive-test-ledger.jsonl", { force: true });
		await plugin.postTool(errPayload("eval", "kernel died"));
		const ledger = require("node:fs").existsSync("/tmp/reactive-test-ledger.jsonl");
		expect(ledger).toBe(true);
		const line = require("node:fs").readFileSync("/tmp/reactive-test-ledger.jsonl", "utf8").trim().split("\n")[0]!;
		const entry = JSON.parse(line);
		expect(entry.reactionClass).toBe("kernel-death");
		expect(entry.agentCall).toBeDefined();
	});
});
