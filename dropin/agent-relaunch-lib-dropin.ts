/**
 * agent-relaunch-lib-dropin.ts — daemon-aware agent discovery/diagnosis/relaunch
 * as an eidos drop-in library.
 *
 * Ground truth doctrine: docs lie, /proc wins (eidos AGENTS.md rule 6).
 * Discovery = pitchfork state + /proc cmdline sweep. Diagnosis = root-cause
 * classes mined from the estate's anomaly program (#41 dir-ENOENT, #43 mise,
 * #5 front-door-vs-exec, #72 credit strikes, #48 ghost lease).
 *
 * USAGE:
 *   const rel = agentRelaunch();
 *   const daemons = await rel.discover();        // all pitchfork daemons, live
 *   const sick = daemons.value.filter(d => d.status !== "running");
 *   const diags  = await rel.diagnose(sick);     // root-cause each
 *   await rel.relaunch("geode/rhodochrosite");   // restart + health-verify
 */
import { existsSync, readFileSync, readdirSync, readlinkSync } from "node:fs";
import { ok, err, type Result } from "neverthrow";

export type DaemonStatus = "running" | "stopped" | "errored";

export interface Daemon {
	id: string;              // namespace/daemon-id (pitchfork form)
	status: DaemonStatus;
	pid?: number;
	port?: number;
	dir?: string;
	run?: string;
	/** true when relaunching is safe (retry daemons, non-critical) */
	safeRelaunch: boolean;
}

export type RootCause =
	| "ghost-path"
	| "port-conflict"
	| "binary-missing"
	| "config-error"
	| "probe-401-flap"
	| "unknown";

export interface Diagnosis {
	id: string;
	rootCause: RootCause;
	detail: string;
	fix: string;
}

const STATE_GLOB = "/home/toxic/.local/state/pitchfork/state.toml";

function readState(): Result<string, Error> {
	try {
		return ok(readFileSync(STATE_GLOB, "utf8"));
	} catch (e) {
		return err(e instanceof Error ? e : new Error(String(e)));
	}
}

/** Live /proc ground truth: is a pid with this daemon's marker actually running? */
function procAlive(marker: string): number | null {
	for (const pidDir of readdirSync("/proc").filter((d) => /^\d+$/.test(d))) {
		try {
			const cmd = readFileSync(`/proc/${pidDir}/cmdline`, "utf8").replace(/\0/g, " ");
			if (cmd.includes(marker) && !cmd.includes("grep") && !cmd.includes("log-sink")) {
				return Number(pidDir);
			}
		} catch {}
	}
	return null;
}

