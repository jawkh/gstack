import type { TemplateContext } from '../types';

/**
 * Subagent failure recovery — GitHub Copilot CLI only.
 *
 * GHCP routes task-tool subagents to a model + reasoning effort. The
 * `general-purpose` agent type defaults to `reasoning_effort: 'max'`, which the
 * backend rejects for models that top out at `xhigh` (GPT-5.x) — the agent dies
 * at total_turns:0 with a `CAPIError: 400 bad_request`. The proven fix is to
 * retry with a lower effort (via model / agent-type selection), not to give up.
 * Other hosts (Claude Code's Task tool, Codex, etc.) don't share this surface,
 * so this guidance is copilot-gated.
 */
export function generateSubagentRetry(ctx: TemplateContext): string {
  if (ctx.host !== 'copilot') return '';
  return `## Subagent failure recovery (do not give up)

When you dispatch work with the task tool and a subagent fails or comes back with
no usable result, never silently drop it. Triage the failure, then retry:

1. **Effort rejected (deterministic).** The result contains \`CAPIError: 400\`
   \`bad_request\` with \`Invalid value: '<effort>'. Supported values are: 'none',
   'minimal', 'low', 'medium', 'high', 'xhigh'.\` The agent type's default
   reasoning effort (often \`max\`) is not supported by the routed model. Relaunch
   the SAME task with the next lower effort, walking down one rung at a time:
   \`max → xhigh → high → medium → low → minimal → none\`. The task tool has no
   direct effort knob, so lower it by setting \`model\` to one whose supported
   efforts include the next rung, or by switching to an agent type that defaults
   to a valid effort (\`explore\`, \`rubber-duck\`, and \`task\` are known-good;
   \`general-purpose\` is the one that defaults to the rejected \`max\`). Keep the
   prompt and scope identical; only the effort / model / agent-type changes.
2. **Ended prematurely.** The agent reports \`status: completed\` (or \`idle\`) with
   \`total_turns: 0\`, or returns empty / truncated output with no real result.
   Treat it the same as case 1: relaunch one rung lower and/or on a known-good
   agent type. (A subagent still \`status: running\` has NOT failed — wait for it,
   don't relaunch.)
3. **Transient network error (NOT an effort problem).** Timeouts, dropped
   websockets, 5xx, or any CAPIError that is not the \`bad_request\` effort
   rejection above. Lowering the effort will not help, so do not change it —
   retry once or twice unchanged.

If every retry path is exhausted, do the subagent's work inline yourself rather
than skipping it. A failed subagent is always retried or absorbed, never
abandoned.`;
}
