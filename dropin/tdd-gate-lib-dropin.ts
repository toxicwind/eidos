/**
 * tdd-gate-lib-dropin.ts — night-market's TDD/BDD Iron-Law gate, ported to
 * Bun/TS as an eidos drop-in library.
 *
 * The Iron Law: NO IMPLEMENTATION WITHOUT A FAILING TEST FIRST.
 * Borrowed from claude-night-market/plugins/imbue/hooks/tdd_bdd_gate.py
 * (python → TS). Given a Write/Edit target path, decides whether the write
 * is gated: implementation files require a co-located failing test.
 *
 * USAGE:
 *   import { tddGate } from "<eidos>/dropin/tdd-gate-lib-dropin.ts";
 *   const verdict = tddGate({ path: "src/feature.ts", op: "write" });
 *   if (verison.blocked) writeTestFirst(verison.reason);
 */
import { existsSync } from "node:fs";
import { ok, err, type Result } from "neverthrow";

export interface GateVerdict {
	blocked: boolean;
	reason: string;
	implPath: string;
	testPath?: string;
	kind: "impl" | "test" | "non-code" | "docs";
}

const IMPL_RE = /\.(ts|tsx|js|mjs|py)$/;
const TEST_RE = /(\.test\.|_test\.|\.spec\.|_spec\.|\/tests?\/)/;

/** Co-located test-path candidates for an implementation file. */
export function testCandidatesFor(implPath: string): string[] {
	const base = implPath.replace(/\.(ts|tsx|js|mjs|py)$/, "");
	return [
		base.replace(/\/src\//, "/test/") + ".test.ts",
		base + ".test.ts",
		base + "_test.ts",
		base.replace(/\/src\//, "/tests/") + ".spec.ts",
		base + ".spec.ts",
	];
}

export function tddGate(input: {
	path: string;
	op: "write" | "edit";
	hasFailingTest?: boolean;
}): Result<GateVerdict, Error> {
	const { path, op, hasFailingTest } = input;
	if (!path) return err(new Error("path required"));

	// docs / non-code are never gated
	if (!IMPL_RE.test(path)) {
		return ok({ blocked: false, reason: "non-code — not gated", implPath: path, kind: "non-code" });
	}
	// test files themselves are never gated (they ARE the red)
	if (TEST_RE.test(path) || /\/tests?\//.test(path)) {
		return ok({ blocked: false, reason: "test file — the red itself", implPath: path, kind: "test" });
	}

	// find a co-located test
	const candidates = testCandidatesFor(path);
	const testPath = candidates.find((c) => existsSync(c));
	if (!testPath) {
		return ok({
			blocked: true,
			reason: `IRON LAW: no failing test exists for ${path}. Write the test FIRST (red), then implement (green). Candidates tried: ${candidates.slice(0, 2).join(", ")}`,
			implPath: path,
			kind: "impl",
		});
	}

	if (hasFailingTest === false) {
		return ok({
			blocked: true,
			reason: `IRON LAW: test ${testPath} exists but is not failing — write a NEW failing test for the change first.`,
			implPath: path,
			testPath,
			kind: "impl",
		});
	}

	return ok({
		blocked: false,
		reason: `test-first satisfied (${testPath})`,
		implPath: path,
		testPath,
		kind: "impl",
	});
}
