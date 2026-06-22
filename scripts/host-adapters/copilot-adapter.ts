/**
 * GitHub Copilot CLI host adapter — post-processing content transformer.
 *
 * Runs only for the copilot host (declared via `adapter` in hosts/copilot.ts), after all
 * generic path/tool rewrites. Every other host is byte-for-byte unaffected.
 *
 * Purpose: a few skills (autoplan, spec) hardcode Codex-CLI bash blocks directly in their
 * templates rather than through a resolver placeholder, so the resolver-registry intercept
 * (scripts/resolvers/ghcp/multimodel-voices.ts) can't reach them. On the Copilot CLI there is
 * no `codex` binary, so this adapter rewrites those fenced `codex exec` / `command -v codex`
 * bash blocks into the native multi-model panel (gpt-5.5 + gemini-3.1-pro-preview via the task
 * tool). The surrounding prose (phase headings, "Codex X voice" labels) supplies the per-step
 * intent; the panel says how to run it on GHCP.
 *
 * Keep the match narrow: only fenced ```bash blocks whose body actually drives Codex are
 * touched. The fork-owned contract test (test/ghcp-multimodel-voices.test.ts) and the codex
 * grep gate guard the result.
 */
import type { HostConfig } from '../host-config';
import { REVIEW_VOICES, IMPLEMENTER_MODEL } from '../resolvers/ghcp/voices';

const DISPATCH = REVIEW_VOICES.map(
  v => `\`task(model="${v.model}", reasoning_effort="${v.effort}", ...)\``,
).join(' and ');

const PANEL_LINES = [
  '**Run this as a native multi-model panel (this harness has no Codex CLI).**',
  `Dispatch ${DISPATCH} in parallel with the same intent described above, alongside the`,
  'Claude subagent, then build consensus across the voices. Reviewer voices must differ from the',
  `implementer (\`${IMPLEMENTER_MODEL}\`). On a \`CAPIError 400\` effort rejection or a`,
  "`total_turns: 0` premature exit, relaunch one rung lower on that model's ladder. These voices",
  'inform; they never gate shipping.',
];

const CODEX_DRIVER = /codex exec|command -v codex/;

/** Fenced ```bash block, indentation-aware, non-greedy to the matching close fence. */
const BASH_BLOCK = /^([ \t]*)```bash\n([\s\S]*?)\n[ \t]*```/gm;

export function transform(content: string, _config: HostConfig): string {
  return content.replace(BASH_BLOCK, (match, indent: string, body: string) => {
    if (!CODEX_DRIVER.test(body)) return match;
    return PANEL_LINES.map(line => (line ? `${indent}${line}` : line)).join('\n');
  });
}
