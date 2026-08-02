import type { UsageKind } from '../../types.js';
import {
  chromaOf,
  coordsFor,
  deltaEOk,
  getIndexedTokens,
  toOklabCoords,
  type IndexedToken,
  type Oklab,
} from '../tokens/index.js';
import { ROLES_FOR_USAGE, type FluentToken, type Theme, type TokenState } from '../tokens/types.js';

/**
 * How well a token stands in for a color, graded on the OKLab scale where
 * black to white is 1.0: under 0.02 nobody will notice the swap, and one step
 * between adjacent Fluent neutrals is about 0.05.
 */
export type MatchQuality = 'exact' | 'near' | 'close' | 'approximate' | 'poor';

export const QUALITY_THRESHOLD: Record<Exclude<MatchQuality, 'exact'>, number> = {
  near: 0.02,
  close: 0.05,
  approximate: 0.15,
  poor: Number.POSITIVE_INFINITY,
};

/**
 * Weight on the saturation gap. Plain distance happily swaps a slate gray for
 * a brand blue of the same lightness, which is never what anyone wants, so a
 * mismatch in how vivid the two colors are counts against the fit.
 */
const CHROMA_WEIGHT = 0.6;

/** Opacity is invisible to OKLab distance but very visible on screen. */
const ALPHA_WEIGHT = 1.5;

export interface TokenMatch {
  token: FluentToken;
  theme: Theme;
  /** Plain perceptual distance between the source color and the token value. */
  deltaE: number;
  /** Difference in opacity, which OKLab distance does not capture. */
  alphaDelta: number;
  /** Distance adjusted for saturation and opacity; what `quality` grades. */
  fit: number;
  /** `fit` plus the preference penalties below; lower is better. */
  score: number;
  quality: MatchQuality;
}

export interface MatchContext {
  usage: UsageKind;
  theme?: Theme;
  /** Interaction state the color is used in, so hover maps to hover tokens. */
  state?: TokenState;
  /** Include tokens whose role does not fit the usage. */
  anyRole?: boolean;
}

/**
 * Nudges toward the token a Fluent developer would reach for first when
 * several sit at a similar distance. Every value here is far smaller than a
 * just-noticeable color difference, so a penalty never beats a closer color.
 */
function penalty(token: FluentToken, context: MatchContext): number {
  let total = 0;
  const wantedState = context.state ?? 'rest';
  if (token.state !== wantedState) total += token.state === 'rest' ? 0.004 : 0.012;

  // With no property to go on, any role is allowed, so steer toward the two
  // roles a loose color is most likely to be.
  if (context.usage === 'unknown' || context.usage === 'variable') {
    if (token.role === 'stroke') total += 0.005;
    else if (token.role === 'shadow' || token.role === 'other') total += 0.012;
  }

  if (token.family === 'palette') total += 0.006;
  if (token.family === 'stencil') total += 0.014;
  if (token.family === 'transparent') total += 0.006;
  if (token.family === 'other') total += 0.003;
  if (token.inverted) total += 0.004;
  if (token.link) total += 0.004;
  if (token.onBrand) total += 0.002;
  total += 0.0005 * token.rank;
  return total;
}

function qualityOf(fit: number, isIdentical: boolean): MatchQuality {
  if (isIdentical) return 'exact';
  if (fit < QUALITY_THRESHOLD.near) return 'near';
  if (fit < QUALITY_THRESHOLD.close) return 'close';
  if (fit < QUALITY_THRESHOLD.approximate) return 'approximate';
  return 'poor';
}

/** Perceptual distance, made stricter about saturation and opacity gaps. */
function fitness(source: Oklab, target: Oklab): { deltaE: number; alphaDelta: number; fit: number } {
  const deltaE = deltaEOk(source, target);
  const alphaDelta = Math.abs(source.alpha - target.alpha);
  const chromaDelta = Math.abs(chromaOf(source) - chromaOf(target));
  return {
    deltaE,
    alphaDelta,
    fit: deltaE + CHROMA_WEIGHT * chromaDelta + ALPHA_WEIGHT * alphaDelta,
  };
}

function isEligible(indexed: IndexedToken, context: MatchContext, sourceAlpha: number): boolean {
  const { token } = indexed;
  if (!context.anyRole) {
    const roles = ROLES_FOR_USAGE[context.usage];
    if (!roles.includes(token.role)) return false;
  }
  // A fully transparent token can only ever stand in for a transparent color.
  const tokenAlpha = coordsFor(indexed, context.theme ?? 'light').alpha;
  if (tokenAlpha === 0 !== (sourceAlpha === 0)) return false;
  return true;
}

/** Ranks Fluent tokens against one color, best first. */
export function matchColor(hex: string, context: MatchContext, limit = 5): TokenMatch[] {
  const theme = context.theme ?? 'light';
  const source = toOklabCoords(hex);
  const matches: TokenMatch[] = [];

  for (const indexed of getIndexedTokens()) {
    if (!isEligible(indexed, context, source.alpha)) continue;
    const { deltaE, alphaDelta, fit } = fitness(source, coordsFor(indexed, theme));
    matches.push({
      token: indexed.token,
      theme,
      deltaE,
      alphaDelta,
      fit,
      score: fit + penalty(indexed.token, context),
      quality: qualityOf(fit, deltaE === 0 && alphaDelta === 0),
    });
  }

  matches.sort((a, b) => a.score - b.score);
  return matches.slice(0, limit);
}

/**
 * Finds one token that covers both halves of a light/dark pair, so a variable
 * defined twice collapses into a single token that themes itself.
 */
export function matchThemePair(
  lightHex: string,
  darkHex: string,
  context: Omit<MatchContext, 'theme'>,
  limit = 3,
): TokenMatch[] {
  const light = toOklabCoords(lightHex);
  const dark = toOklabCoords(darkHex);
  const matches: TokenMatch[] = [];

  for (const indexed of getIndexedTokens()) {
    if (!isEligible(indexed, { ...context, theme: 'light' }, light.alpha)) continue;
    const lightFit = fitness(light, indexed.light);
    const darkFit = fitness(dark, indexed.dark);
    // A pair is only as good as its worse half.
    const worse = lightFit.fit >= darkFit.fit ? lightFit : darkFit;
    matches.push({
      token: indexed.token,
      theme: 'light',
      deltaE: Math.max(lightFit.deltaE, darkFit.deltaE),
      alphaDelta: Math.max(lightFit.alphaDelta, darkFit.alphaDelta),
      fit: worse.fit,
      score: worse.fit + penalty(indexed.token, context),
      quality: qualityOf(worse.fit, lightFit.deltaE === 0 && darkFit.deltaE === 0 && worse.alphaDelta === 0),
    });
  }

  matches.sort((a, b) => a.score - b.score);
  return matches.slice(0, limit);
}

const STATE_PATTERNS: Array<[RegExp, TokenState]> = [
  [/:hover|\bhover\b/i, 'hover'],
  [/:active|\bpressed\b/i, 'pressed'],
  [/:focus|\bfocus(?:-visible)?\b/i, 'focus'],
  [/:disabled|\[disabled\]|\bdisabled\b/i, 'disabled'],
  [/:checked|aria-selected|\bselected\b/i, 'selected'],
];

/** Reads an interaction state out of a selector such as `.btn:hover`. */
export function stateFromSelector(selector: string | undefined): TokenState {
  if (!selector) return 'rest';
  for (const [pattern, state] of STATE_PATTERNS) {
    if (pattern.test(selector)) return state;
  }
  return 'rest';
}
