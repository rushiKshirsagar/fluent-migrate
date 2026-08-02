import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { buildPlan } from '../src/core/plan/index.js';
import { buildPromptPack, type PromptPack } from '../src/core/prompt/index.js';
import { scanProject } from '../src/core/scan/index.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures/app');

let pack: PromptPack;
const promptText = () => pack.files.find((file) => file.name === 'PROMPT.md')?.contents ?? '';

beforeAll(async () => {
  pack = await buildPromptPack(buildPlan(await scanProject({ root })));
});

describe('buildPromptPack', () => {
  it('writes a brief and the plan', () => {
    expect(pack.files.map((file) => file.name).sort()).toEqual(['PROMPT.md', 'plan.json']);
    const plan = pack.files.find((file) => file.name === 'plan.json');
    expect(() => JSON.parse(plan?.contents ?? '')).not.toThrow();
  });

  it('folds a stylesheet into the component that imports it', () => {
    const card = pack.components.find((c) => c.file === path.join('src', 'components/Card.tsx'));
    expect(card?.stylesheets).toEqual([path.join('src', 'components/Card.css')]);
    expect(pack.components.map((c) => c.file)).not.toContain(
      path.join('src', 'components/Card.css'),
    );
  });

  it('keeps an unimported stylesheet as its own unit of work', () => {
    expect(pack.components.map((c) => c.file)).toContain(path.join('src', 'styles/variables.scss'));
  });

  it('states the token for every color it can place', () => {
    const text = promptText();
    expect(text).toContain('`tokens.colorNeutralForeground1`');
    expect(text).toContain('`tokens.colorNeutralShadowKey`');
  });

  it('calls out colors that must stay hard-coded', () => {
    const text = promptText();
    expect(text).toContain('## Colors with no token');
    expect(text).toContain('`#0f6cbd1a`');
  });

  it('explains the light and dark pairs', () => {
    const text = promptText();
    expect(text).toContain('## Light and dark pairs');
    expect(text).toContain('`--app-text`');
    expect(text).toContain('colorNeutralBackground3 (light) / colorNeutralBackground1 (dark)');
  });

  it('tells the agent to use makeStyles and not to choose tokens itself', () => {
    const text = promptText();
    expect(text).toContain('makeStyles');
    expect(text).toContain('do not pick tokens');
    expect(text).toContain('FluentProvider');
  });
});
