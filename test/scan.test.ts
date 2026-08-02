import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { scanProject } from '../src/core/scan/index.js';
import type { ColorOccurrence, ScanResult } from '../src/types.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures/app');

let result: ScanResult;
const at = (file: string, line: number): ColorOccurrence | undefined =>
  result.occurrences.find((o) => o.file === path.join('src', file) && o.line === line);

beforeAll(async () => {
  result = await scanProject({ root });
});

describe('scanProject', () => {
  it('walks the whole project', () => {
    expect(result.filesScanned).toBe(5);
    expect(result.filesWithColors).toBe(5);
    expect(result.groups.length).toBeGreaterThan(15);
  });

  it('groups occurrences by normalized color, most used first', () => {
    const [first] = result.groups;
    expect(first?.hex).toBe('#ffffff');
    expect(first?.count).toBeGreaterThan(1);
    expect(result.groups.map((g) => g.count)).toEqual(
      [...result.groups.map((g) => g.count)].sort((a, b) => b - a),
    );
  });

  it('records exact source positions', () => {
    const occurrence = at('components/Card.css', 2);
    expect(occurrence).toMatchObject({
      raw: '#ffffff',
      column: 21,
      property: 'background-color',
      usage: 'background',
      selector: '.card',
    });
  });

  it('resolves scss nesting and variables', () => {
    expect(at('styles/variables.scss', 2)).toMatchObject({
      declaresVariable: '$brand-primary',
      usage: 'variable',
    });
    expect(at('styles/variables.scss', 10)).toMatchObject({
      raw: 'rgb(224, 224, 224)',
      declaresVariable: '--app-border',
      usage: 'border',
    });
  });

  it('flags colors inside dark scopes', () => {
    expect(at('styles/variables.scss', 16)?.theme).toBe('dark');
    expect(at('components/Card.css', 25)?.theme).toBe('dark');
    expect(at('theme.ts', 9)?.theme).toBe('dark');
    expect(at('theme.ts', 3)?.theme).toBe('light');
    expect(at('theme.ts', 15)?.theme).toBeUndefined();
  });

  it('reads colors out of jsx style objects and template literals', () => {
    expect(at('components/Card.tsx', 5)).toMatchObject({
      property: 'backgroundColor',
      usage: 'background',
    });
    expect(at('components/Button.tsx', 4)).toMatchObject({
      property: 'background-color',
      usage: 'background',
    });
    expect(at('components/Button.tsx', 5)).toMatchObject({ raw: 'white', usage: 'text' });
  });

  it('skips colors in comments, regex literals and urls', () => {
    const cardTsx = result.occurrences.filter((o) => o.file === path.join('src', 'components/Card.tsx'));
    expect(cardTsx.map((o) => o.line)).not.toContain(3);
    expect(cardTsx.map((o) => o.line)).not.toContain(10);
    expect(at('components/Card.css', 6)).toBeUndefined();
  });

  it('does not treat identifiers as color names', () => {
    expect(result.occurrences.some((o) => o.raw === 'not-a-color-name')).toBe(false);
  });
});
