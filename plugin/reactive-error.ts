/**
 * reactive-error.ts — hephaistos agentic reactive plugin: on tool error,
 * classify the failure family, spawn a rig agent diagnosis call, ledger the
 * receipt. Pattern borrows: devloop hook-payload, oracle bidder reaction
 * channel, hephaistos definePlugin consent contract.
 */
import { existsSync, appendFileSync } from "node:fs";

export interface HookPayload {
	hook_event_name?: unknown;
	tool_name?: unknown;
	tool_input?: unknown;
	tool_response?: unknown;
	session_id?: unknown;
	[key: string]: unknown;
}

export type ReactionClass =
	| "kernel-death"
	| "tool-deny"
	| "patch-miss"
	| "network"
	| "unknown";

export interface ReactiveDecision {
	reacted: boolean;
	reactionClass?: ReactionClass;
	diagnosis?: string;
	agentCall?: { agent: string; prompt: string };
}

export interface ReactiveOpts {
	dryRun?: boolean;
	ledgerPath?: string;
	rateLimitMs?: number;
	/** injectable rig-agent caller — defaults to the hephaistos completions bridge */
	agentCall?: (prompt: string) => Promise<string>;
}

type Family = { cls: ReactionClass; re: RegExp; diagnosis: string; agent: string };

/** Failure families mined from the 2026-10-30 session dataframe (14,115 rows). */
const FAMILIES: Family[] = [
	{
		cls: "kernel-death",
		re: /eval cell aborted|kernel (died|shutdown|was killed|interrupted)/i,
		diagnosis:
			"Eval kernel died mid-cell — state was not restored. Re-run setup; do NOT retry the identical cell. Break the cell into smaller steps.",
		agent: "finch",
	},
	{
		cls: "tool-deny",
		re: /TAU_DENIED_TOOLS|denied by tools\.approval/i,
		diagnosis:
			"Tool denied by policy — the denial is doctrine, not a bug. Use the sanctioned equivalent (glob/ffs/proc-walk); never edit config to bypass.",
		agent: "forge",
	},
	{
		cls: "patch-miss",
		re: /No operations were applied|Failed to find expected lines/i,
		diagnosis:
			"Patch anchor stale — a concurrent writer changed the file (pseudo-subagent race). Re-read, fold forward, re-anchor surgically.",
		agent: "forge",
	},
	{
		cls: "network",
		re: /ECONNRESET|ECONNREFUSED|socket connection was closed|fetch failed/i,
		diagnosis:
			"Network transport failure — retry with backoff; check whether the front door is alive while the exec lane is broken (route contract).",
		agent: "finch",
	},
];

const RATE_LIMIT_DEFAULT_MS = 30_000;

export function reactiveErrorPlugin(opts: ReactiveOpts = {}) {
	const ledgerPath = opts.ledgerPath ?? "/home/toxic/.local/share/eidos/reactive-error-ledger.jsonl";
	const rateLimitMs = opts.rateLimitMs ?? RATE_LIMIT_DEFAULT_MS;
	const lastReactionAt = new Map<ReactionClass, number>();
	let reactionsFired = 0;
	let rateLimitSkips = 0;

	async function defaultAgentCall(prompt: string): Promise<string> {
		// hephaistos completions bridge (the REAL LLM lane)
		const proc = Bun.spawn(
			["bun", "/home/toxic/pens/olympus/products/hephaistos/packages/cli/src/complete-bridge.mjs", prompt],
			{ stdout: "pipe", stderr: "pipe", timeout: 60_000 },
		);
		return await new Response(proc.stdout).text();
	}

	const callAgent = opts.agentCall ?? defaultAgentCall;

	function classify(errorText: string): Family | null {
		for (const f of FAMILIES) {
			if (f.re.test(errorText)) return f;
		}
		return null;
	}

	async function postTool(payload: HookPayload): Promise<ReactiveDecision> {
		// only react to error-shaped responses
		const resp = payload.tool_response;
		let errorText = "";
		if (typeof resp === "string") errorText = resp;
		else if (resp && typeof resp === "object") {
			const r = resp as Record<string, unknown>;
			if (r.error !== undefined) errorText = String(r.error);
			else if (r.isError === true) errorText = JSON.stringify(resp);
		}
		if (!errorText) return { reacted: false };

		const family = classify(errorText);
		if (!family) return { reacted: false };

		// rate-limit per family (agent storms are the failure mode this prevents)
		const now = Date.now();
		const last = lastReactionAt.get(family.cls) ?? 0;
		if (now - last < rateLimitMs) {
			rateLimitSkips++;
			return { reacted: false };
		}
		lastReactionAt.set(family.cls, now);

		const prompt = `[reactive-error:${family.cls}] ${errorText.slice(0, 400)}\nDiagnose root cause + prescribe the fix pattern. One paragraph.`;
		let diagnosis = family.diagnosis;
		if (!opts.dryRun) {
			try {
				const out = await callAgent(prompt);
				if (out.trim()) diagnosis = out.trim();
			} catch {
				// keep the static diagnosis — the ledger records the attempted call regardless
			}
		}
		reactionsFired++;

		const agentCall = { agent: family.agent, prompt: prompt.slice(0, 200) };
		try {
			appendFileSync(
				ledgerPath,
				JSON.stringify({
					ts: new Date().toISOString(),
					tool: payload.tool_name,
					reactionClass: family.cls,
					diagnosis: diagnosis.slice(0, 300),
					agentCall,
					dryRun: Boolean(opts.dryRun),
				}) + "\n",
			);
		} catch {}
		void agentCall; // receipt recorded; dry-run skips the live call

		return { reacted: true, reactionClass: family.cls, diagnosis, agentCall };
	}

	return {
		postTool,
		stats: () => ({ reactionsFired, rateLimitSkips }),
	};
}
