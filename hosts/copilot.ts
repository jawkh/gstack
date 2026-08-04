import type { HostConfig } from '../scripts/host-config';

const copilot: HostConfig = {
  name: 'copilot',
  displayName: 'GitHub Copilot CLI',
  cliCommand: 'copilot',
  cliAliases: [],

  globalRoot: '.copilot/skills/gstack',
  localSkillRoot: '.copilot/skills/gstack',
  hostSubdir: '.copilot',
  usesEnvVars: true,

  frontmatter: {
    mode: 'allowlist',
    keepFields: ['name', 'description'],
    descriptionLimit: 1024,
    descriptionLimitBehavior: 'error',
  },

  generation: {
    generateMetadata: false,
    skipSkills: ['codex', 'claude'],
  },

  pathRewrites: [
    { from: '~/.claude/skills/gstack', to: '$GSTACK_ROOT' },
    { from: '.claude/skills/gstack', to: '.copilot/skills/gstack' },
    { from: '.claude/skills/review', to: '.copilot/skills/gstack/review' },
    { from: '.claude/skills', to: '.copilot/skills' },
  ],
  toolRewrites: {
    'use the Bash tool': 'use the bash tool',
    'use the Write tool': 'use apply_patch',
    'use the Read tool': 'use the view tool',
    'use the Edit tool': 'use apply_patch',
    'use the Agent tool': 'use the task tool',
    'use the Grep tool': 'use the rg tool',
    'use the Glob tool': 'use the glob tool',
    'the Bash tool': 'the bash tool',
    'the Write tool': 'apply_patch',
    'the Read tool': 'the view tool',
    'the Edit tool': 'apply_patch',
    'the Agent tool': 'the task tool',
    'the Grep tool': 'the rg tool',
    'the Glob tool': 'the glob tool',
    AskUserQuestion: 'ask_user',
    WebSearch: 'web_search',
  },
  textRewrites: {
    'Generated with [Claude Code](https://claude.com/claude-code)': 'Generated with [GitHub Copilot CLI](https://github.com/features/copilot)',
    'Claude Code': 'GitHub Copilot CLI',
  },

  suppressedResolvers: ['GBRAIN_CONTEXT_LOAD', 'GBRAIN_SAVE_RESULTS'],

  // Structural-only: rewrites the Codex-CLI bash blocks autoplan/spec hardcode (not placeholder-
  // based, so the resolver intercept can't reach them) into the native multi-model panel. Keeps
  // upstream Codex prose verbatim for mergeability. Copilot-only.
  adapter: 'scripts/host-adapters/copilot-adapter.ts',

  runtimeRoot: {
    globalSymlinks: [
      'bin',
      // bin/gstack-{learnings,question,telemetry}-log import `$SCRIPT_DIR/../lib/*.ts`.
      // SCRIPT_DIR is resolved logically (cd+pwd, no -P), so it stays inside this runtime
      // root — without lib/ here those imports die with "Cannot find module".
      'lib',
      'browse/dist',
      'browse/bin',
      'design/dist',
      'make-pdf/dist',
      'gstack-upgrade',
      'ETHOS.md',
      'review/specialists',
      'qa/templates',
      'qa/references',
      'plan-devex-review/dx-hall-of-fame.md',
    ],
    globalFiles: {
      'review': ['checklist.md', 'design-checklist.md', 'greptile-triage.md', 'TODOS-format.md'],
    },
  },

  install: {
    prefixable: false,
    linkingStrategy: 'symlink-generated',
  },

  coAuthorTrailer: 'Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>',
  learningsMode: 'basic',
};

export default copilot;
