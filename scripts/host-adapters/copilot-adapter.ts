/**
 * GitHub Copilot CLI host adapter — post-processing content transformer.
 *
 * Runs only for the copilot host (declared via `adapter` in hosts/copilot.ts), after all
 * generic path/tool rewrites. Every other host is byte-for-byte unaffected.
 *
 * Two transforms, both copilot-only:
 *
 * 1. CODEX -> multi-model panel. A few skills (autoplan, spec) hardcode Codex-CLI bash blocks
 * directly in their templates rather than through a resolver placeholder, so the
 * resolver-registry intercept (scripts/resolvers/ghcp/multimodel-voices.ts) can't reach them.
 * The standalone `codex` CLI isn't the execution path on GHCP, so this adapter rewrites those
 * fenced `codex exec` / `command -v codex` bash blocks into a native multi-model panel
 * dispatched via the `task` tool (the Codex voice runs as the `gpt-5.3-codex` model).
 *
 * 2. SAFETY-HOOK neutralization. /careful, /freeze and /guard rely on Claude Code `PreToolUse`
 * hooks that the copilot allowlist frontmatter strips, leaving prose that credits a hook which
 * never runs. See neutralizeHookProse() below.
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

/**
 * ── Safety-skill hook neutralization ────────────────────────────────────────────────────────
 *
 * /careful, /freeze and /guard enforce themselves through Claude Code `PreToolUse` hooks
 * declared in template frontmatter. The copilot host uses an allowlist frontmatter
 * (keepFields: ['name','description']), so that `hooks:` block is STRIPPED — no hook process
 * runs under GHCP, and nothing intercepts a tool call.
 *
 * The generated prose, however, still described the hook as the enforcement mechanism ("The
 * hook reads the command ... returns `permissionDecision: "ask"`"). An agent reading that
 * reasonably concludes the SYSTEM is enforcing the boundary and proceeds — so the guard reads
 * fail-OPEN exactly where it must fail closed. gen-skill-docs already injects a generic
 * "Safety Advisory" banner for hook-bearing skills, but the body contradicted it.
 *
 * This transform makes the agent the explicit enforcement point for the copilot host.
 *
 * MERGEABILITY: structural, like the codex transform above. It keys on `permissionDecision`
 * (a Claude Code hook-API token, not editorial prose) and on the generated Safety Advisory
 * marker, and it replaces whole sections rather than patching sentences. An upstream reword of
 * the surrounding narrative cannot silently break it; if upstream ever stops emitting the hook
 * API token, the fork-owned contract test fails loudly instead of degrading in silence.
 */

/** Marker gen-skill-docs injects for every skill that declared Claude Code `hooks:`. */
const SAFETY_ADVISORY = '> **Safety Advisory:**';

/** Claude Code hook-API token. Stable, mechanism-specific, safe to match on. */
const HOOK_API = /permissionDecision/;

/** Which safety skill this is, by H1. Only these three get enforcement rewrites. */
function safetyKind(content: string): 'careful' | 'freeze' | 'guard' | null {
  const m = /^# \/(careful|freeze|guard)\b/m.exec(content);
  return m ? (m[1] as 'careful' | 'freeze' | 'guard') : null;
}

/**
 * Replace a `## <heading>` section, fence-aware.
 *
 * A naive regex terminates the section on any line starting with `## `, including one INSIDE a
 * fenced code block (a bash comment, a markdown example). That would truncate the replacement
 * and leave hook prose behind, so the scanner tracks fences and only treats a `## ` line outside
 * a fence as the next section boundary. `###` subheadings never terminate a section.
 */
