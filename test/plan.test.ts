import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { buildPlan, serializePlan, type MigrationPlan } from '../src/core/plan/index.js';
import { scanProject } from '../src/core/scan/index.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures/app');

let plan: MigrationPlan;
const entry = (hex: string, usage: string) =>
  plan.entries.find((e) => e.hex === hex && e.usage === usage);

beforeAll(async () => {
  plan = buildPlan(await scanProject({ root }));
});

describe('buildPlan', () => {
  it('splits a color into one entry per role', () => {
    expect(entry('#ffffff', 'text')?.best?.token.role).toBe('foreground');
    expect(entry('#ffffff', 'background')?.best?.token.name).toBe('colorNeutralBackground1');
  });

  it('keeps light and dark uses of one color apart', () => {
    const light = plan.entries.filter((e) => e.hex === '#ffffff' && e.theme === 'light');
    const dark = plan.entries.filter((e) => e.hex === '#ffffff' && e.theme === 'dark');
    expect(light.length).toBeGreaterThan(0);
    expect(dark.length).toBeGreaterThan(0);
    expect(dark[0]?.best?.token.name).toBe('colorNeutralForeground1');
  });

  it('maps the bulk of a Fluent-derived palette exactly', () => {
    expect(plan.stats.exact).toBeGreaterThan(plan.entries.length * 0.8);
  });

  it('picks up hover state from the selector', () => {
    expect(entry('#0f6cbd1a', 'background')?.state).toBe('hover');
  });

  it('pairs variables that are redefined for dark mode', () => {
    const names = plan.pairs.map((pair) => pair.name);
    expect(names).toContain('--app-text');
    expect(names).toContain('--app-background');

    const text = plan.pairs.find((pair) => pair.name === '--app-text');
    expect(text).toMatchObject({ light: '#242424', dark: '#ffffff' });
    expect(text?.best?.token.name).toBe('colorNeutralForeground1');
    expect(text?.split).toBeUndefined();
  });

  it('pairs light and dark branches of a theme object', () => {
    const background = plan.pairs.find(
      (pair) => pair.name === 'background' && pair.file === 'src/theme.ts',
    );
    expect(background).toMatchObject({ light: '#ffffff', dark: '#292929' });
    expect(background?.best?.token.name).toBe('colorNeutralBackground1');
  });

  it('suggests two tokens when no single token covers a pair', () => {
    const pair = plan.pairs.find((p) => p.name === '--app-background');
    expect(pair?.split?.light.token.name).toBe('colorNeutralBackground3');
    expect(pair?.split?.dark.token.name).toBe('colorNeutralBackground1');
  });

  it('does not pair a variable that only has one value', () => {
    expect(plan.pairs.map((pair) => pair.name)).not.toContain('$brand-primary');
  });
});

describe('serializePlan', () => {
  it('carries the token decision and every place to rewrite', () => {
    const output = serializePlan(plan);
    expect(output.fluentThemeVersion).toMatch(/^\d+\./);
    const text = output.entries.find((e) => e.color === '#242424' && e.usage === 'text');
    expect(text).toMatchObject({ token: 'colorNeutralForeground1', quality: 'exact' });
    expect(text?.locations.length).toBeGreaterThan(0);
    expect(text?.locations[0]).toHaveProperty('line');
    expect(JSON.parse(JSON.stringify(output))).toEqual(output);
  });
});
