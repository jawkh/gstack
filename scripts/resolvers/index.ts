/**
 * RESOLVERS record — maps {{PLACEHOLDER}} names to generator functions
 * or gated entries.
 *
 * Each resolver takes a TemplateContext and returns the replacement string.
 * Resolvers may be either a bare function (always fires) or a gated entry
 * ({ resolve, appliesTo }) where appliesTo can return false to skip the
 * resolver for a given skill. See ./types.ts: ResolverEntry.
 *
 * Most resolvers don't need a gate — the {{NAME}} placeholder system is
 * already conditional at the template level (the resolver only fires for
 * skills that reference it). Use a gate when you want a structural
 * guardrail that says "this placeholder is meaningful only in skills X, Y, Z"
 * even if someone later adds {{NAME}} to skill W.
 */

import type { TemplateContext, ResolverFn, ResolverValue } from './types';
import { unwrapResolver } from './types';
import { ghcpVoiceFor, GHCP_VOICE_PLACEHOLDERS } from './ghcp/multimodel-voices';

// Domain modules
import { generatePreamble } from './preamble';
import { generateTestFailureTriage } from './preamble';
import { generateCommandReference, generateSnapshotFlags, generateBrowseSetup } from './browse';
import { generateDesignMethodology, generateDesignHardRules, generateDesignOutsideVoices, generateDesignReviewLite, generateDesignSketch, generateDesignSetup, generateDesignMockup, generateDesignShotgunLoop, generateTasteProfile, generateUXPrinciples } from './design';
import { generateTestBootstrap, generateTestCoverageAuditPlan, generateTestCoverageAuditShip, generateTestCoverageAuditReview } from './testing';
import { generateReviewDashboard, generatePlanFileReviewReport, generateExitPlanModeGate, generateAntiShortcutClause, generateSpecReviewLoop, generateBenefitsFrom, generateCodexSecondOpinion, generateAdversarialStep, generateCodexPlanReview, generateCodexDocReview, generatePlanCompletionAuditShip, generatePlanCompletionAuditReview, generatePlanVerificationExec, generateScopeDrift, generateCrossReviewDedup } from './review';
import { generateSlugEval, generateSlugSetup, generateBaseBranchDetect, generateDeployBootstrap, generateQAMethodology, generateCoAuthorTrailer, generateChangelogWorkflow } from './utility';
import { generateLearningsSearch, generateLearningsLog } from './learnings';
import { generateConfidenceCalibration } from './confidence';
import { generateInvokeSkill } from './composition';
import { generateReviewArmy } from './review-army';
import { generateDxFramework } from './dx';
import { generateModelOverlay } from './model-overlay';
import { generateGBrainContextLoad, generateGBrainSaveResults, generateBrainPreflight, generateBrainCacheRefresh, generateBrainWriteBack } from './gbrain';
import { generateQuestionPreferenceCheck, generateQuestionLog, generateInlineTuneFeedback } from './question-tuning';
import { generateMakePdfSetup } from './make-pdf';
import { generateTasksSectionEmit, generateTasksSectionAggregate } from './tasks-section';
import { SECTION, SECTION_INDEX } from './sections';
import { generateRedactTaxonomyTable, generateRedactInvocationBlock } from './redact-doc';

