// Fork-owned contract test (GHCP): native multi-model review voices replace the codex "second
// voice" on the copilot host via an IN-PLACE resolver-registry intercept (scripts/resolvers/
// index.ts). Fenced in a fork-only file so it never conflicts with upstream. See ghcp/.
import { describe, test, expect } from 'bun:test';

describe('GHCP multi-model review voices (registry intercept)', () => {
  const { ghcpVoiceFor, GHCP_VOICE_PLACEHOLDERS } = require('../scripts/resolvers/ghcp/multimodel-voices');
  const { REVIEW_VOICES, IMPLEMENTER_MODEL } = require('../scripts/resolvers/ghcp/voices');
  const { RESOLVERS } = require('../scripts/resolvers/index');
  const { unwrapResolver, HOST_PATHS } = require('../scripts/resolvers/types');

  const ctxFor = (host: string, skillName: string) => ({
    skillName,
    tmplPath: `${skillName}/SKILL.md.tmpl`,
    host,
    paths: HOST_PATHS[host],
  });
  // Render a placeholder through the live registry (proves the intercept is wired).
  const render = (key: string, ctx: any) => unwrapResolver(RESOLVERS[key]).resolve(ctx);

  test('voice roster SoT: diverse non-Claude frontier families, efforts within model ceilings', () => {
    const families = REVIEW_VOICES.map((v: any) => v.family);
    expect(families).toContain('gpt');
    expect(families).toContain('gemini');
    expect(REVIEW_VOICES.map((v: any) => v.model)).not.toContain(IMPLEMENTER_MODEL);
    expect(REVIEW_VOICES.find((v: any) => v.model === 'gpt-5.5').effort).toBe('xhigh');
    expect(REVIEW_VOICES.find((v: any) => v.model === 'gemini-3.1-pro-preview').effort).toBe('high');
  });

  test('ghcpVoiceFor renders multi-model dispatch for every placeholder on copilot, never codex', () => {
    for (const key of GHCP_VOICE_PLACEHOLDERS) {
      const out = ghcpVoiceFor(key, ctxFor('copilot', 'review'));
      expect(out).toContain('gpt-5.5');
      expect(out).toContain('gemini-3.1-pro-preview');
      expect(out).not.toContain('codex exec');
      expect(out.length).toBeGreaterThan(50);
    }
  });

  test('ADVERSARIAL_STEP preserves the in-place step heading (review 5.7 vs ship 11)', () => {
    expect(ghcpVoiceFor('ADVERSARIAL_STEP', ctxFor('copilot', 'review'))).toContain('Step 5.7');
    expect(ghcpVoiceFor('ADVERSARIAL_STEP', ctxFor('copilot', 'ship'))).toContain('Step 11');
  });

  test('ghcpVoiceFor returns empty for non-copilot host and unknown keys', () => {
    expect(ghcpVoiceFor('CODEX_SECOND_OPINION', ctxFor('claude', 'review'))).toBe('');
    expect(ghcpVoiceFor('NOT_A_PLACEHOLDER', ctxFor('copilot', 'review'))).toBe('');
  });

  test('GHCP_VOICE_PLACEHOLDERS covers the codex / outside-voice placeholders', () => {
    for (const k of ['CODEX_SECOND_OPINION', 'ADVERSARIAL_STEP', 'CODEX_PLAN_REVIEW', 'CODEX_DOC_REVIEW', 'DESIGN_OUTSIDE_VOICES']) {
      expect(GHCP_VOICE_PLACEHOLDERS).toContain(k);
    }
  });

  // The load-bearing test: the registry intercept is actually wired, AND other hosts are untouched.
  test('registry intercept WIRED: copilot renders multi-model in place; claude keeps upstream codex', () => {
    // office-hours uses {{CODEX_SECOND_OPINION}} — on copilot it must render the panel in place
    // (no blank Phase 3.5 gap), with zero codex.
    const cop = render('CODEX_SECOND_OPINION', ctxFor('copilot', 'office-hours'));
    expect(cop).toContain('gpt-5.5');
    expect(cop).not.toContain('codex exec');
    // claude path must be byte-for-byte the upstream codex flow (no regression, no multi-model leak)
    const cla = render('ADVERSARIAL_STEP', ctxFor('claude', 'review'));
    expect(cla).toContain('codex exec');
    expect(cla).not.toContain('gpt-5.5');
  });
});
