#!/usr/bin/env bun
/**
 * manifest-sync.ts — regenerate the estate bin manifest + verify all links.
 * TS port of manifest-sync.sh.
 *
 * Usage: bun manifest-sync.ts
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ESTATE_OPS =
	process.env.ESTATE_OPS ?? "/home/toxic/pens/barn/estate-ops";
const GEN = join(ESTATE_OPS, "bin", "manifest-gen.py");
const VERIFY = join(ESTATE_OPS, "bin-verify.sh");
const MANIFEST = join(ESTATE_OPS, "bin", "manifest.yaml");

const gen = Bun.spawn(["python3", GEN], { stdout: "inherit", stderr: "inherit" });
if ((await gen.exited) !== 0) process.exit(1);

const verify = Bun.spawn(["bash", VERIFY], { stdout: "inherit", stderr: "inherit" });
if ((await verify.exited) !== 0) process.exit(1);

if (existsSync(MANIFEST)) {
	const entries = readFileSync(MANIFEST, "utf8").match(/^\s*-\s+name:/gm)?.length ?? 0;
	console.log(`manifest regenerated + verified: ${entries} entries`);
}
