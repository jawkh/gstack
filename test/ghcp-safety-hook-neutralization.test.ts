// Fork-owned contract test (GHCP): the copilot host adapter must make the AGENT the enforcement
// point in the safety skills (/careful, /freeze, /guard).
//
// Why this exists: those skills enforce themselves through Claude Code `PreToolUse` hooks
// declared in template frontmatter. The copilot host uses an allowlist frontmatter
// (keepFields: ['name','description']), so the hook block is STRIPPED and no hook process runs
// under GHCP. Two independent fail-opens followed:
//   1. PROSE — the body credited the hook as the enforcer ("The hook reads ... returns
//      permissionDecision"), so an agent assumed the harness was blocking and proceeded.
//   2. MECHANISM — the copilot pathRewrite (~/.claude/skills/gstack -> $GSTACK_ROOT) introduced
//      a variable that /freeze, /guard, /unfreeze and /upgrade never assign. Each bash call is a
//      fresh process, so it expanded to empty and the freeze boundary was never persisted.
//
// Fenced in a fork-only file so it never conflicts with upstream. See scripts/host-adapters/.
import { describe, test, expect } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..');
const { transform } = require('../scripts/host-adapters/copilot-adapter');
const copilotHost = require('../hosts/copilot').default;

const ADVISORY = '> **Safety Advisory:** This skill includes safety checks that check bash commands before execution.';

const CAREFUL_LIKE = `${ADVISORY}

# /careful — Destructive Command Guardrails

## What's protected

| Pattern | Risk |
|---|---|
| \`rm -rf\` | Recursive delete |

## How it works

The hook reads the command from the tool input JSON, checks it against the
patterns above, and returns \`permissionDecision: "ask"\` with a warning message
if a match is found.

To deactivate, end the conversation or start a new one. Hooks are session-scoped.
`;

const FREEZE_LIKE = `${ADVISORY}

# /freeze — Restrict Edits to a Directory

Any Edit or Write operation targeting a file outside the allowed path will be **blocked** (not just warned).

\`\`\`bash
eval "$($GSTACK_ROOT/bin/gstack-paths)"
echo "$FREEZE_DIR" > "$GSTACK_STATE_ROOT/freeze-dir.txt"
\`\`\`

## How it works

The hook reads \`file_path\` from the Edit/Write tool input JSON, then returns
\`permissionDecision: "deny"\` to block the operation.

## Notes

- Freeze applies to Edit and Write tools only — Read, Bash, Glob, Grep are unaffected
`;

/** Phrases that assert something OTHER than the agent is doing the enforcing. */
const AUTO_ENFORCEMENT = ['permissionDecision', 'The hook reads', 'Hooks are session-scoped'];

