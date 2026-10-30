/**
 * plugin/rename.ts — the ONE rename engine as a hephaistos plugin.
 * Serves eidos (scaffold), bornite (mineral renames), and the pairs product
 * (merge index) — replacing the 4-way scatter (bun engine + bornite python +
 * pairs python + azurite stale copies, all archived 2026-10-30).
 */
import { z } from 'zod';
import { definePlugin } from '@hephaistos/core';

export default definePlugin({
  name: 'rename',
  version: '1.0.0',
  describe: 'The ONE rename engine (rename-roundup borrowed in): pairs-driven content+path sweeps, dry-run-gated, camelCase-aware.',
  register(ctx) {
    const prefix = ctx.namespacePrefix || 'rename';
    return {
      tools: [
        {
          id: 'rename_dry_run',
          summary: 'Preview a pairs-driven rename sweep over a repo (content + git-mv paths), no writes.',
          register: async (server) => {
            server.registerTool(`${prefix}_dry_run`, {
              description: 'rename-roundup dry-run: content matches + path renames from a .pairs file.',
              inputSchema: z.object({ repo: z.string(), pairs: z.string() }),
            }, async ({ repo, pairs }) => {
              const { $ } = await import('bun');
              const out = await $`bun /home/toxic/pens/ranch/products/rename-roundup/cli.ts --repo ${repo} --pairs ${pairs} --dry-run`.quiet().nothrow().text();
              return { content: [{ type: 'text' as const, text: out }] };
            });
          },
        },
        {
          id: 'rename_apply',
          summary: 'Apply a pairs-driven rename sweep (one atomic commit, backup-ref protocol).',
          register: async (server) => {
            server.registerTool(`${prefix}_apply`, {
              description: 'rename-roundup apply with --commit (dry-run-gated via ctx.effects).',
              inputSchema: z.object({ repo: z.string(), pairs: z.string(), commitMsg: z.string().optional() }),
            }, async ({ repo, pairs, commitMsg }) => {
              if (!ctx.effects) return { content: [{ type: 'text' as const, text: 'refusing: effects capability absent (fail closed)' }] };
              const msg = commitMsg ?? `rename: sweep via ${pairs}`;
              const out = await ctx.effects.exec(`bun /home/toxic/pens/ranch/products/rename-roundup/cli.ts --repo ${repo} --pairs ${pairs} --commit ${JSON.stringify(msg)}`);
              return { content: [{ type: 'text' as const, text: out }] };
            });
          },
        },
      ],
      knowledge: [{
        name: 'rename-doctrine',
        content: 'ONE engine: pens/ranch/products/rename-roundup (Bun+tsgo, lib/{rules,apply,paths}). camelCase declared-form rule (tokenVariants.declared first). vendor/fixture excluded. Archive-before-delete. bornite/pairs python retired 2026-10-30.',
      }],
    };
  },
});
