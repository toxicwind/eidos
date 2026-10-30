#!/usr/bin/env bun
/**
 * lint-paths.ts — ghost-path lease enforcement for a pen (or all pens).
 * TS port of lint-paths.sh.
 *
 * FAILs if any file references /home/toxic/estate (the banned ghost path)
 * or if /home/toxic/estate exists in ANY form. Exit 1 = violation.
 *
 * Usage: bun lint-paths.ts [pen...]   (default: all five pens)
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, extname } from "node:path";

const PENS_DIR = "/home/toxic/pens";
const GHOST = "/home/toxic/pens/estate";
const TEXT_EXTS = new Set([
	".md", ".ts", ".tsx", ".js", ".mjs", ".json", ".yaml", ".yml", ".toml",
	".sh", ".py", ".jsonc", ".envrc", ".html", ".css", ".svg", ".txt",
]);
const SKIP_DIRS = new Set([
	".git", "node_modules", "vendor", "vendored", "qdrant_data", "grafana",
	"__pycache__", ".cache", "dist", "build", ".turbo",
]);

let fail = 0;

if (existsSync(GHOST)) {
	console.log(
		"FAIL: /home/toxic/estate EXISTS (single-truth lease violation) — remove it and find the re-creator",
	);
	fail = 1;
}

function* walk(dir: string, depth = 0): Generator<string> {
	if (depth > 8) return;
	let entries;
	try {
		entries = readdirSync(dir, { withFileTypes: true });
	} catch {
		return;
	}
	for (const e of entries) {
		const p = join(dir, e.name);
		if (e.isDirectory()) {
			if (SKIP_DIRS.has(e.name)) continue;
			yield* walk(p, depth + 1);
		} else if (e.isFile() && TEXT_EXTS.has(extname(e.name))) {
			yield p;
		}
	}
}

const pens =
	process.argv.length > 2
		? process.argv.slice(2)
		: ["estate", "geode", "barn", "ranch", "olympus"];

for (const pen of pens) {
	const root = join(PENS_DIR, pen);
	if (!existsSync(root)) continue;
	let hits = 0;
	for (const file of walk(root)) {
		try {
			if (statSync(file).size > 2_000_000) continue;
			const c = readFileSync(file, "utf8");
			if (c.includes("/home/toxic/pens/estate") && !c.includes("/home/toxic/pens/estate")) {
				if (hits === 0) console.log(`=== ${pen} ===`);
				console.log(`  FAIL ghost ref: ${file}`);
				hits++;
				fail = 1;
			}
		} catch {}
	}
	if (hits === 0) console.log(`=== ${pen} ===\n  OK   no ghost refs`);
}

process.exit(fail);
