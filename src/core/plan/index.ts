import type { ColorOccurrence, ScanResult, UsageKind } from '../../types.js';
import {
  matchColor,
  matchThemePair,
  stateFromSelector,
  type MatchQuality,
  type TokenMatch,
} from '../match/index.js';
import { FLUENT_THEME_VERSION, tokenValue } from '../tokens/index.js';
import type { Theme, TokenState } from '../tokens/types.js';

/**
 * One color in one role. The role matters because Fluent keeps separate token
 * families for foreground, background and stroke, so `#ffffff` as text and
 * `#ffffff` as a background resolve to different tokens.
 */
export interface PlanEntry {
  hex: string;
  alpha: number;
  usage: UsageKind;
  theme: Theme;
  state: TokenState;
  count: number;
  fileCount: number;
  occurrences: ColorOccurrence[];
  /** Best-first token candidates. */
  matches: TokenMatch[];
  best?: TokenMatch;
}

/** A variable defined once per theme, which one token can replace outright. */
export interface ThemePair {
  /** Variable name, or `file::property` for theme objects. */
  name: string;
  file: string;
  usage: UsageKind;
  light: string;
  dark: string;
  matches: TokenMatch[];
  best?: TokenMatch;
  /**
   * Best token for each half on its own. Only worth showing when no single
   * token covers both, in which case the pair needs two different tokens.
   */
  split?: { light: TokenMatch; dark: TokenMatch };
}

export interface MigrationPlan {
  scan: ScanResult;
  entries: PlanEntry[];
  pairs: ThemePair[];
  stats: Record<MatchQuality, number>;
}

export interface PlanOptions {
  /** Candidates to keep per color. */
  alternatives?: number;
}

export function buildPlan(scan: ScanResult, options: PlanOptions = {}): MigrationPlan {
  const alternatives = options.alternatives ?? 4;
  const entries = buildEntries(scan.occurrences, alternatives);
  const pairs = buildPairs(scan.occurrences, alternatives);

  const stats: Record<MatchQuality, number> = {
    exact: 0,
    near: 0,
    close: 0,
    approximate: 0,
    poor: 0,
  };
  for (const entry of entries) {
    stats[entry.best?.quality ?? 'poor']++;
  }

  return { scan, entries, pairs, stats };
}

/**
 * A compact, stable view of the plan for writing to disk. This is the handoff
 * artifact the codemod stage reads, so it carries the token decision for every
 * color together with the exact places that need rewriting.
 */
export function serializePlan(plan: MigrationPlan) {
  return {
    fluentThemeVersion: FLUENT_THEME_VERSION,
    root: plan.scan.root,
    stats: plan.stats,
    entries: plan.entries.map((entry) => ({
      color: entry.hex,
      usage: entry.usage,
      theme: entry.theme,
      state: entry.state,
      count: entry.count,
      token: entry.best?.token.name ?? null,
      tokenValue: entry.best ? tokenValue(entry.best.token, entry.theme) : null,
      quality: entry.best?.quality ?? 'poor',
      deltaE: entry.best ? Number(entry.best.deltaE.toFixed(4)) : null,
      alternatives: entry.matches.slice(1).map((match) => match.token.name),
      locations: entry.occurrences.map((o) => ({
        file: o.file,
        line: o.line,
        column: o.column,
        raw: o.raw,
        property: o.property ?? null,
        selector: o.selector ?? null,
      })),
    })),
    pairs: plan.pairs.map((pair) => ({
      name: pair.name,
      file: pair.file,
      usage: pair.usage,
      light: pair.light,
      dark: pair.dark,
      token: pair.best?.token.name ?? null,
      quality: pair.best?.quality ?? 'poor',
    })),
  };
}

