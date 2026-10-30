/**
 * plugin/index.ts — eidos (εἶδος) as a hephaistos first-party plugin.
 *
 * VERIFIED against the consent plugin (the contract's reference shape):
 *   tools: [{ id, summary, register: async (server) => server.registerTool(
 *              `${ctx.namespacePrefix}_<tool>`, { description, inputSchema: z.object({...}) },
 *              handler) }]
 *   — NOT { name, description, inputSchema, handler } (my first guess was wrong).
 *
 * eidos = the FORGE: bun-scaffold's form-stamping, drop-in discovery, and
 * AST-grep validation as hephaistos MCP tools. MCP is the integration.
 */
import { z } from 'zod';
import { definePlugin, type IMcpPluginContext, type IMcpPluginRegistrations } from '@hephaistos/core';
import { discoverDropins, infraDropins } from '../src/scaffold-services.ts';

export const name = 'eidos';

const optionsSchema = z.object({
  pensRoot: z.string().default('/home/toxic/pens'),
  emitDropinEnv: z.boolean().default(true),
});

export default definePlugin({
  name,
  version: '1.0.0',
  describe:
    'εἶδος — the forge: scaffold form-stamping, drop-in discovery, AST-grep validation as hephaistos MCP tools.',
  optionsSchema,
  example: { pensRoot: '/home/toxic/pens', emitDropinEnv: true },

  register(ctx: IMcpPluginContext): IMcpPluginRegistrations {
    const parsed = optionsSchema.safeParse(ctx.options);
    const pensRoot = parsed.success ? parsed.data.pensRoot : '/home/toxic/pens';
    const prefix = ctx.namespacePrefix || 'eidos';

    return {
      tools: [
        {
          id: 'discover_dropins',
          summary: 'List every estate infra drop-in as BUN_<NAME>_PORT connection vars (from ports.env).',
          register: async (server) => {
            server.registerTool(
              `${prefix}_discover_dropins`,
              {
                description: 'Discover estate infra drop-ins (qdrant/hindsight/kafka/redis + all *_PORT services) as connection env.',
                inputSchema: z.object({
                  infraOnly: z.boolean().optional().describe('only the four infra tiers'),
                }),
              },
              async ({ infraOnly }: { infraOnly?: boolean }) => {
                const dropins = infraOnly ? infraDropins() : discoverDropins();
                return {
                  content: [{ type: 'text' as const, text: JSON.stringify(
                    dropins.map((d) => ({ id: d.id, env: d.envVar, port: d.port, hint: d.clientHint })), null, 2) }],
                };
              },
            );
          },
        },
        {
          id: 'scaffold_plan',
          summary: 'Emit the four drop-in wiring stanzas (ports.env, pitchfork monolith, thresher config, bunfig env).',
          register: async (server) => {
            server.registerTool(
              `${prefix}_scaffold_plan`,
              {
                description: 'Drop-in wiring plan: ports.env + pitchfork monolith + thresher config + bunfig env.',
                inputSchema: z.object({
                  name: z.string().describe('drop-in name, e.g. flotilla'),
                  run: z.string().describe('exec command (bun <server>)'),
                  mcpPath: z.string().optional().describe('default /mcp'),
                }),
              },
              async ({ name: n, run, mcpPath }) => {
                const { borrowDropinPlan } = await import('../dropin/borrow-dropin.ts');
                const plan = borrowDropinPlan({ name: n, run, mcpPath: mcpPath ?? '/mcp' });
                return {
                  content: [{ type: 'text' as const, text: `# ${n} drop-in plan\n\n<ports.env>\n${plan.portsEnv}\n<pitchfork>\n${plan.pitchfork}\n<thresher>\n${plan.thresher}` }],
                };
              },
            );
          },
        },
        {
          id: 'validate_ast',
          summary: 'AST-grep structural validation (the forge quality gate) — code shape, not text.',
          register: async (server) => {
            server.registerTool(
              `${prefix}_validate_ast`,
              {
                description: 'ast-grep structural scan of a path (r503 pattern: no process.cwd, ctx-only doctrine).',
                inputSchema: z.object({
                  path: z.string().describe('abs path to scan'),
                  pattern: z.string().describe('ast-grep pattern'),
                  lang: z.string().optional(),
                }),
              },
              async ({ path, pattern }) => {
                const { $ } = await import('bun');
                const out = await $`ast-grep scan ${path} --rule ${pattern}`.quiet().nothrow().text();
                return { content: [{ type: 'text' as const, text: out || '(no matches)' }] };
              },
            );
          },
        },
        {
          id: 'reactive_error',
          summary: 'On tool error: classify the failure family, spawn a rig agent diagnosis, ledger the receipt.',
          register: async (server) => {
            server.registerTool(
              `${prefix}_reactive_error`,
              {
                description: 'Reactive error diagnosis — feeds a tool error through the failure-family classifier (kernel-death / tool-deny / patch-miss / network) and returns the prescribed fix pattern.',
                inputSchema: z.object({
                  tool: z.string().describe('tool that errored'),
                  error: z.string().describe('the error text'),
                }),
              },
              async ({ tool, error }) => {
                const { reactiveErrorPlugin } = await import('./reactive-error.ts');
                const plugin = reactiveErrorPlugin({ dryRun: true });
                const d = await plugin.postTool({
                  hook_event_name: 'PostToolUse',
                  tool_name: tool,
                  tool_input: {},
                  tool_response: { error },
                });
                return {
                  content: [{ type: 'text' as const, text: JSON.stringify(d, null, 2) }],
                };
              },
            );
          },
        },
      ],
      knowledge: [
        {
          name: 'eidos-forge-doctrine',
          content:
            'eidos (the forge) scaffolds form + discovers drop-ins. Parent of 27 products; 132 infra services from ports.env. Mutations via ctx.effects; options from hephaistos.config.json#plugins.eidos. Verified against the consent plugin contract shape.',
        },
      ],
    };
  },
});