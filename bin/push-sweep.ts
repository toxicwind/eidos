#!/usr/bin/env bun
/**
 * push-sweep.ts — kairos background sweeper: commit+push every repo a scaffold
 * apply touched. The apply pipeline's flaw was leaving applied trees uncommitted;
 * this closes that hole autonomously.
 *
 * Usage: bun push-sweep.ts --repos /path/a /path/b ... [--message "scaffold: apply"]
 *
 * Per repo (sequential, isolated failures):
 *   1. git add -A
 *   2. git commit (skip if nothing staged)
 *   3. secretsmith exec --only GITHUB_TOKEN -- git push origin HEAD
 *   4. on failure: retry x2 with backoff, then dead-letter to squawk #fleet-claims
 *
 * Exit 0 iff every repo pushed (or had nothing to push).
 */
import { existsSync, readFileSync } from "node:fs";

type RepoResult = {
	repo: string;
	action: "pushed" | "nothing-to-push" | "failed";
	detail: string;
};

const GITHUB_TOKEN_URL = (repo: string, tok: string) => {
	// derive https push URL from the repo's origin
	const origin = Buffer.from(
		Bun.spawnSync(["git", "-C", repo, "remote", "get-url", "origin"], { stdout: "pipe" }).stdout,
	).toString().trim();
	if (origin.includes("x-access-token:") || origin.includes("@")) return origin; // already credentialed
	return origin.replace("https://github.com/", `https://x-access-token:${tok}@github.com/`);
};

function deadLetter(msg: string): void {
	try {
		const dir = "/home/toxic/.squawk-bus/squawk-root/rooms/fleet-claims";
		if (!existsSync(dir)) return;
		const name = `${Date.now()}-scaffold-push-sweep.md`;
		Bun.write(`${dir}/${name}`, `# scaffold push-sweep dead letter\n\n${msg}\n`);
	} catch {}
}

async function pushRepo(repo: string, message: string): Promise<RepoResult> {
	if (!existsSync(`${repo}/.git`)) {
		return { repo, action: "failed", detail: "not a git repo" };
	}
	const sh = (args: string[]) => {
		const p = Bun.spawnSync(args, { stdout: "pipe", stderr: "pipe" });
		return { code: p.exitCode, out: Buffer.from(p.stdout).toString(), err: Buffer.from(p.stderr).toString() };
	};

	// 1. stage everything
	sh(["git", "-C", repo, "add", "-A"]);

	// 2. commit if staged
	const st = sh(["git", "-C", repo, "status", "--porcelain"]);
	if (!st.out.trim()) {
		return { repo, action: "nothing-to-push", detail: "clean tree" };
	}
	const cm = sh(["git", "-C", repo, "commit", "-m", message]);
	if (cm.code !== 0) {
		return { repo, action: "failed", detail: cm.err.slice(0, 300) };
	}

	// 3. push with keyring credential injection (3 tries, backoff)
	const tokProc = Bun.spawnSync(["secretsmith", "get", "GITHUB_TOKEN", "--show"], { stdout: "pipe" });
	const tokText = Buffer.from(tokProc.stdout).toString();
	const tok = tokText.match(/secret: (\S+)/)?.[1] ?? "";
	if (!tok) {
		return { repo, action: "failed", detail: "no GITHUB_TOKEN in keyring" };
	}
	const url = GITHUB_TOKEN_URL(repo, tok);
	for (let attempt = 1; attempt <= 3; attempt++) {
		const push = sh(["git", "-C", repo, "push", url, "HEAD"]);
		if (push.code === 0) {
			return { repo, action: "pushed", detail: "ok" };
		}
		const e = (push.err + push.out).slice(0, 300);
		// fetch-first rejection → fold forward
		if (e.includes("fetch first") || e.includes("rejected")) {
			sh(["git", "-C", repo, "pull", "--rebase"]);
			continue;
		}
		if (attempt < 3) await Bun.sleep(2000 * attempt);
		else return { repo, action: "failed", detail: e };
	}
	return { repo, action: "failed", detail: "retries exhausted" };
}

// ── CLI ──
const argv = process.argv.slice(2);
const reposIdx = argv.indexOf("--repos");
const msgIdx = argv.indexOf("--message");
const message = msgIdx >= 0 ? argv[msgIdx + 1]! : "scaffold: apply push-sweep";
const repos: string[] = [];
if (reposIdx >= 0) {
	for (let i = reposIdx + 1; i < argv.length && !argv[i]!.startsWith("--"); i++) {
		repos.push(argv[i]!);
	}
}
if (repos.length === 0) {
	console.error("Usage: bun push-sweep.ts --repos <dir>... [--message msg]");
	process.exit(2);
}

const results: RepoResult[] = [];
for (const repo of repos) {
	results.push(await pushRepo(repo, message));
}

const failed = results.filter((r) => r.action === "failed");
for (const r of results) {
	console.log(`${r.action.padEnd(16)} ${r.repo} — ${r.detail.slice(0, 120)}`);
}
if (failed.length > 0) {
	deadLetter(failed.map((r) => `${r.repo}: ${r.detail}`).join("\n"));
	console.error(`push-sweep: ${failed.length} failed (dead-lettered to #fleet-claims)`);
	process.exit(1);
}