describe('GHCP safety enforcement (copilot adapter)', () => {
  test('hook-as-enforcer prose is removed entirely', () => {
    for (const src of [CAREFUL_LIKE, FREEZE_LIKE]) {
      const out = transform(src, copilotHost);
      for (const phrase of AUTO_ENFORCEMENT) expect(out).not.toContain(phrase);
    }
  });

  test('the contradictory generic advisory is REPLACED, not appended to', () => {
    const out = transform(CAREFUL_LIKE, copilotHost);
    // The upstream banner claims the SKILL does the checking; leaving it above a notice saying
    // the opposite gives the agent two contradictory claims and it may believe the first.
    expect(out).not.toContain('This skill includes safety checks that check bash commands');
    expect(out).toContain('STOP — GitHub Copilot CLI enforcement.');
    expect(out).toContain('YOU are the only enforcement point.');
    expect(out).toContain('fail closed');
    expect(out.indexOf('GitHub Copilot CLI enforcement.')).toBeLessThan(out.indexOf('# /careful'));
  });

  test('deny-semantics render as REFUSE; ask-semantics render as confirm-with-user', () => {
    const freeze = transform(FREEZE_LIKE, copilotHost);
    expect(freeze).toContain('refuse the edit');
    expect(freeze).toContain('resolve the absolute target path');

    const careful = transform(CAREFUL_LIKE, copilotHost);
    expect(careful).toContain('stop and ask the user to confirm');
    expect(careful).not.toContain('sed -i'); // path-boundary caveat is nonsense for /careful
  });

  test('a following section survives; only the mechanism section is replaced', () => {
    const out = transform(FREEZE_LIKE, copilotHost);
    expect(out).toContain('## Notes');
    expect(out).toContain('## How it works (GitHub Copilot CLI)');
  });

  // Regression: a naive /^## How it works\n(?:(?!\n## )[\s\S])*/m terminates on a `## ` line
  // inside a fenced code block, truncating the replacement and leaving hook prose behind.
  test('section scanner is fence-aware (a `## ` line inside ```bash is not a boundary)', () => {
    const tricky = `${ADVISORY}

# /careful — x

## How it works

\`\`\`bash
## this is a bash comment, not a heading
echo hi
\`\`\`

The hook reads the command and returns \`permissionDecision: "ask"\`.

## Real Next Section

survives
`;
    const out = transform(tricky, copilotHost);
    for (const phrase of AUTO_ENFORCEMENT) expect(out).not.toContain(phrase);
    expect(out).toContain('## Real Next Section');
    expect(out).toContain('survives');
  });

  test('$GSTACK_ROOT gets a shell default when the skill never assigns it', () => {
    const out = transform(FREEZE_LIKE, copilotHost);
    expect(out).toContain('${GSTACK_ROOT:-$HOME/.copilot/skills/gstack}/bin/gstack-paths');
    expect(out).not.toMatch(/eval "\$\(\$GSTACK_ROOT\//);
  });

  test('$GSTACK_ROOT is left alone when the skill assigns it itself', () => {
    const selfDefined = '# /browse\n\n```bash\nGSTACK_ROOT="$HOME/.copilot/skills/gstack"\n$GSTACK_ROOT/bin/x\n```\n';
    expect(transform(selfDefined, copilotHost)).toBe(selfDefined);
  });

  test('Claude-only tool pairs are renamed without duplicating the trailing noun', () => {
    const out = transform(FREEZE_LIKE, copilotHost);
    expect(out).not.toMatch(/\bEdit (and|or) Write\b/);
    expect(out).not.toMatch(/\bEdit\/Write\b/);
    expect(out).not.toContain('tools (`apply_patch` / `create`) tools');
  });

  test('idempotent: re-running the adapter does not stack notices', () => {
    const once = transform(CAREFUL_LIKE, copilotHost);
    const twice = transform(once, copilotHost);
    const count = (s: string) => s.split('GitHub Copilot CLI enforcement.').length - 1;
    expect(count(once)).toBe(1);
    expect(count(twice)).toBe(1);
  });

  test('non-safety skills are left byte-identical (no collateral rewriting)', () => {
    // /investigate inherits the freeze hook, so it carries the generic advisory and would trip a
    // marker-based gate — but it has no safety checklist, so an enforcement notice there is just
    // context pollution.
    const investigateLike = `${ADVISORY}\n\n# /investigate — Debug\n\n## How it works\n\nRead the stack trace.\n`;
    expect(transform(investigateLike, copilotHost)).toBe(investigateLike);
    const plain = '# /review\n\n## How it works\n\nRead the diff, then report findings.\n';
    expect(transform(plain, copilotHost)).toBe(plain);
  });

  // ── Load-bearing: assert against REAL generated output, not hand-written fixtures. A
  // fixture-only suite would still pass if upstream renamed a section and the transform silently
  // stopped firing, leaving the shipped skill fail-open.
  describe('real generated .copilot output', () => {
    const gen = (s: string) => path.join(ROOT, '.copilot', 'skills', s, 'SKILL.md');
    const SAFETY = ['gstack-careful', 'gstack-freeze', 'gstack-guard'];
    const present = SAFETY.filter(s => fs.existsSync(gen(s)));

    test('the generated safety skills exist (run: bun run gen:skill-docs --host copilot)', () => {
      expect(present).toEqual(SAFETY);
    });

    test('no shipped copilot skill claims hook-based enforcement', () => {
      const dir = path.join(ROOT, '.copilot', 'skills');
      if (!fs.existsSync(dir)) return;
      const offenders: string[] = [];
      for (const s of fs.readdirSync(dir)) {
        const p = path.join(dir, s, 'SKILL.md');
        if (!fs.existsSync(p)) continue;
        const body = fs.readFileSync(p, 'utf-8');
        for (const phrase of AUTO_ENFORCEMENT) if (body.includes(phrase)) offenders.push(`${s}: ${phrase}`);
      }
      expect(offenders).toEqual([]);
    });

    test('every safety skill names the agent as the enforcement point', () => {
      for (const s of present) {
        const body = fs.readFileSync(gen(s), 'utf-8');
        expect(body).toContain('YOU are the only enforcement point.');
        expect(body).toContain('## How it works (GitHub Copilot CLI)');
      }
    });

    test('/guard carries the rules inline, not a pointer to sibling skills', () => {
      if (!fs.existsSync(gen('gstack-guard'))) return;
      const body = fs.readFileSync(gen('gstack-guard'), 'utf-8');
      // It must not depend on /careful or /freeze being loaded into context.
      expect(body).toContain('the rules you need are right here');
      expect(body).toContain('DROP TABLE');
      expect(body).toContain('kubectl delete');
      expect(body).toContain('node_modules');
      expect(body).not.toContain('Two protections are now running:');
    });

    test('no shipped copilot skill uses an unassigned $GSTACK_ROOT', () => {
      const dir = path.join(ROOT, '.copilot', 'skills');
      if (!fs.existsSync(dir)) return;
      const broken: string[] = [];
      for (const s of fs.readdirSync(dir)) {
        const p = path.join(dir, s, 'SKILL.md');
        if (!fs.existsSync(p)) continue;
        const body = fs.readFileSync(p, 'utf-8');
        // A bare $GSTACK_ROOT (no `${GSTACK_ROOT:-` default) in a skill that never assigns it.
        if (/\$GSTACK_ROOT\b/.test(body) && !/GSTACK_ROOT=/.test(body)) broken.push(s);
      }
      expect(broken).toEqual([]);
    });
  });

  // Parity guard: upstream's own (claude) output must still describe the hook, because on Claude
  // Code the hook genuinely IS the enforcement mechanism. Failure here means the adapter leaked
  // out of the copilot host.
  test('PARITY: committed claude-host output still credits the hook', () => {
    let checked = 0;
    for (const skill of ['careful', 'freeze']) {
      const p = path.join(ROOT, skill, 'SKILL.md');
      if (!fs.existsSync(p)) continue;
      const claude = fs.readFileSync(p, 'utf-8');
      expect(claude).toContain('permissionDecision');
      expect(claude).not.toContain('GitHub Copilot CLI enforcement.');
      checked++;
    }
    expect(checked).toBeGreaterThan(0);
  });
});
