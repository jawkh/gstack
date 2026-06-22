/**
 * GitHub Copilot CLI host adapter — post-processing content transformer.
 *
 * Runs only for the copilot host (declared via `adapter` in hosts/copilot.ts), after all
 * generic path/tool rewrites. Every other host is byte-for-byte unaffected.
 *
 * Purpose: a few skills (autoplan, spec) hardcode Codex-CLI bash blocks directly in their
 * templates rather than through a resolver placeholder, so the resolver-registry intercept
 * (scripts/resolvers/ghcp/multimodel-voices.ts) can't reach them. The standalone `codex` CLI
 * isn't the execution path on GHCP, so this adapter rewrites those fenced `codex exec` /
 * `command -v codex` bash blocks into a native multi-model panel dispatched via the `task`
 * tool (the Codex voice runs as the `gpt-5.3-codex` model; see ghcp/voices.ts).
 *
 * MERGEABILITY: this is a STRUCTURAL transform only — it matches fenced ```bash blocks keyed
 * on the stable `codex exec` / `command -v codex` CLI tokens and touches NO surrounding prose.
 * Upstream's "Codex" wording (Codex voice, CODEX SAYS, consensus tables, report templates) is
 * kept verbatim because Codex is a real voice here, so an upstream reword can never silently
 * break a brittle prose rule and merges stay clean. The fork-owned contract test
 * (test/ghcp-multimodel-voices.test.ts) guards the result.
 */
import type { HostConfig } from '../host-config';
import { REVIEW_VOICES, IMPLEMENTER_MODEL } from '../resolvers/ghcp/voices';

const DISPATCH = REVIEW_VOICES.map(
  v => `\`task(model="${v.model}", reasoning_effort="${v.effort}", ...)\``,
).join(' and ');

const PANEL_LINES = [
  '**Run this as a native multi-model panel via the `task` tool (no `codex` shell-out — the',
  'Codex voice is the `gpt-5.3-codex` model).**',
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
