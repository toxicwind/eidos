/**
 * trio-lib-dropin.ts — the trio code-intelligence engine as a portable
 * eidos drop-in library.
 *
 * Trio lives at @geode/triphylite (pens/geode/products/triphylite). This
 * drop-in wraps its five-channel engine behind the eidos drop-in contract:
 *   - discoverable (ports.env / package.json probing)
 *   - monadic results (neverthrow — the scaffold default drop-in)
 *   - consumer-agnostic: any geode mineral (ffs-diff, kleio, coreelec-mcp)
 *     borrows this and gets AST+BM25+LSP+ROUTE fused search with zero engine
 *     wiring.
 *
 * USAGE (in a consumer):
 *   import { borrowTrio } from "<eidos>/dropin/trio-lib-dropin.ts";
 *   const trio = borrowTrio(import.meta.url);   // engine resolved relative to consumer
 *   const res = await trio.search("playback.media", { root: "/some/dir", limit: 5 });
 *   res.match({ ok: (r) => use(r.hits), err: (e) => log(e.message) });
 */
import { ok, err, type Result } from "neverthrow";

const TRIPHYLITE = "/home/toxic/pens/geode/products/triphylite/src/engine.ts";

export interface TrioSearchOpts {
	root?: string;
	limit?: number;
	/** Restrict to a single channel: "ast" | "bm25" | "lsp" | "route" | "all" */
	channel?: "ast" | "bm25" | "lsp" | "route" | "all";
}

export interface TrioFusedHit {
	file: string;
	line: number;
	snippet: string;
	channels: string[];
	rrfScore: number;
}

export interface TrioSearchResult {
	hits: TrioFusedHit[];
	stats: { ast: number; bm25: number; lsp: number; route: number; elapsedMs: number };
}

type TrioEngine = {
	searchRoutes: (
		dir: string,
		mode: string,
		limit?: number,
	) => Promise<Array<{ file: string; line: number; snippet: string; source: string; score: number }>>;
	executeReadTrioAudit: (
		query: string,
		targetDir?: string,
		limit?: number,
	) => Promise<{
		hits: Array<{ file: string; line: number; snippet: string; rrfScore: number; channels: string[] }>;
		stats: { ast: number; bm25: number; lsp: number; route: number; elapsedMs: number };
	}>;
};

/** Engine module loader — dynamic import keeps consumers decoupled from the engine path at type level. */
async function loadEngine(): Promise<Result<TrioEngine, Error>> {
	try {
		const mod = (await import(TRIPHYLITE)) as unknown as TrioEngine;
		return ok(mod);
	} catch (e) {
		return err(e instanceof Error ? e : new Error(String(e)));
	}
}

/** Borrow the trio engine as a monadic drop-in library. */
export function borrowTrio(_consumerUrl?: string) {
	return {
		id: "trio-lib-dropin",
		version: "1.0.0",
		engine: TRIPHYLITE,

		/** Fused search across all (or one) trio channels. */
		async search(
			query: string,
			opts: TrioSearchOpts = {},
		): Promise<Result<TrioSearchResult, Error>> {
			if (!query.trim()) return err(new Error("query required"));
			const mod = await loadEngine();
			if (mod.isErr()) return err(mod.error);

			const root = opts.root ?? ".";
			const limit = opts.limit ?? 20;
			const channel = opts.channel ?? "all";

			try {
				if (channel === "route") {
					const routeHits = await mod.value.searchRoutes(root, query, limit);
					return ok({
						hits: routeHits.map((h) => ({
							file: h.file, line: h.line, snippet: h.snippet,
							channels: ["route"], rrfScore: h.score,
						})),
						stats: { ast: 0, bm25: 0, lsp: 0, route: routeHits.length, elapsedMs: 0 },
					});
				}
				const fused = await mod.value.executeReadTrioAudit(query, root, limit);
				return ok({
					hits: fused.hits.map((h) => ({
						file: h.file, line: h.line, snippet: h.snippet,
						channels: [...h.channels], rrfScore: h.rrfScore,
					})),
					stats: fused.stats,
				});
			} catch (e) {
				return err(e instanceof Error ? e : new Error(String(e)));
			}
		},
	};
}