export const RESOLVERS: Record<string, ResolverValue> = {
  SLUG_EVAL: generateSlugEval,
  SLUG_SETUP: generateSlugSetup,
  REDACT_TAXONOMY_TABLE: generateRedactTaxonomyTable,
  REDACT_INVOCATION_BLOCK: generateRedactInvocationBlock,
  COMMAND_REFERENCE: generateCommandReference,
  SNAPSHOT_FLAGS: generateSnapshotFlags,
  PREAMBLE: generatePreamble,
  BROWSE_SETUP: generateBrowseSetup,
  BASE_BRANCH_DETECT: generateBaseBranchDetect,
  QA_METHODOLOGY: generateQAMethodology,
  DESIGN_METHODOLOGY: generateDesignMethodology,
  DESIGN_HARD_RULES: generateDesignHardRules,
  UX_PRINCIPLES: generateUXPrinciples,
  DESIGN_OUTSIDE_VOICES: generateDesignOutsideVoices,
  DESIGN_REVIEW_LITE: generateDesignReviewLite,
  REVIEW_DASHBOARD: generateReviewDashboard,
  PLAN_FILE_REVIEW_REPORT: generatePlanFileReviewReport,
  EXIT_PLAN_MODE_GATE: generateExitPlanModeGate,
  ANTI_SHORTCUT_CLAUSE: generateAntiShortcutClause,
  TEST_BOOTSTRAP: generateTestBootstrap,
  TEST_COVERAGE_AUDIT_PLAN: generateTestCoverageAuditPlan,
  TEST_COVERAGE_AUDIT_SHIP: generateTestCoverageAuditShip,
  TEST_COVERAGE_AUDIT_REVIEW: generateTestCoverageAuditReview,
  TEST_FAILURE_TRIAGE: generateTestFailureTriage,
  SPEC_REVIEW_LOOP: generateSpecReviewLoop,
  DESIGN_SKETCH: generateDesignSketch,
  DESIGN_SETUP: generateDesignSetup,
  DESIGN_MOCKUP: generateDesignMockup,
  DESIGN_SHOTGUN_LOOP: generateDesignShotgunLoop,
  BENEFITS_FROM: generateBenefitsFrom,
  CODEX_SECOND_OPINION: generateCodexSecondOpinion,
  ADVERSARIAL_STEP: generateAdversarialStep,
  SCOPE_DRIFT: generateScopeDrift,
  DEPLOY_BOOTSTRAP: generateDeployBootstrap,
  CODEX_PLAN_REVIEW: generateCodexPlanReview,
  CODEX_DOC_REVIEW: generateCodexDocReview,
  PLAN_COMPLETION_AUDIT_SHIP: generatePlanCompletionAuditShip,
  PLAN_COMPLETION_AUDIT_REVIEW: generatePlanCompletionAuditReview,
  PLAN_VERIFICATION_EXEC: generatePlanVerificationExec,
  CO_AUTHOR_TRAILER: generateCoAuthorTrailer,
  LEARNINGS_SEARCH: generateLearningsSearch,
  LEARNINGS_LOG: generateLearningsLog,
  CONFIDENCE_CALIBRATION: generateConfidenceCalibration,
  INVOKE_SKILL: generateInvokeSkill,
  CHANGELOG_WORKFLOW: generateChangelogWorkflow,
  REVIEW_ARMY: generateReviewArmy,
  CROSS_REVIEW_DEDUP: generateCrossReviewDedup,
  DX_FRAMEWORK: generateDxFramework,
  MODEL_OVERLAY: generateModelOverlay,
  TASTE_PROFILE: generateTasteProfile,
  BIN_DIR: (ctx) => ctx.paths.binDir,
  GBRAIN_CONTEXT_LOAD: generateGBrainContextLoad,
  GBRAIN_SAVE_RESULTS: generateGBrainSaveResults,
  BRAIN_PREFLIGHT: generateBrainPreflight,
  BRAIN_CACHE_REFRESH: generateBrainCacheRefresh,
  BRAIN_WRITE_BACK: generateBrainWriteBack,
  QUESTION_PREFERENCE_CHECK: generateQuestionPreferenceCheck,
  QUESTION_LOG: generateQuestionLog,
  INLINE_TUNE_FEEDBACK: generateInlineTuneFeedback,
  MAKE_PDF_SETUP: generateMakePdfSetup,
  TASKS_SECTION_EMIT: generateTasksSectionEmit,
  TASKS_SECTION_AGGREGATE: generateTasksSectionAggregate,
  SECTION,
  SECTION_INDEX,
};

// ── FORK (GHCP): native multi-model voices replace Codex for the copilot host ───────────────
// In-place registry intercept (decorator). For the copilot host, the codex / outside-voice
// placeholders render ghcpVoiceFor(key, ctx) — the multi-model `task` panel — exactly where the
// skill's step runs, instead of `codex exec`. Every upstream resolver body stays untouched, so
// upstream syncs don't conflict here, and other hosts are byte-for-byte unaffected. The only
// other fork edits for codex neutralization are 2 embedded design guards + 1 plan-mode mention.
// See scripts/resolvers/ghcp/.
for (const key of GHCP_VOICE_PLACEHOLDERS) {
  const upstream = RESOLVERS[key];
  if (!upstream) continue;
  const { resolve: upstreamFn, appliesTo } = unwrapResolver(upstream);
  const wrapped: ResolverFn = (ctx, args) =>
    ctx.host === 'copilot' ? ghcpVoiceFor(key, ctx) : upstreamFn(ctx, args);
  RESOLVERS[key] = appliesTo ? { resolve: wrapped, appliesTo } : wrapped;
}
