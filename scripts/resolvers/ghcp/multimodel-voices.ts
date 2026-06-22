/**
 * Multi-model review voices — GitHub Copilot CLI only.
 *
 * Replaces the upstream Codex "second voice" with native GHCP multi-model dispatch via the
 * `task` tool's `model` parameter. Wired as an IN-PLACE registry intercept (decorator) in
 * scripts/resolvers/index.ts: for the copilot host, the codex/outside-voice placeholders render
 * `ghcpVoiceFor(key, ctx)` instead of `codex exec`, so the multi-model panel appears exactly
 * where the skill's step runs (preserving "Step N: Adversarial review", office-hours Phase 3.5,
 * etc.). Every upstream resolver body stays untouched — the only fork edit is the intercept loop.
 *
 * Copilot-gated and keyed by placeholder so each role (second opinion / adversarial / plan /
 * doc / design) gets framing that matches the step it replaces. Returns '' for any other host,
 * so claude/codex/etc. keep upstream's codex flow verbatim.
 */
import type { TemplateContext } from '../types';
import { REVIEW_VOICES, IMPLEMENTER_MODEL } from './voices';

interface VoiceRole {
  heading: (ctx: TemplateContext) => string;
  intro: string;
  framing: string;
}

/**
 * Role per intercepted placeholder. The keys ARE the set of registered codex/outside-voice
 * placeholders the intercept swaps for copilot (GHCP_VOICE_PLACEHOLDERS is derived from them),
 * so adding a role here is the single edit needed to cover a new codex placeholder.
 */
const VOICE_ROLES: Record<string, VoiceRole> = {
  CODEX_SECOND_OPINION: {
    heading: () => '## Independent second opinion (multi-model)',
    intro: 'Get an independent cold read of this change or plan from diverse models.',
    framing: 'Each voice reads fresh and surfaces where it disagrees with the implementer.',
  },
  ADVERSARIAL_STEP: {
    heading: ctx => `## Step ${ctx.skillName === 'ship' ? '11' : '5.7'}: Adversarial review (multi-model, always-on)`,
    intro: 'Every diff gets an adversarial pass from diverse models. LOC is not a proxy for risk.',
    framing:
      'Frame each voice as an attacker + chaos engineer: edge cases, race conditions, security ' +
      'holes, resource leaks, silent data-corruption paths. No compliments. End each with one ' +
      '`Recommendation: <action> because <the most exploitable finding>`.',
  },
  CODEX_PLAN_REVIEW: {
    heading: () => '## Outside voice: independent plan review (multi-model)',
    intro: 'An independent critique of the plan from diverse models.',
    framing: 'Hunt for gaps, wrong assumptions, and missing acceptance criteria.',
  },
  CODEX_DOC_REVIEW: {
    heading: () => '## Outside voice: independent docs review (multi-model)',
    intro: 'An independent review of the docs from diverse models.',
    framing: 'Check accuracy, completeness, and whether the examples actually run.',
  },
  DESIGN_OUTSIDE_VOICES: {
    heading: () => '## Outside design voices (multi-model)',
    intro: 'Independent design perspectives from diverse models.',
    framing: 'Each proposes a visual thesis + interaction direction; contrast them against the implementer.',
  },
};

/** The registered placeholders the copilot intercept swaps for native multi-model voices. */
export const GHCP_VOICE_PLACEHOLDERS = Object.keys(VOICE_ROLES);

/**
 * Render the native multi-model voice block for a given placeholder, copilot-only.
 * Called by the registry intercept in index.ts; returns '' for non-copilot or unknown keys.
 */
export function ghcpVoiceFor(key: string, ctx: TemplateContext): string {
  if (ctx.host !== 'copilot') return '';
  const role = VOICE_ROLES[key];
  if (!role) return '';

  const rosterRows = REVIEW_VOICES.map(v => `| \`${v.model}\` | \`${v.effort}\` | ${v.role} |`).join('\n');
  const dispatch = REVIEW_VOICES.map(
    v => `\`task(model="${v.model}", reasoning_effort="${v.effort}", ...)\``,
  ).join(' and ');

  return `${role.heading(ctx)}

${role.intro} Independent voices come from the \`task\` tool's \`model\` param — the Codex
voice runs as the \`gpt-5.3-codex\` model (model diversity is the point; never run every voice on
one model). The implementer is \`${IMPLEMENTER_MODEL}\`; reviewer voices MUST differ from it.

| Reviewer model | Effort | Why this voice |
|---|---|---|
${rosterRows}

Launch ${dispatch} **in parallel** (one \`task\` call each), same prompt + scope for each, then
consolidate. ${role.framing} Pass \`reasoning_effort\` directly and respect each model's ceiling
(gpt-5.x top at \`xhigh\`, gemini-3.1-pro-preview at \`high\`, only Opus exposes \`max\`); on a
\`CAPIError 400\` effort rejection or a \`total_turns: 0\` premature exit, relaunch one rung lower on
that model's ladder — never abandon a voice. These voices inform; they never gate shipping.`;
}