function replaceSection(content: string, heading: string, replacement: string): string {
  const lines = content.split('\n');
  const startIdx = lines.findIndex(l => l.trimEnd() === `## ${heading}` || l.startsWith(`## ${heading} `));
  if (startIdx === -1) return content;

  let fenced = false;
  let endIdx = lines.length;
  for (let i = startIdx + 1; i < lines.length; i++) {
    if (/^\s*```/.test(lines[i])) fenced = !fenced;
    else if (!fenced && /^## (?!#)/.test(lines[i])) { endIdx = i; break; }
  }
  return [...lines.slice(0, startIdx), ...replacement.split('\n'), ...lines.slice(endIdx)].join('\n');
}

function sectionBody(content: string, heading: string): string {
  const lines = content.split('\n');
  const startIdx = lines.findIndex(l => l.trimEnd() === `## ${heading}` || l.startsWith(`## ${heading} `));
  if (startIdx === -1) return '';
  let fenced = false;
  for (let i = startIdx + 1; i < lines.length; i++) {
    if (/^\s*```/.test(lines[i])) fenced = !fenced;
    else if (!fenced && /^## (?!#)/.test(lines[i])) return lines.slice(startIdx, i).join('\n');
  }
  return lines.slice(startIdx).join('\n');
}

/**
 * Replaces (does NOT append to) the generic Safety Advisory.
 *
 * The upstream banner reads "This skill includes safety checks that check bash commands ...
 * before execution", which asserts the SKILL does the checking. Leaving it above a notice that
 * says the opposite gives the agent two contradictory claims and it may believe the first.
 */
const ENFORCEMENT_NOTICE = [
  '> **STOP — GitHub Copilot CLI enforcement.** The `PreToolUse` hooks this skill relies on are a',
  '> Claude Code feature and are **stripped from this build**. No hook runs here. Nothing',
  '> intercepts your tool calls. **YOU are the only enforcement point.** Run every check below',
  '> yourself, before each tool call, and **fail closed** — if a command or path is questionable,',
  '> stop and ask the user. Never assume the harness blocked anything, and never report a',
  '> protection as "active" or "running" when you are the one who must apply it.',
].join('\n');

/** Destructive patterns, inlined for /guard so it never depends on loading a sibling skill. */
const GUARD_ENFORCEMENT = [
  '## How it works (GitHub Copilot CLI)',
  '',
  'No hook runs on this host, so **you** apply both protections yourself, on every tool call.',
  'Do not rely on `/careful` or `/freeze` being loaded — the rules you need are right here.',
  '',
  '**1. Destructive commands** — before every `bash` call, check it for:',
  '`rm -rf` / `rm -r`, `DROP TABLE` / `DROP DATABASE`, `TRUNCATE`, `git push --force` / `-f`,',
  '`git reset --hard`, `git checkout .` / `git restore .`, `kubectl delete`, `docker rm -f` /',
  '`docker system prune`. On a match, **stop and ask the user to confirm**, quoting the command',
  'and naming the risk. Safe exceptions needing no prompt: `rm -rf` of `node_modules`, `.next`,',
  '`dist`, `__pycache__`, `.cache`, `build`, `.turbo`, `coverage`.',
  '',
  '**2. Edit boundary** — before every file-modifying call (`apply_patch`, `create`), resolve the',
  'absolute target path, re-read the boundary from the state file, and **refuse** anything outside',
  'it, telling the user which path was blocked. Do not "just this once" it.',
  '',
  'Both are guardrails against mistakes, not security boundaries: a `bash` command such as',
  '`sed -i` can still reach outside them.',
  '',
].join('\n');

function mechanismSection(blocks: boolean): string {
  return [
    '## How it works (GitHub Copilot CLI)',
    '',
    'No hook runs on this host — the enforcement described upstream is a Claude Code',
    '`PreToolUse` hook, and its frontmatter block is stripped from this build. **You perform',
    'the check yourself, on every relevant tool call.**',
    '',
    blocks
      ? [
          '1. Before any file-modifying tool call (`apply_patch`, `create`, or an editor tool),',
          '   resolve the absolute target path.',
          '2. Re-read the boundary from the state file described above — do not trust a value you',
          '   remember from earlier in the session, since each `bash` call is a fresh process.',
          '3. If the target is outside the boundary, **refuse the edit** and tell the user which',
          '   path was blocked and why. Do not "just this once" it.',
          '',
          'This is a guardrail against mistakes, not a security boundary: a `bash` command such',
          'as `sed -i` can still reach outside it.',
        ].join('\n')
      : [
          '1. Before every `bash` tool call, check the command against the patterns above.',
          '2. If it matches, **stop and ask the user to confirm**, quoting the exact command and',
          '   naming the risk. Proceed only on an explicit go-ahead.',
          '3. If it matches a documented safe exception, continue without prompting.',
          '',
          'This is advisory-by-design: the user can always override. Silently skipping the check',
          'is the one failure mode that is never acceptable.',
        ].join('\n'),
    '',
  ].join('\n');
}

/**
 * `$GSTACK_ROOT` is introduced by the copilot host's own pathRewrite
 * (`~/.claude/skills/gstack` -> `$GSTACK_ROOT`). Most skills define it in a preamble bash block,
 * but /freeze, /guard, /unfreeze and /upgrade use it WITHOUT ever assigning it. Each `bash` call
 * is a fresh process, so it expands to empty: `eval "$(/bin/gstack-paths)"` fails silently,
 * `STATE_DIR` becomes empty, and the freeze boundary is written to `/freeze-dir.txt` (or not at
 * all). The agent then reads no boundary and concludes there is none — a fail-open that no
 * amount of prose fixes. A shell default makes every usage self-sufficient.
 */
function defaultGstackRoot(content: string): string {
  if (!content.includes('$GSTACK_ROOT')) return content;
  if (/GSTACK_ROOT=/.test(content)) return content; // skill assigns it itself
  return content.replace(/\$GSTACK_ROOT\b/g, '${GSTACK_ROOT:-$HOME/.copilot/skills/gstack}');
}

function neutralizeHookProse(content: string): string {
  const kind = safetyKind(content);
  if (!kind) return content; // never touch non-safety skills

  let out = content;

  // 1. REPLACE the generic advisory (contradictory) with the explicit enforcement notice.
  if (!out.includes('GitHub Copilot CLI enforcement.')) {
    const line = out.split('\n').find(l => l.startsWith(SAFETY_ADVISORY));
    out = line ? out.replace(line, ENFORCEMENT_NOTICE) : `${ENFORCEMENT_NOTICE}\n\n${out}`;
  }

  // 2. Replace the mechanism section. /guard has none, so it gets an inlined combined one.
  if (kind === 'guard') {
    out = replaceSection(out, 'What\'s protected', GUARD_ENFORCEMENT);
  } else {
    const body = sectionBody(out, 'How it works');
    if (HOOK_API.test(body)) {
      out = replaceSection(out, 'How it works', mechanismSection(/permissionDecision:\s*"deny"/.test(body)));
    }
  }

  // 3. Passive "the system will do it" phrasing -> imperative "you must do it".
  out = out
    .replace(
      /Every bash command will be checked for destructive\npatterns before running\. If a destructive command is detected, you'll be warned\nand can choose to proceed or cancel\./,
      "**You must check every bash command against the patterns below before running it.**\nOn a match, warn the user and let them choose to proceed or cancel.",
    )
    .replace(/will be \*\*blocked\*\* \(not just warned\)/, 'must be **refused by you** (not just warned)')
    .replace(/Two protections are now running:/, 'Two protections are now active, and I am enforcing both myself:')
    .replace(/will warn before executing \(you can override\)/, 'I will check every command and warn you before executing (you can override)')
    .replace(/Edits outside this directory are blocked\./, 'I will refuse edits outside this directory.');

  // 4. Claude-only tool names the generic rewrite table can't reach (bare pairs, not "the X tool").
  //    Longest forms first so the trailing noun is consumed instead of leaving "tools ... tools".
  out = out
    .replace(/\bEdit and Write tools\b/g, 'file-editing tools (`apply_patch` / `create`)')
    .replace(/\bEdit or Write tools\b/g, 'file-editing tools (`apply_patch` / `create`)')
    .replace(/\bEdit and Write operation\b/g, 'file-editing operation (`apply_patch` / `create`)')
    .replace(/\bEdit or Write operation\b/g, 'file-editing operation (`apply_patch` / `create`)')
    .replace(/\bEdit and Write\b/g, '`apply_patch` / `create`')
    .replace(/\bEdit or Write\b/g, '`apply_patch` / `create`')
    .replace(/\bEdit\/Write\b/g, '`apply_patch` / `create`');

  return out;
}

export function transform(content: string, _config: HostConfig): string {
  const withPanel = content.replace(BASH_BLOCK, (match, indent: string, body: string) => {
    if (!CODEX_DRIVER.test(body)) return match;
    return PANEL_LINES.map(line => (line ? `${indent}${line}` : line)).join('\n');
  });
  return defaultGstackRoot(neutralizeHookProse(withPanel));
}
