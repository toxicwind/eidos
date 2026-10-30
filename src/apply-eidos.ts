/**
 * src/apply-scaffold.ts — apply the maximal bun scaffold to estate projects.
 *
 * Options:
 *   --root <dir>      subtree to scan (default /home/toxic/estate/ranch)
 *   --target <dir>    apply ONLY to this project dir (skip LLM detection)
 *   --llm             for each package.json, ask freeinference deepseek v4 flash
 *                     to produce the maximal scaffold patch (default ON for scan)
 *   --yes             write changes without prompting
 *   --dry-run         show what would change, don't write
 *
 * The scaffold template = the committed files in this repo (bunfig.toml,
 * package.json scripts), applied per project, personalized via the LLM when
 * --llm (rides DelendAI lllm-client conventions + freeinference deepseek).
 */

import { completeOver, type ChatMsg } from "./eidos-bridge";
import { scanPackageJsons } from "./detect-bizarre-package-json";
import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  statSync,
} from "node:fs";
import { dirname, join } from "node:path";

const SCAFFOLD_BUNFIG = readFileSync(
  new URL("../bunfig.toml", import.meta.url),
  "utf8",
);
const rootArgIdx = process.argv.indexOf("--root");
const ROOT =
  rootArgIdx !== -1 ? process.argv[rootArgIdx + 1] : "/home/toxic/estate/ranch";
const targetArgIdx = process.argv.indexOf("--target");
const TARGET = targetArgIdx !== -1 ? process.argv[targetArgIdx + 1] : null;
const USE_LLM = process.argv.includes("--llm");
const DRY_RUN = process.argv.includes("--dry-run");
const YES = process.argv.includes("--yes");
const BULK = process.argv.includes("--bulk");
const DROPIN = process.argv.includes("--dropin"); // render infra drop-in env into bunfig

function banner(msg: string) {
  console.log(`\n# ${msg}`);
}

/**
 * bun-stack heuristic — only real Bun projects should get a bunfig.
 * A project is bun-applicable when its package.json shows Bun markers and is
 * NOT a python/bash/openclaw skill and NOT an upstream node-only lib with zero
 * bun usage. This prevents a blind sweep from misapplying the scaffold to
 * non-Bun projects (observed: rig/sdk dev + gear/email-to-calendar).
 */
function isBunApp(target: string): boolean {
  const pkgPath = existsSync(`${target}/package.json`)
    ? `${target}/package.json`
    : null;
  if (!pkgPath) return false;
  let pkg: Record<string, unknown> = {};
  try {
    pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
  } catch {
    return false;
  }
  const raw = JSON.stringify(pkg);

  // Non-bun hard negatives.
  if (/python3|"bash"|"jq"|openclaw/.test(raw)) return false; // skill / script-bins
  if (pkg.engines === "node" && !/bun/.test(raw)) {
    const bins = (pkg.scripts as Record<string, string> | undefined) ?? {};
    const scriptVals = Object.values(bins).join(" ");
    if (!/bun/.test(scriptVals)) return false; // node-only, no bun in scripts
  }

  // Bun positives.
  if (/bun/.test(raw)) return true; // bun dep/script/bunfig mention
  const scripts = (pkg.scripts as Record<string, string> | undefined) ?? {};
  if (Object.values(scripts).some((v) => /bun/.test(v))) return true;
  const main = String(pkg.main ?? "");
  if (/\.(mjs|tsx?)$/.test(main) && (pkg as any).type === "module") return true;
  return false;
}

/** True if `dir` is a git submodule (has a .git FILE, not a dir). */
function hasSubmoduleGit(dir: string): boolean {
  try {
    const st = statSync(join(dir, ".git"));
    return st.isFile();
  } catch {
    return false;
  }
}

