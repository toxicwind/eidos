#!/usr/bin/env bun
/**
 * apply.ts — bring an existing pen repo into the thin-coordinator scaffold.
 * TS port of apply.sh (shell scripts retired: runtime language is Bun/TS).
 *
 * MAXIMALLY NON-DESTRUCTIVE: dry-run by default (prints what it would do,
 * moves nothing). Use --apply to execute; moves only, never deletes;
 * archives litter inside the pen; git-stashes WIP before every move so
 * nothing is ever lost.
 *
 * Usage: bun apply.ts <pen-name>                (dry-run, safe to re-run)
 *        bun apply.ts <pen-name> --apply        (execute moves)
 *        bun apply.ts --pen /home/toxic/pens/X  (explicit pen dir; dry-run)
 */
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const BIN = dirname(fileURLToPath(import.meta.url));
const REORG = join(BIN, "reorganize-pen.ts");

type Args = { penName: string; penDir: string; apply: boolean };

function parseArgs(argv: string[]): Args | never {
	let penName = "";
	let penDir = "";
	let apply = false;
	const rest: string[] = [];
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i]!;
		if (a === "--apply") apply = true;
		else if (a === "--dry-run") continue;
		else if (a === "--pen") penDir = argv[++i] ?? "";
		else if (a.startsWith("--pen=")) penDir = a.slice(6);
		else rest.push(a);
	}
	penName = penName || rest[0] || "";
	if (!penDir) penDir = `/home/toxic/pens/${penName}`;
	return { penName: penName || penDir.split("/").pop() || "", penDir, apply };
}

const { penName, penDir, apply } = parseArgs(process.argv.slice(2));

if (!penDir || !existsSync(penDir)) {
	console.error(`pen dir not found: ${penDir}`);
	process.exit(2);
}
if (!existsSync(REORG)) {
	console.error(`reorganize-pen.ts not found: ${REORG}`);
	process.exit(2);
}

const proc = Bun.spawn(
	["bun", "run", REORG, penName, ...(apply ? ["--apply"] : [])],
	{ stdout: "inherit", stderr: "inherit" },
);
const code = await proc.exited;
if (code !== 0) process.exit(code);

console.log(`==> post-move audit:`);
const audit = Bun.spawn([join(BIN, "audit-pen.ts"), penName], {
	stdout: "inherit",
	stderr: "inherit",
});
const auditCode = await audit.exited;
if (auditCode !== 0) {
	console.log("audit reported issues above (non-fatal)");
}

// ── auto-push (kairos sweeper): applied trees must never be left uncommitted.
// Only on --apply; dry-run never pushes. Detached: kairos owns retries/dead-letter.
if (apply) {
	console.log(`==> auto-push sweep (kairos detached):`);
	const kairos = Bun.spawn(
		[
			"kairos",
			"run",
			"--id",
			`scaffold-push-${penName}-${Date.now()}`,
			"--",
			"bun",
			join(BIN, "push-sweep.ts"),
			"--repos",
			penDir,
			"--message",
			`scaffold: apply ${penName} (auto-push)`,
		],
		{ stdout: "inherit", stderr: "inherit" },
	);
	await kairos.exited;
}