function buildEntries(occurrences: ColorOccurrence[], alternatives: number): PlanEntry[] {
  const buckets = new Map<string, ColorOccurrence[]>();
  for (const occurrence of occurrences) {
    const theme = occurrence.theme ?? 'light';
    const key = `${occurrence.hex}|${occurrence.usage}|${theme}`;
    const bucket = buckets.get(key);
    if (bucket) bucket.push(occurrence);
    else buckets.set(key, [occurrence]);
  }

  const entries: PlanEntry[] = [];
  for (const bucket of buckets.values()) {
    const first = bucket[0]!;
    const theme = first.theme ?? 'light';
    const state = dominantState(bucket);
    const matches = matchColor(first.hex, { usage: first.usage, theme, state }, alternatives);
    entries.push({
      hex: first.hex,
      alpha: first.alpha,
      usage: first.usage,
      theme,
      state,
      count: bucket.length,
      fileCount: new Set(bucket.map((o) => o.file)).size,
      occurrences: bucket,
      matches,
      ...(matches[0] ? { best: matches[0] } : {}),
    });
  }

  return entries.sort((a, b) => b.count - a.count || a.hex.localeCompare(b.hex));
}

function dominantState(occurrences: ColorOccurrence[]): TokenState {
  const counts = new Map<TokenState, number>();
  for (const occurrence of occurrences) {
    const state = stateFromSelector(occurrence.selector);
    counts.set(state, (counts.get(state) ?? 0) + 1);
  }
  let best: TokenState = 'rest';
  let bestCount = 0;
  for (const [state, count] of counts) {
    if (count > bestCount) {
      best = state;
      bestCount = count;
    }
  }
  return best;
}

/**
 * Finds definitions that already have a light and a dark value — CSS custom
 * properties redefined in a dark block, or `light`/`dark` branches of a theme
 * object — and looks for one token whose own pair covers both.
 */
function buildPairs(occurrences: ColorOccurrence[], alternatives: number): ThemePair[] {
  const buckets = new Map<string, ColorOccurrence[]>();

  for (const occurrence of occurrences) {
    const name = occurrence.declaresVariable ?? (occurrence.theme ? occurrence.property : undefined);
    if (!name) continue;
    const key = `${occurrence.file}::${name}`;
    const bucket = buckets.get(key);
    if (bucket) bucket.push(occurrence);
    else buckets.set(key, [occurrence]);
  }

  const pairs: ThemePair[] = [];
  for (const [key, bucket] of buckets) {
    const light = new Set(bucket.filter((o) => o.theme !== 'dark').map((o) => o.hex));
    const dark = new Set(bucket.filter((o) => o.theme === 'dark').map((o) => o.hex));
    if (light.size !== 1 || dark.size !== 1) continue;

    const lightHex = [...light][0]!;
    const darkHex = [...dark][0]!;
    if (lightHex === darkHex) continue;

    const first = bucket[0]!;
    const usage = bucket.find((o) => o.usage !== 'variable')?.usage ?? first.usage;
    const matches = matchThemePair(lightHex, darkHex, { usage }, alternatives);
    const best = matches[0];
    const split = needsSplit(best) ? splitMatch(lightHex, darkHex, usage) : undefined;
    pairs.push({
      name: key.split('::')[1] ?? key,
      file: first.file,
      usage,
      light: lightHex,
      dark: darkHex,
      matches,
      ...(best ? { best } : {}),
      ...(split ? { split } : {}),
    });
  }

  return pairs.sort((a, b) => a.file.localeCompare(b.file) || a.name.localeCompare(b.name));
}

function needsSplit(best: TokenMatch | undefined): boolean {
  return !best || (best.quality !== 'exact' && best.quality !== 'near');
}

function splitMatch(
  lightHex: string,
  darkHex: string,
  usage: UsageKind,
): { light: TokenMatch; dark: TokenMatch } | undefined {
  const light = matchColor(lightHex, { usage, theme: 'light' }, 1)[0];
  const dark = matchColor(darkHex, { usage, theme: 'dark' }, 1)[0];
  return light && dark ? { light, dark } : undefined;
}
