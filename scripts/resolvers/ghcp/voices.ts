/**
 * GHCP multi-model review voices — fork-owned single source of truth.
 *
 * Upstream gstack gets a "second voice" by shelling out to the OpenAI Codex CLI
 * (`codex exec`). On the GitHub Copilot CLI harness there is no codex binary, and
 * the codex->copilot shim was retired. Instead, GHCP gives every review/adversarial
 * voice for free via the `task` tool's `model` parameter: dispatch sub-agents on
 * diverse frontier models and let their independence do the work.
 *
 * This module is the ONLY place the model roster lives. The resolver
 * (ghcp/multimodel-voices.ts) and the contract test both import it, so changing a
 * model or effort is a one-line edit pinned by a test. host != model: these are the
 * runtime models a review sub-agent is dispatched to, not the generation `--model`
 * axis (see scripts/models.ts / model-overlays/).
 *
 * IDs + efforts are grounded in the GHCP model matrix
 * (~/Developer/AI-Works/obsidian/AI Memory/_Global/ghcp-models.md). Refresh via
 * /ghcp-models-analysis when new models ship. Respect each model's real effort
 * ceiling — gpt-5.x top out at `xhigh`, gemini-3.1-pro-preview at `high`, only
 * Opus exposes `max`.
 */

export interface ReviewVoice {
  /** GHCP task-tool model id. */
  model: string;
  /** reasoning_effort to request (must be within the model's real ceiling). */
  effort: string;
  /** Model family — used to assert genuine cross-family diversity. */
  family: string;
  /** One-line rationale for including this voice. */
  role: string;
}

/** The implementer / primary model. Reviewer voices must differ from this. */
export const IMPLEMENTER_MODEL = 'claude-opus-4.8';

/**
 * Independent reviewer voices, dispatched in parallel for a diverse panel.
 * Two non-Claude frontier families so the panel disagrees in useful ways.
 */
export const REVIEW_VOICES: ReviewVoice[] = [
  {
    model: 'gpt-5.5',
    effort: 'xhigh',
    family: 'gpt',
    role: '#1 SWE-bench Verified + Terminal-Bench; frontier non-Claude voice',
  },
  {
    model: 'gemini-3.1-pro-preview',
    effort: 'high',
    family: 'gemini',
    role: 'Frontier long-context reasoner; a third model family for true diversity',
  },
];

/** Optional fast/cheap reviewer for breadth sweeps (not in the default panel). */
export const FAST_VALUE_VOICE: ReviewVoice = {
  model: 'gemini-3.5-flash',
  effort: 'high',
  family: 'gemini',
  role: 'Best per-token value, ~4x faster; for breadth sweeps when token cost matters',
};