async function main() {
  banner(
    `eidos apply — root=${ROOT} target=${TARGET ?? "auto"} llm=${USE_LLM} dry=${DRY_RUN}`,
  );

  if (!USE_LLM && !TARGET && !BULK) {
    console.log(
      "No --llm and no --target; running detection only. Add --llm to scaffold, or --target <dir>.",
    );
    const findings = scanPackageJsons(ROOT);
    console.log(
      `Detected ${findings.length} findings. Re-run with --llm to scaffold them.`,
    );
    return;
  }

  if (TARGET) {
    // Single-project apply: install the scaffold files (only if real bun).
    const pkgPath = existsSync(`${TARGET}/package.json`)
      ? `${TARGET}/package.json`
      : null;
    if (!pkgPath) {
      console.error(`No package.json at ${TARGET}`);
      process.exit(1);
    }
    if (!isBunApp(TARGET)) {
      console.log(
        `  [skip] ${TARGET} is not a Bun project (bun-stack heuristic)`,
      );
      return;
    }
    banner(`applying scaffold to ${TARGET}`);
    const write = (dest: string, body: string) => {
      if (DRY_RUN) {
        console.log(`  [dry-run] would write ${dest} (${body.length} bytes)`);
        return;
      }
      mkdirSync(dirname(dest), { recursive: true });
      writeFileSync(dest, body);
      console.log(`  wrote ${dest}`);
    };
    const { discoverDropins, renderDropinsToml } = await import("./scaffold-services.ts");
    write(`${TARGET}/bunfig.toml`, SCAFFOLD_BUNFIG);
    if (DROPIN) {
      const dropins = discoverDropins();
      const env = renderDropinsToml(infraDropins());
      if (env && !env.startsWith("#")) {
        const bunfigPath = `${TARGET}/bunfig.toml`;
        const existing = existsSync(bunfigPath) ? readFileSync(bunfigPath, "utf8") : SCAFFOLD_BUNFIG;
        const withEnv = `${existing}\n# infra drop-ins (discovered from config/ports.env by eidos)\n${env.split("\n").map((l) => `  ${l}`).join("\n")}\n`;
        write(bunfigPath, withEnv);
      } else {
        write(`${TARGET}/bunfig.toml`, SCAFFOLD_BUNFIG);
      }
    }
    if (USE_LLM) {
      // Let deepseek refine the package.json scripts for this project.
      const current = readFileSync(pkgPath, "utf8");
      const msg: ChatMsg[] = [
        {
          role: "system",
          content:
            "You are a Bun build-scaffold engineer. Given a project's package.json, emit ONLY a JSON patch adding/keeping a maximal script set: validate, typecheck, test, test:coverage, lint. Reply with a single JSON object of scripts ONLY.",
        },
        { role: "user", content: current.slice(0, 4000) },
      ];
      const r = await completeOver([current], () => msg, {}, 1);
      if (r[0].ok && r[0].text) {
        console.log(`  [llm] proposed scripts:\n${r[0].text.slice(0, 800)}`);
      } else {
        console.log(`  [llm] skipped: ${r[0].error ?? "no text"}`);
      }
    }
    return;
  }

  if (BULK) {
    // Better bulk: scan ROOT, filter to confidently-Bun projects, write the
    // max bunfig to each (deterministic file, no LLM). Non-bun / ambiguous are
    // reported as skips so the 800-finding mess becomes a small actionable set.
    const findings = scanPackageJsons(ROOT);
    const projectDirs = [...new Set(findings.map((f) => dirname(f.path)))];
    let applied = 0;
    let skipped = 0;
    const batch = projectDirs.map((d) => {
      const bun = isBunApp(d);
      const sub = hasSubmoduleGit(d); // written in a submodule → separate repo
      return { d, bun, sub } as const;
    });
    for (const { d, bun, sub } of batch) {
      if (!bun) {
        if (DRY_RUN || YES) console.log(`  [skip] ${d} (not Bun)`);
        skipped++;
        continue;
      }
      if (sub) {
        console.log(
          `  [submodule] ${d} — bunfig goes in that submodule's repo`,
        );
        skipped++;
        continue;
      }
      if (DRY_RUN) {
        console.log(`  [dry-run] would write bunfig to ${d}`);
      } else {
        writeFileSync(join(d, "bunfig.toml"), SCAFFOLD_BUNFIG);
        console.log(`  wrote bunfig -> ${d}`);
      }
      applied++;
    }
    banner(
      `bulk done: ${applied} applied, ${skipped} skipped/other of ${batch.length} bun-candidate dirs`,
    );
    return;
  }

  // ROOT-wide: detect then scaffold each via LLM.
  const findings = scanPackageJsons(ROOT);
  banner(`detected ${findings.length} projects needing attention`);
  if (USE_LLM) {
    const projectDirs = [
      ...new Set(findings.map((f) => dirname(f.path))),
    ].slice(0, 40);
    const msgs = projectDirs.map((d): ChatMsg[] => [
      {
        role: "system",
        content:
          "You are applying a maximal Bun scaffold. Given this project dir+pkg, suggest missing scripts/meta. Keep it short.",
      },
      {
        role: "user",
        content: `dir=${d}\n${readFileSync(`${d}/package.json`, "utf8").slice(0, 2000)}`,
      },
    ]);
    const results = await completeOver(projectDirs, (_d, i) => msgs[i], {}, 8);
    for (const r of results) {
      console.log(
        r.ok
          ? `  [llm] ${r.item}:\n${(r.text ?? "").slice(0, 600)}`
          : `  [fail] ${r.item}: ${r.error}`,
      );
    }
  }
}

await main();
