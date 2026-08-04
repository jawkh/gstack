// Fork-owned regression test (GHCP): the copilot runtime root must carry every top-level
// directory that bin/ scripts import at runtime.
//
// The bug this pins: bin/gstack-{learnings,question,telemetry}-log resolve their imports as
//   SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"      # logical path — NOT `pwd -P`
//   import { ... } from '$SCRIPT_DIR/../lib/jsonl-store.ts'
// Because SCRIPT_DIR is logical, it stays inside the install root (~/.copilot/skills/gstack)
// rather than resolving through the `bin` symlink back to the source checkout. The copilot
// runtime root symlinked `bin` but not `lib`, so every one of those scripts died with
// "Cannot find module .../lib/jsonl-store.ts" — silently breaking learnings capture,
// question-tuning history and telemetry for the whole host.
//
// Claude Code never hit this: its install is a full git clone, so lib/ is physically present.
// The upstream host configs share the same gap and are exposed the moment a host installs as a
// sparse symlink farm — tracked here rather than patched across 10 upstream-tracked files.
//
// Fenced in a fork-only file so it never conflicts with upstream.
import { describe, test, expect } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..');
const copilotHost = require('../hosts/copilot').default;

/** Top-level dirs that bin/ scripts reach for via a `$VAR/../<dir>/` runtime reference. */
function importedTopLevelDirs(): Map<string, string[]> {
  const binDir = path.join(ROOT, 'bin');
  const found = new Map<string, string[]>();
  if (!fs.existsSync(binDir)) return found;

  for (const entry of fs.readdirSync(binDir)) {
    const p = path.join(binDir, entry);
    if (!fs.statSync(p).isFile()) continue;

    const buf = fs.readFileSync(p);
    // bin/ ships compiled binaries too; decoding one as UTF-8 yields garbage that can
    // coincidentally contain `/../something/` and invent a phantom dependency.
    if (buf.includes(0)) continue;
    const body = buf.toString('utf-8');

    // Anchor on a shell variable (`$SCRIPT_DIR/../lib/`, `${GSTACK_ROOT}/../x/`) so this
    // tracks real runtime path resolution, not prose in a comment.
    for (const m of body.matchAll(/\$\{?[A-Za-z_][A-Za-z0-9_]*\}?\/\.\.\/([A-Za-z0-9_-]+)\//g)) {
      const dir = m[1];
      if (!found.has(dir)) found.set(dir, []);
      const list = found.get(dir)!;
      if (!list.includes(entry)) list.push(entry);
    }
  }
  return found;
}

describe('GHCP runtime root completeness', () => {
  test('bin scripts do reach outside bin/ (guard against a vacuous test)', () => {
    const dirs = importedTopLevelDirs();
    // If this ever empties out, the invariant tests below would pass trivially.
    expect(dirs.size).toBeGreaterThan(0);
    expect([...dirs.keys()]).toContain('lib');
  });

  test('every dir a bin script imports is symlinked into the copilot runtime root', () => {
    const links: string[] = copilotHost.runtimeRoot.globalSymlinks;
    // A declared link may be nested ('browse/dist'); compare on the top-level segment.
    const topLevel = new Set(links.map((l: string) => l.split('/')[0]));

    const missing: string[] = [];
    for (const [dir, scripts] of importedTopLevelDirs()) {
      if (!topLevel.has(dir)) missing.push(`${dir}/ (imported by ${scripts.join(', ')})`);
    }
    expect(missing).toEqual([]);
  });

  test('setup actually links each declared top-level dir into the copilot runtime root', () => {
    const setupPath = path.join(ROOT, 'setup');
    if (!fs.existsSync(setupPath)) return;
    const setup = fs.readFileSync(setupPath, 'utf-8');

    // Isolate the fork-owned copilot runtime-root builder; a link declared in the host config
    // but never created by setup is still a broken install.
    const start = setup.indexOf('create_copilot_runtime_root()');
    expect(start).toBeGreaterThan(-1);
    const end = setup.indexOf('\nlink_copilot_skill_dirs()', start);
    const fn = setup.slice(start, end > start ? end : undefined);

    for (const dir of importedTopLevelDirs().keys()) {
      expect(fn).toContain(`_link_or_copy "$gstack_dir/${dir}" "$copilot_gstack/${dir}"`);
    }
  });

  test('the lib modules those scripts import actually exist in the source tree', () => {
    const binDir = path.join(ROOT, 'bin');
    const missing: string[] = [];
    for (const entry of fs.readdirSync(binDir)) {
      const p = path.join(binDir, entry);
      if (!fs.statSync(p).isFile()) continue;
      const buf = fs.readFileSync(p);
      if (buf.includes(0)) continue; // compiled binary, not a script
      for (const m of buf.toString('utf-8').matchAll(/\$\{?[A-Za-z_][A-Za-z0-9_]*\}?\/\.\.\/(lib\/[A-Za-z0-9_.-]+\.ts)/g)) {
        if (!fs.existsSync(path.join(ROOT, m[1]))) missing.push(`${entry} -> ${m[1]}`);
      }
    }
    expect(missing).toEqual([]);
  });
});
