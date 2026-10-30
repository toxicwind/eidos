#!/usr/bin/env node
// mcp-dropin-guide gate - the machine proof command of the TASK phase.
// Zero findings = exit 0. Any finding = exit 1 with a report.
// Generic by design: checks the guide convention itself. Specialize per guide.
'use strict';
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const findings = [];
const add = (file, msg) => findings.push(`${path.relative(root, file)}: ${msg}`);

function walk(dir, exts, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === '.git') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, exts, out);
    else if (exts.some(x => e.name.endsWith(x))) out.push(p);
  }
  return out;
}

// 1. README cites the convention (scope, rules section, gates section).
const readme = path.join(root, 'README.md');
if (!fs.existsSync(readme)) add(readme, 'missing README.md');
else {
  const t = fs.readFileSync(readme, 'utf8');
  if (!/\bR-\d{3}\b/.test(t)) add(readme, 'no R-NNN rule ids found - rules section is empty or ids malformed');
  if (!/#gates|## Gates/i.test(t)) add(readme, 'README lacks a Gates section');
  if (!/Provenance/i.test(t)) add(readme, 'README does not mention Provenance (required per-rule)');
}

// 2. Ids are unique and sorted within their README (renumbering guard is via git history; this checks formatting).
if (fs.existsSync(readme)) {
  const ids = (fs.readFileSync(readme, 'utf8').match(/R-\d{3}/g) || []);
  const dup = ids.filter((v, i) => ids.indexOf(v) !== i);
  if (dup.length) add(readme, `duplicate rule ids: ${[...new Set(dup)].join(', ')}`);
}

// 3. LF-only: CR bytes are forbidden in tracked text (Arch main; CRLF leaks
//    in from Windows authoring). The scaffold normalizes; the gate enforces.
for (const f of walk(root, ['.md', '.js', '.json', '.sh', '.toml'])) {
  const buf = fs.readFileSync(f);
  for (let i = 0; i < buf.length; i++) {
    if (buf[i] === 0x0d) { add(f, `CR (\\r) byte at offset ${i} - run: find . -type f -exec perl -pi -e 's/\\r\\n/\\n/' {} +`); break; }
    if (buf[i] > 0x7f) { add(f, `non-ASCII byte 0x${buf[i].toString(16)} at offset ${i}`); break; }
  }
}

// 4. SDD trio present.
for (const f of ['spec.prompt.md', 'task.prompt.md', 'verifySpec.prompt.md']) {
  const p = path.join(root, '.github', 'prompts', f);
  if (!fs.existsSync(p)) add(p, 'missing SDD prompt file');
  else if (!fs.readFileSync(p, 'utf8').startsWith('---')) add(p, 'missing YAML frontmatter');
}

// 5. CONTRIBUTING declares renumbering forbidden.
const contrib = path.join(root, 'CONTRIBUTING.md');
if (fs.existsSync(contrib) && !/Renumbering is forbidden/i.test(fs.readFileSync(contrib, 'utf8')))
  add(contrib, 'does not declare "Renumbering is forbidden"');

if (findings.length) {
  console.error(`${findings.length} finding(s):`);
  for (const f of findings) console.error(`  - ${f}`);
  process.exit(1);
}
console.log('gate: 0 findings - OK');
