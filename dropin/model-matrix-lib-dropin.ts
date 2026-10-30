/**
 * model-matrix-lib-dropin.ts — 5-lane model contract matrix as an eidos
 * drop-in library. ANY test can assert "same call, same behavior" across the
 * estate's five provider families via the live router (rhodochrosite :25193).
 *
 * The five lanes (live ids verified 2026-10-30 from the router /v1/models):
 *   openai-family   — openai/gpt-oss-20b
 *   google-family   — google/diffusiongemma-26b-a4b-it
 *   deepseek-family — deepseek/deepseek-v4.1-flash-1017
 *   glm-family      — z-ai/glm-5.3-flash
 *   nvidia-family   — nvidia/llama-3.1-nemotron-safety-guard-8b-v3
 *
 * USAGE:
 *   import { modelMatrix } from "<eidos>/dropin/model-matrix-lib-dropin.ts";
 *   const mm = modelMatrix();
 *   const results = await mm.run(prompt, { timeoutMs: 25_000 });
 *   // results: { [family]: { ok, content?, err? } }
 *   expect(mm.allOk(results)).toBe(true);
 */
import { readFileSync } from "node:fs";
import { ok, err, type Result } from "neverthrow";

const ROUTER = "http://127.0.0.1:25193";
const KEY_FILE = "/home/toxic/.tau/rhodochrosite.key";

// BARE ids — the router's exec lane (anomaly #38: prefixed ids 404/ModelNotListed on
// completions; the /v1/models list is prefixed but completions want bare).
export const FIVE_LANES: Record<string, string> = {
	"openai-family": "gpt-oss-20b",
	"google-family": "diffusiongemma",
	"deepseek-family": "deepseek-v4.1-flash",
	"glm-family": "glm-5.3-flash",
	"nvidia-family": "nemotron-3.5-lightning",
};

export interface MatrixCell {
	ok: boolean;
	content?: string;
	err?: string;
	tokens?: number;
}

export interface MatrixResult {
	[family: string]: MatrixCell;
}

function readKey(): Result<string, Error> {
	try {
		const key = readFileSync(KEY_FILE, "utf8").trim();
		return key ? ok(key) : err(new Error("empty router key"));
	} catch (e) {
		return err(e instanceof Error ? e : new Error(String(e)));
	}
}

export function modelMatrix(opts: { router?: string; keyFile?: string } = {}) {
	const router = opts.router ?? ROUTER;
	return {
		id: "model-matrix-lib-dropin",
		version: "1.0.0",
		lanes: FIVE_LANES,

		/** Probe ONE model with ONE prompt. */
		async probe(
			model: string,
			prompt: string,
			probeOpts: { maxTokens?: number; timeoutMs?: number } = {},
		): Promise<Result<MatrixCell, Error>> {
			const key = readKey();
			if (key.isErr()) return err(key.error);
			const body = JSON.stringify({
				model,
				max_tokens: probeOpts.maxTokens ?? 120,
				messages: [{ role: "user", content: prompt }],
			});
			try {
				const res = await fetch(`${router}/v1/chat/completions`, {
					method: "POST",
					headers: { Authorization: `Bearer ${key.value}`, "Content-Type": "application/json" },
					body,
					signal: AbortSignal.timeout(probeOpts.timeoutMs ?? 25_000),
				});
				const d = (await res.json()) as {
					choices?: Array<{ message?: { content?: string } }>;
					usage?: { completion_tokens?: number };
				};
				const msg = d.choices?.[0]?.message ?? {};
				return ok({
					ok: true,
					content: (msg.content ?? "").slice(0, 200),
					tokens: d.usage?.completion_tokens,
				});
			} catch (e) {
				return ok({ ok: false, err: String(e instanceof Error ? e.message : e).slice(0, 120) });
			}
		},

		/** Run the SAME prompt across all five lanes. */
		async run(
			prompt: string,
			runOpts: { maxTokens?: number; timeoutMs?: number; lanes?: string[] } = {},
		): Promise<Result<MatrixResult, Error>> {
			const key = readKey();
			if (key.isErr()) return err(key.error);
			const lanes = runOpts.lanes ?? Object.keys(FIVE_LANES);
			const out: MatrixResult = {};
			const settled = await Promise.allSettled(
				lanes.map((fam) => this.probe(FIVE_LANES[fam]!, prompt, runOpts)),
			);
			lanes.forEach((fam, i) => {
				const s = settled[i]!;
				if (s.status === "fulfilled" && s.value.isOk()) out[fam] = s.value.value;
				else out[fam] = { ok: false, err: "probe failed" };
			});
			return ok(out);
		},

		/** All lanes behaved (returned a cell with ok=true). */
		allOk(results: MatrixResult): boolean {
			return Object.values(results).every((c) => c.ok);
		},
	};
}
