/**
 * tdd-adapter-lib-dropin.ts — devloop's hook-payload adapter as an eidos
 * drop-in library (Bun-native, verbatim shape borrow).
 *
 * devloop (compforge) ships the PreToolUse/PostToolUse hook contract:
 *   HookPayload { hook_event_name, tool_name, tool_input, cwd, session_id }
 *   preToolDecision(payload) → { hookSpecificOutput, systemMessage } | {}
 * Borrowed so eidos-parented products share ONE hook payload shape with the
 * devloop eval loop.
 */
export interface HookPayload {
	readonly hook_event_name?: unknown;
	readonly tool_name?: unknown;
	readonly tool_input?: unknown;
	readonly tool_response?: unknown;
	readonly cwd?: unknown;
	readonly session_id?: unknown;
	readonly model?: unknown;
	readonly [key: string]: unknown;
}

export interface HookHarness {
	readonly harness: "devloop" | "claude" | "codex";
}

export interface HookDecision {
	hookSpecificOutput?: {
		hookEventName: "PreToolUse" | "PostToolUse";
		permissionDecision?: "deny" | "allow" | "ask";
		permissionDecisionReason?: string;
	};
	systemMessage?: string;
}

/** Normalize a raw payload into a typed tool-input record (devloop semantics). */
export function normalizeToolInput(payload: HookPayload): Record<string, unknown> {
	const rawInput = payload.tool_input;
	const toolInput: Record<string, unknown> =
		rawInput !== null && typeof rawInput === "object" && !Array.isArray(rawInput)
			? { ...(rawInput as Record<string, unknown>) }
			: { input: String(rawInput ?? "") };
	if (typeof payload.session_id === "string") toolInput.session_id = payload.session_id;
	return toolInput;
}

/** PostToolUse error detection (the reactive-error plugin's feed). */
export function isToolError(payload: HookPayload): boolean {
	const resp = payload.tool_response;
	if (typeof resp === "string") return /error|denied|aborted|fail/i.test(resp);
	if (resp && typeof resp === "object") {
		const r = resp as Record<string, unknown>;
		return r.error !== undefined || r.isError === true;
	}
	return false;
}
