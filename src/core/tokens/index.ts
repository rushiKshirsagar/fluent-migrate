import { converter, parse as parseColor } from 'culori';
import { FLUENT_TOKENS } from './generated.js';
import type { FluentToken, Theme } from './types.js';

const toOklab = converter('oklab');

export interface Oklab {
  l: number;
  a: number;
  b: number;
  alpha: number;
}

export interface IndexedToken {
  token: FluentToken;
  light: Oklab;
  dark: Oklab;
}

export function toOklabCoords(hex: string): Oklab {
  const parsed = parseColor(hex);
  if (!parsed) throw new Error(`Cannot parse color "${hex}"`);
  const { l, a, b } = toOklab(parsed);
  return { l, a, b, alpha: parsed.alpha ?? 1 };
}

let cache: IndexedToken[] | undefined;

/** Every Fluent color token with its light and dark values in OKLab. */
export function getIndexedTokens(): IndexedToken[] {
  cache ??= FLUENT_TOKENS.map((token) => ({
    token,
    light: toOklabCoords(token.light),
    dark: toOklabCoords(token.dark),
  }));
  return cache;
}

export function tokenValue(token: FluentToken, theme: Theme): string {
  return theme === 'dark' ? token.dark : token.light;
}

export function coordsFor(indexed: IndexedToken, theme: Theme): Oklab {
  return theme === 'dark' ? indexed.dark : indexed.light;
}

/**
 * Perceptual distance in OKLab. The scale is anchored: black to white is 1.0,
 * one step between adjacent Fluent neutrals is about 0.05, and 0.02 is roughly
 * the smallest difference the eye can pick up.
 */
export function deltaEOk(a: Oklab, b: Oklab): number {
  return Math.hypot(a.l - b.l, a.a - b.a, a.b - b.b);
}

/** How saturated a color is. Near zero for grays, ~0.2 for a vivid hue. */
export function chromaOf(color: Oklab): number {
  return Math.hypot(color.a, color.b);
}

export { FLUENT_THEME_VERSION, FLUENT_TOKENS } from './generated.js';
export type { FluentToken, Theme, TokenFamily, TokenRole, TokenState } from './types.js';
export { ROLES_FOR_USAGE } from './types.js';
