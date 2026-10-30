#!/usr/bin/env bun
/**
 * ssot-sync.ts — import this pen's config files into
 * /home/toxic/pens/estate/config/<product> as the canonical SSOT (moving the
 * real file, symlinking back). TS port of ssot-sync.sh; delegates to the
 * estate-ops reconciler.
 *
 * Usage: bun ssot-sync.ts
 */
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const BIN = dirname(fileURLToPath(import.meta.url));
const PENS_ROOT = join(BIN, "..", "..", "..");
const SSOT_SCRIPT =
	process.env.SSOT_SCRIPT ??
	join(PENS_ROOT, "estate", "products", "estate-ops", "ssot-scaffold.sh");

if (existsSync(SSOT_SCRIPT)) {
	const proc = Bun.spawn(["bash", SSOT_SCRIPT, "--apply"], {
		stdout: "inherit",
		stderr: "inherit",
	});
	process.exit(await proc.exited);
}

console.error(`ssot-scaffold.sh not found at ${SSOT_SCRIPT}`);
process.exit(1);
