#!/usr/bin/env bun
/**
 * bin/emit-ast-validator.ts — eidos emits an ast-grep validator into a
 * scaffolded product (the r503-forge pattern from mcp-dropin-guide R-503).
 *
 * A product scaffolded by eidos gets:
 *   bin/sg/r503.ts.yml   — the ast-grep rule config for this product
 *   bin/ast-check.sh     — the machine gate: bun/ast-grep structural scan
 *
 * Usage: bun bin/emit-ast-validator.ts --target <dir>
 */
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const argIdx = process.argv.indexOf("--target");
const target = argIdx !== -1 ? process.argv[argIdx + 1] : null;
if (!target) { console.error("usage: bun bin/emit-ast-validator.ts --target <dir>"); process.exit(1); }
if (!existsSync(join(target, "package.json"))) { console.error(`no package.json at ${target}`); process.exit(2); }

mkdirSync(join(target, "bin", "sg"), { recursive: true });

// The R-503 rule: forbid process.cwd() reads (hephaistos contract doctrine:
// ctx only — the host resolves everything). Structural, not text.
const rule = `id: r503-no-process-cwd
language: ts
severity: warning
message: "Do not read process.cwd() directly — the host resolves paths via ctx (eidos/hephaistos doctrine)."
rule:
  pattern: process.cwd()
`;

writeFileSync(join(target, "bin", "sg", "r503.ts.yml"), rule);

const check = `#!/usr/bin/env bash
# ast-grep structural gate (eidos-emitted, r503 pattern)
set -e
ROOT="\$(cd "\$(dirname "\${BASH_SOURCE[0]}")/.." && pwd)"
command -v ast-grep >/dev/null || { echo "ast-grep missing — bun x @ast-grep/cli"; exit 2; }
ast-grep scan "\$ROOT" --rule "\$ROOT/bin/sg/r503.ts.yml"
rc=\$?
[ \$rc -eq 0 ] && echo "[ast-check] PASS" || echo "[ast-check] FINDINGS above (exit \$rc)"
exit \$rc
`;
writeFileSync(join(target, "bin", "ast-check.sh"), check, { mode: 0o755 });

console.log(`eidos ast-validator emitted -> ${target}/bin/{sg/r503.ts.yml, ast-check.sh}`);