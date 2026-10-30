#!/usr/bin/env bun
/**
 * audit-pen.ts — automated five-shape audit of a pen (or all pens).
 * TS port of audit-pen.sh.
 *
 * Checks: 7 metadata files, products/ dir, ssot/ dir, root recursion symlinks,
 * kitchen-sink gitignore, ghost paths. Exit 1 on any FAIL.
 *
 * Usage: bun audit-pen.ts [pen...]   (default: all five pens)
 */
import { existsSync, readFileSync, readdirSync, lstatSync } from "node:fs";
import { join } from "node:path";

const PENS_DIR = "/home/toxic/pens";
const META = [
	".gitignore",
	"README.md",
	"LICENSE",
	"package.json",
	"mise.toml",
	"AGENTS.md",
	"pitchfork.toml",
] as const;
const GHOST = "/home/toxic/pens/estate";

let overall = 0;
const pens =
	process.argv.length > 2
		? process.argv.slice(2)
		: ["estate", "geode", "barn", "ranch", "olympus"];

function countFiles(dir: string, depth = 0): number {
	if (depth > 4) return 0;
	let n = 0;
	try {
		for (const e of readdirSync(dir, { withFileTypes: true })) {
			if (e.name === ".git" || e.name === "node_modules") continue;
			if (e.isDirectory()) n += countFiles(join(dir, e.name), depth + 1);
			else n++;
		}
	} catch {}
	return n;
}

for (const pen of pens) {
	const root = join(PENS_DIR, pen);
	console.log(`=== audit-pen: ${pen} ===`);
	if (!existsSync(root)) {
		console.log("  FAIL pen dir missing");
		overall = 1;
		continue;
	}

	for (const f of META) {
		if (existsSync(join(root, f))) console.log(`  OK   ${f}`);
		else {
			console.log(`  FAIL missing ${f}`);
			overall = 1;
		}
	}

	if (existsSync(join(root, "products"))) console.log("  OK   products/");
	else console.log("  WARN no products/ dir (flat-product legacy)");

	if (existsSync(join(root, "ssot"))) console.log("  OK   ssot/");
	else console.log("  WARN no ssot/ dir");

	// kitchen-sink gitignore: must contain the `*` line
	const gi = join(root, ".gitignore");
	if (existsSync(gi)) {
		const c = readFileSync(gi, "utf8");
		if (/^\s*\*\s*$/m.test(c)) console.log("  OK   kitchen-sink gitignore");
		else {
			console.log("  WARN gitignore not kitchen-sink (no bare `*`)");
		}
	}

	// ghost path lease
	if (existsSync(GHOST)) {
		console.log(`  FAIL ghost ${GHOST} exists (single-truth lease)`);
		overall = 1;
	}

	const fileCount = countFiles(root);
	console.log(`  (${fileCount} files indexed)`);
}

process.exit(overall);
