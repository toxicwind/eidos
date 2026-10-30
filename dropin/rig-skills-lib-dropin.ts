/**
 * rig-skills-lib-dropin.ts — ring's specialized-agent skills as eidos
 * knowledge drop-ins.
 *
 * ring (LerianStudio) ships 89 skills + 38 agents enforcing engineering
 * practices. This drop-in borrows the SKILL INDEX shape: a registry of
 * { id, trigger, summary } that consumers (kleio detectors, tau skills,
 * hephaistos plugins) consult when a failure-family fires.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { ok, err, type Result } from "neverthrow";

const RING = "/home/toxic/pens/ranch/products/ring";

export interface RigSkill {
	id: string;
	path: string;
	summary: string;
	trigger?: string;
}

/** Index ring's skills (the default/ team's SKILL.md files). */
export function indexRigSkills(
	root: string = join(RING, "default"),
): Result<RigSkill[], Error> {
	if (!existsSync(root)) {
		return err(new Error(`ring skills root missing: ${root}`));
	}
	const skills: RigSkill[] = [];
	function walk(dir: string, depth: number): void {
		if (depth > 4) return;
		let entries;
		try {
			entries = readdirSync(dir, { withFileTypes: true });
		} catch {
			return;
		}
		for (const e of entries) {
			const p = join(dir, e.name);
			if (e.isDirectory()) walk(p, depth + 1);
			else if (e.name === "SKILL.md") {
				try {
					const c = readFileSync(p, "utf8");
					const summary =
						c.match(/^summary:\s*(.+)$/m)?.[1] ??
						c.split("\n").filter((l) => l.trim() && !l.startsWith("#") && !l.startsWith("---"))[0] ??
						e.name;
					const trigger = c.match(/^trigger:\s*(.+)$/m)?.[1];
					skills.push({ id: e.name.replace(/\.md$/, ""), path: p, summary: summary.slice(0, 160), trigger });
				} catch {}
			}
		}
	}
	walk(root, 0);
	return ok(skills);
}

/** Match a failure/need to the best ring skill (simple trigger-substring rank). */
export function matchRigSkill(
	query: string,
	skills?: RigSkill[],
): Result<RigSkill | null, Error> {
	const list = skills ?? indexRigSkills().unwrapOr([]);
	let best: RigSkill | null = null;
	let bestScore = 0;
	for (const s of list) {
		const hay = `${s.id} ${s.trigger ?? ""} ${s.summary}`.toLowerCase();
		let score = 0;
		for (const word of query.toLowerCase().split(/\W+/).filter((w) => w.length > 3)) {
			if (hay.includes(word)) score++;
		}
		if (score > bestScore) {
			bestScore = score;
			best = s;
		}
	}
	return ok(best);
}
