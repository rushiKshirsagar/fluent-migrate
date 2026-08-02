import { mkdtemp, readFile, rm, cp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { applyFix, planFix, type FixResult } from '../src/core/fix/index.js';
import { insideColorFunction } from '../src/core/fix/guards.js';
import { checkWorkTree } from '../src/core/fix/git.js';
import { buildPlan } from '../src/core/plan/index.js';
import { scanProject } from '../src/core/scan/index.js';

const fixture = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures/app');

let root: string;
let result: FixResult;

const change = (file: string) =>
  result.changes.find((c) => c.file === path.join('src', file));
const skipsIn = (file: string) =>
  result.skipped.filter((s) => s.file === path.join('src', file));

beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'fluent-migrate-'));
  await cp(fixture, root, { recursive: true });
  result = await planFix(buildPlan(await scanProject({ root })));
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('planFix', () => {
  it('rewrites literals to the css variable for their token', () => {
    const css = change('components/Card.css');
    expect(css?.after).toContain('background-color: var(--colorNeutralBackground1);');
    expect(css?.after).toContain('color: var(--colorNeutralForeground1);');
    expect(css?.after).not.toContain('#ffffff');
  });

  it('handles several colors on one line', () => {
    expect(change('components/Card.css')?.after).toContain(
      'linear-gradient(90deg, var(--colorStatusDangerBackground3) 0%, var(--colorStatusDangerBackground3Hover) 100%)',
    );
  });

  it('rewrites colors inside jsx and template literals', () => {
    expect(change('components/Card.tsx')?.after).toContain(
      "backgroundColor: 'var(--colorBrandBackground)'",
    );
    expect(change('components/Button.tsx')?.after).toContain(
      'background-color: var(--colorBrandBackground);',
    );
  });

  it('changes nothing outside the color literals', () => {
    for (const file of result.changes) {
      expect(file.after.split('\n').length).toBe(file.before.split('\n').length);
    }
    expect(change('components/Card.css')?.after).toContain("url('/img/#notacolor.png')");
  });

  it('leaves sass variables alone by default', () => {
    const reasons = skipsIn('styles/variables.scss').map((skip) => skip.reason);
    expect(reasons).toContain('preprocessor-variable');
    expect(change('styles/variables.scss')?.after).toContain('$brand-primary: #0f6cbd;');
  });

  it('rewrites sass variables when asked', async () => {
    const optedIn = await planFix(buildPlan(await scanProject({ root })), {
      rewritePreprocessorVariables: true,
    });
    const scss = optedIn.changes.find((c) => c.file === path.join('src', 'styles/variables.scss'));
    expect(scss?.after).toContain('$brand-primary: var(--colorBrandBackground);');
  });

  it('skips colors with no good token', () => {
    const skip = result.skipped.find((s) => s.raw === 'rgba(15, 108, 189, 0.1)');
    expect(skip?.reason).toBe('no-token');
  });

  it('honours the accept threshold', async () => {
    const plan = buildPlan(await scanProject({ root }));
    const strict = await planFix(plan, { accept: 'exact' });
    const loose = await planFix(plan, { accept: 'close' });
    expect(strict.edits).toBeLessThan(loose.edits);
    expect(strict.skipped.some((skip) => skip.reason === 'below-threshold')).toBe(true);
  });

  it('records the theme so redundant dark overrides can be reported', () => {
    const dark = result.changes.flatMap((c) => c.edits).filter((edit) => edit.theme === 'dark');
    expect(dark.length).toBeGreaterThan(0);
  });
});

describe('applyFix', () => {
  it('writes exactly what was previewed', async () => {
    const scratch = await mkdtemp(path.join(tmpdir(), 'fluent-migrate-write-'));
    await cp(fixture, scratch, { recursive: true });

    const preview = await planFix(buildPlan(await scanProject({ root: scratch })));
    await applyFix(scratch, preview);

    for (const file of preview.changes) {
      expect(await readFile(path.join(scratch, file.file), 'utf8')).toBe(file.after);
    }

    // A second pass has nothing left to do.
    const again = await planFix(buildPlan(await scanProject({ root: scratch })));
    expect(again.edits).toBe(0);

    await rm(scratch, { recursive: true, force: true });
  });
});

describe('checkWorkTree', () => {
  const run = promisify(execFile);
  const git = (cwd: string, ...args: string[]) => run('git', ['-C', cwd, ...args]);

  it('refuses a directory that git cannot undo', async () => {
    const plain = await mkdtemp(path.join(tmpdir(), 'fluent-migrate-plain-'));
    expect(await checkWorkTree(plain)).toMatchObject({ safe: false, reason: 'not-a-repo' });
    await rm(plain, { recursive: true, force: true });
  });

  it('refuses a tree with uncommitted changes', async () => {
    const repo = await mkdtemp(path.join(tmpdir(), 'fluent-migrate-dirty-'));
    await cp(fixture, repo, { recursive: true });
    await git(repo, 'init', '-q');
    await git(repo, 'config', 'user.email', 'test@example.com');
    await git(repo, 'config', 'user.name', 'test');
    await git(repo, 'add', '-A');
    await git(repo, 'commit', '-qm', 'fixture');

    expect(await checkWorkTree(repo)).toEqual({ safe: true });

    await writeFile(path.join(repo, 'src/theme.ts'), 'export const theme = {};\n');
    expect(await checkWorkTree(repo)).toMatchObject({ safe: false, reason: 'dirty' });

    await rm(repo, { recursive: true, force: true });
  });
});

describe('insideColorFunction', () => {
  const at = (source: string, needle: string) =>
    insideColorFunction(source, source.indexOf(needle));

  it('detects literals being transformed by a preprocessor', () => {
    expect(at('color: darken(#0f6cbd, 10%);', '#0f6cbd')).toBe(true);
    expect(at('color: rgba(#0f6cbd, 0.5);', '#0f6cbd')).toBe(true);
    expect(at('background: mix(#fff, #000, 50%);', '#000')).toBe(true);
  });

  it('leaves plain values alone', () => {
    expect(at('color: #0f6cbd;', '#0f6cbd')).toBe(false);
    expect(at('color: rgba(0, 0, 0, 0.5);', 'rgba')).toBe(false);
    expect(at('width: calc(100% - #0f6cbd);', '#0f6cbd')).toBe(false);
    expect(at('background: linear-gradient(90deg, #ffffff, #000);', '#ffffff')).toBe(false);
  });
});