export function agentRelaunch() {
	return {
		id: "agent-relaunch-lib-dropin",
		version: "1.0.0",

		/** Discover every pitchfork daemon (state.toml + /proc). */
		async discover(): Promise<Result<Daemon[], Error>> {
			const state = readState();
			if (state.isErr()) return err(state.error);

			const daemons: Daemon[] = [];
			// parse [daemons."ns/id"] blocks
			const re = /\[daemons\."([^"]+)"\]([\s\S]*?)(?=\n\[|$)/g;
			let m: RegExpExecArray | null;
			while ((m = re.exec(state.value)) !== null) {
				const id = m[1]!;
				const block = m[2]!;
				const statusRaw = block.match(/status = "([^"]+)"/)?.[1] ?? "stopped";
				const status: DaemonStatus =
					statusRaw === "running" ? "running" : statusRaw === "errored" ? "errored" : "stopped";
				const run = block.match(/run = "([^"]+)"/)?.[1];
				const dir = block.match(/dir = "([^"]+)"/)?.[1];
				const portRaw = block.match(/port = (\d+)/)?.[1];
				const port = portRaw ? Number(portRaw) : undefined;

				// ground truth: a "stopped" daemon whose run marker is alive in /proc
				let pid: number | undefined;
				if (status === "running") {
					const marker = dir ?? run ?? "";
					if (marker) {
						const live = procAlive(marker.replace(/.*pens\//, "pens/"));
						pid = live ?? undefined;
						if (!live && status === "running") {
							// state lies — trust /proc
							daemons.push({ id, status: "stopped", port, dir, run, safeRelaunch: true });
							continue;
						}
					}
				}
				daemons.push({
					id, status, pid, port, dir, run,
					// relaunch-safe: retry-enabled infra lanes (routers, mcps, watch loops)
					safeRelaunch: /mcp|router|keepalive|watch|guard|bridge|keypool/.test(id),
				});
			}
			return ok(daemons);
		},

		/** Root-cause the sick daemons. */
		async diagnose(sick: Daemon[]): Promise<Result<Diagnosis[], Error>> {
			const out: Diagnosis[] = [];
			for (const d of sick.slice(0, 10)) {
				let rootCause: RootCause = "unknown";
				let detail = "";
				let fix = "restart via pitchfork";

				const run = d.run ?? "";
				if (run.includes("/home/toxic/estate/")) {
					rootCause = "ghost-path";
					detail = `run rooted at banned ghost: ${run.slice(0, 80)}`;
					fix = "repoint to /home/toxic/pens/estate + restart";
				} else if (run.includes("mise ") ) {
					rootCause = "config-error";
					detail = "mise pre-spawn (anomaly #43 class)";
					fix = "drop mise=true, absolute binary path";
				} else if (d.port) {
					// port conflict: something else holds the port
					try {
						const ss = Bun.spawnSync(["ss", "-tlnp"], { stdout: "pipe" });
						const ssOut = Buffer.from(ss.stdout).toString();
						if (ssOut.includes(`:${d.port} `)) {
							rootCause = "port-conflict";
							detail = `port ${d.port} held by another process`;
							fix = "kill stale holder or repoint port (ports.env SSOT)";
						}
					} catch {}
				}
				if (rootCause === "unknown" && d.dir && !existsSync(d.dir)) {
					rootCause = "binary-missing";
					detail = `dir ENOENT: ${d.dir}`;
					fix = "re-clone/rebuild the def path (anomaly #70 class)";
				}
				out.push({ id: d.id, rootCause, detail: detail || d.status, fix });
			}
			return ok(out);
		},

		/** Relaunch + verify health. */
		async relaunch(id: string): Promise<Result<{ restarted: boolean; healthy: boolean }, Error>> {
			const p = Bun.spawnSync(["pitchfork", "restart", id], { stdout: "pipe", stderr: "pipe", timeout: 120_000 });
			const restarted = p.exitCode === 0;
			let healthy = restarted;
			// health: daemon reports running after settle
			if (restarted) {
				await Bun.sleep(3000);
				const st = Bun.spawnSync(["pitchfork", "status", id], { stdout: "pipe" });
				healthy = /running/i.test(Buffer.from(st.stdout).toString());
			}
			return ok({ restarted, healthy });
		},

		/**
		 * Queue-aware relaunch: when the lane is concurrency-limited (429
		 * concurrency_limit_exceeded — the estate's most common inference stall),
		 * the relaunch QUEUES with backoff instead of hammering. The fallback
		 * chains must never retry-storm a limited lane.
		 */
		async relaunchWithQueue(
			id: string,
			opts: {
				isLimited?: () => boolean;
				queueDelayMs?: number;
				maxQueueAttempts?: number;
				/** injectable relaunch (tests); defaults to this.relaunch */
				relaunchFn?: (id: string) => Promise<Result<{ restarted: boolean; healthy: boolean }, Error>>;
			} = {},
		): Promise<
			Result<
				{ queued: boolean; queueAttempts: number; hammered: boolean; restarted: boolean; healthy: boolean },
				Error
			>
		> {
			const isLimited = opts.isLimited ?? (() => false);
			const queueDelayMs = opts.queueDelayMs ?? 1_000;
			const maxAttempts = opts.maxQueueAttempts ?? 5;

			// Queue semantics: backoff-wait while limited (linear), max N waits, then
			// attempt the relaunch REGARDLESS — a queued relaunch is one attempt with
			// patience, never a rapid retry-storm (that would be hammering).
			let queueAttempts = 0;
			while (isLimited() && queueAttempts < maxAttempts) {
				queueAttempts++;
				await Bun.sleep(queueDelayMs * queueAttempts); // linear backoff
			}
			const queued = queueAttempts > 0;
			const rel = await (opts.relaunchFn ?? ((i: string) => this.relaunch(i)))(id);
			if (rel.isErr()) return err(rel.error);
			// hammered = we blew past max attempts while still limited AND relaunch failed
			const hammered = queueAttempts >= maxAttempts && isLimited() && !rel.value.restarted;
			return ok({ queued, queueAttempts, hammered, ...rel.value });
		},
	};
}
