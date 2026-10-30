/**
 * src/detect-bizarre-package-json.ts — scan the estate (ranch) for package.json
 * files that are broken, missing, or non-conformant so we can apply the maximal
 * bun scaffold to them.
 *
 * Output: grouped findings with path + reason, JSON when --json.
 *
 * Usage: bun src/detect-bizarre-package-json.ts [--root <ranch>] [--json]
 */

interface Finding {
  path: string;
  kind:
    | "missing-scaffold-meta"
    | "no-scripts"
    | "no-bunfig"
    | "no-name"
    | "parse-error"
    | "bizarre";
  detail: string;
}

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";

const rootArgIdx = process.argv.indexOf("--root");
const ROOT =
  rootArgIdx !== -1 ? process.argv[rootArgIdx + 1] : "/home/toxic/pens/estate/ranch";
const JSON_OUT = process.argv.includes("--json");

function isDir(p: string) {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}

/** Recursive, bounded: only descend into repos that have a package.json or look JS-y. */
function* walk(dir: string, depth = 0): Generator<string> {
  if (depth > 3) return;
  let entries: string[] = [];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const e of entries) {
    if (
      [
        ".git",
        "node_modules",
        ".ffs",
        "dist",
        "build",
        "target",
        ".worktrees",
        ".next",
        ".cache",
      ].includes(e)
    )
      continue;
    const p = join(dir, e);
    if (existsSync(p) && isDir(p)) {
      yield* walk(p, depth + 1);
    } else if (e === "package.json") {
      yield p;
    }
  }
}

function parse(p: string): Record<string, unknown> | null | undefined {
  try {
    return JSON.parse(readFileSync(p, "utf8"));
  } catch {
    return null; // parse error
  }
}

export function scan(root: string): Finding[] {
  const findings: Finding[] = [];
  for (const pkg of walk(root)) {
    const parsed = parse(pkg);
    const dir = dirname(pkg);
    const hasBunfig = existsSync(join(dir, "bunfig.toml"));
    if (parsed === null) {
      findings.push({
        path: pkg,
        kind: "parse-error",
        detail: "JSON parse failed",
      });
      continue;
    }
    if (parsed === undefined) continue;
    if (!parsed.name || typeof parsed.name !== "string") {
      findings.push({
        path: pkg,
        kind: "no-name",
        detail: "missing/invalid 'name'",
      });
    }
    if (
      !parsed.scripts ||
      typeof parsed.scripts !== "object" ||
      !Object.keys(parsed.scripts).length
    ) {
      findings.push({
        path: pkg,
        kind: "no-scripts",
        detail: "no scripts (no validate/test:coverage gate)",
      });
    }
    if (!hasBunfig) {
      findings.push({
        path: pkg,
        kind: "no-bunfig",
        detail:
          "missing bunfig.toml (bun-specific settings should live here, not package.json)",
      });
    }
  }
  return findings;
}

function main() {
  const findings = scan(ROOT);
  if (JSON_OUT) {
    console.log(
      JSON.stringify({ root: ROOT, total: findings.length, findings }, null, 2),
    );
    return;
  }
  const byKind = new Map<string, Finding[]>();
  for (const f of findings) {
    if (!byKind.has(f.kind)) byKind.set(f.kind, []);
    byKind.get(f.kind)!.push(f);
  }
  console.log(
    `\n=== package.json audit: ${findings.length} findings under ${ROOT} ===`,
  );
  for (const [kind, list] of byKind) {
    console.log(`\n[${kind}] (${list.length})`);
    for (const f of list.slice(0, 15)) console.log(`  ${f.path} — ${f.detail}`);
    if (list.length > 15) console.log(`  … and ${list.length - 15} more`);
  }
}

if (require.main === module) main();

export { scan as scanPackageJsons };
