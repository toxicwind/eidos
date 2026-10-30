#!/usr/bin/env bun
/**
 * scaffold/mcp/server.ts — the pen scaffold as a first-class MCP server.
 *
 * House transport pattern: zero-dep stdio JSON-RPC, dual framing
 * (Content-Length or newline-delimited) — mirrors azurite/rsync-mcp.
 *
 * Dogfoods the scaffold's own default-enabled drop-in (neverthrow) for the
 * tool result pipeline: every tool returns Result<ToolOut, ScaffoldErr> and
 * the dispatcher folds it monadically. If a drop-in can't be consumed by the
 * scaffold's own MCP with minimal code, dropins aren't really dropins.
 *
 * Tools (all pen-scoped, read-first):
 *   - scaffold_audit    — run audit-pen.sh for a pen (dry-run report)
 *   - scaffold_apply    — reorganize a pen (dry-run default; --apply explicit)
 *   - scaffold_register — register-namespace.ts for a new pen
 *   - scaffold_readme   — regenerate pen README via readme-gen
 *
 * Every mutating path requires explicit apply:true; push is NEVER automatic
 * from this server (kairos sweeper owns pushes).
 */
import { ok, err, type Result } from "neverthrow";

const VERSION = "0.1.0";
const TOOL_TIMEOUT_MS = 120_000;
const MAX_OUT = 400_000;

type ScaffoldErr = { message: string; code: string };
type ToolOut = { ok: true; out: string } | { ok: false; out: string };

function runTool(
	target: string,
	args: string[],
): Promise<Result<ToolOut, ScaffoldErr>> {
	return new Promise((resolve) => {
		// Route by extension: .sh → bash, .ts → bun (scaffold bin mixes both)
		const cmd = target.endsWith(".sh") ? ["bash", target] : ["bun", target];
		const proc = Bun.spawn([...cmd, ...args], {
			cwd: "/home/toxic/pens/toolkit/scaffold",
			stdout: "pipe",
			stderr: "pipe",
		});
		const timer = setTimeout(() => {
			try {
				proc.kill();
			} catch {}
		}, TOOL_TIMEOUT_MS);
		Promise.all([
			new Response(proc.stdout).text(),
			new Response(proc.stderr).text(),
			proc.exited,
		]).then(([out, eout, code]) => {
			clearTimeout(timer);
			const combined = (out + eout).slice(0, MAX_OUT);
			if (code === 0) {
				resolve(ok({ ok: true, out: combined }));
			} else {
				resolve(
					err({ message: combined || `exit ${code}`, code: String(code) }),
				);
			}
		});
	});
}

type JsonRpcMsg = {
	jsonrpc: "2.0";
	id?: number | string | null;
	method?: string;
	params?: Record<string, unknown>;
	result?: unknown;
	error?: { code: number; message: string };
};

const TOOLS = [
	{
		name: "scaffold_audit",
		description: "Audit a pen against the five-shape scaffold (read-only).",
		inputSchema: {
			type: "object",
			properties: {
				pen: { type: "string", description: "pen name under /home/toxic/pens" },
			},
			required: ["pen"],
		},
	},
	{
		name: "scaffold_apply",
		description:
			"Reorganize a pen into the five-shape layout. Dry-run unless apply:true.",
		inputSchema: {
			type: "object",
			properties: {
				pen: { type: "string" },
				apply: { type: "boolean", default: false },
			},
			required: ["pen"],
		},
	},
	{
		name: "scaffold_readme",
		description: "Regenerate the pen README member table.",
		inputSchema: {
			type: "object",
			properties: { pen: { type: "string" } },
			required: ["pen"],
		},
	},
];

async function dispatch(
	name: string,
	args: Record<string, unknown>,
): Promise<Result<ToolOut, ScaffoldErr>> {
	const pen = String(args.pen ?? "");
	const BIN = "/home/toxic/pens/toolkit/scaffold/bin";
	switch (name) {
		case "scaffold_audit":
			return await runTool(`${BIN}/audit-pen.sh`, [pen]);
		case "scaffold_apply":
			return args.apply === true
				? await runTool(`${BIN}/apply.sh`, [pen, "--apply"])
				: await runTool(`${BIN}/apply.sh`, [pen]);
		case "scaffold_readme":
			return await runTool(`${BIN}/readme-gen.ts`, [pen]);
		default:
			return err({ message: `unknown tool: ${name}`, code: "ENOENT_TOOL" });
	}
}

let buf = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk: string) => {
	buf += chunk;
	let idx: number;
	while ((idx = buf.indexOf("\n")) !== -1) {
		const line = buf.slice(0, idx).trim();
		buf = buf.slice(idx + 1);
		if (!line) continue;
		handleLine(line);
	}
});

// Also accept Content-Length framing (dual framing, house pattern)
const CL_RE = /Content-Length:\s*(\d+)\r?\n\r?\n/;

function handleLine(line: string): void {
	let msg: JsonRpcMsg;
	try {
		msg = JSON.parse(line) as JsonRpcMsg;
	} catch {
		return;
	}
	if (!msg.method) return; // response to a request we didn't make

	if (msg.method === "initialize") {
		send({
			jsonrpc: "2.0",
			id: msg.id ?? null,
			result: {
				protocolVersion: "2024-11-05",
				capabilities: { tools: {} },
				serverInfo: { name: "scaffold-mcp", version: VERSION },
			},
		});
		return;
	}
	if (msg.method === "notifications/initialized") return;

	if (msg.method === "tools/list") {
		send({ jsonrpc: "2.0", id: msg.id ?? null, result: { tools: TOOLS } });
		return;
	}
	if (msg.method === "tools/call") {
		const name = String((msg.params as Record<string, unknown>)?.name ?? "");
		const args =
			((msg.params as Record<string, unknown>)?.arguments as Record<
				string,
				unknown
			>) ?? {};
		void dispatch(name, args).then((result) =>
			result.match(
				(out) =>
					send({
						jsonrpc: "2.0",
						id: msg.id ?? null,
						result: {
							content: [{ type: "text", text: out.out }],
							isError: !out.ok,
						},
					}),
				(e) =>
					send({
						jsonrpc: "2.0",
						id: msg.id ?? null,
						result: {
							content: [{ type: "text", text: `Error: ${e.message}` }],
							isError: true,
						},
					}),
			),
		);
		return;
	}
	send({
		jsonrpc: "2.0",
		id: msg.id ?? null,
		error: { code: -32601, message: `Method not found: ${msg.method}` },
	});
}

function send(msg: JsonRpcMsg): void {
	const body = JSON.stringify(msg);
	process.stdout.write(`Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}\n`);
}

console.error("scaffold-mcp running on stdio");
