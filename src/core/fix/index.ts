import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { ColorOccurrence } from '../../types.js';
import type { MatchQuality, TokenMatch } from '../match/index.js';
import type { MigrationPlan, PlanEntry } from '../plan/index.js';
import { offsetAt } from '../scan/position.js';
import { insideColorFunction, isPreprocessorVariable } from './guards.js';

/** Fit levels good enough to apply, in order. */
const ACCEPTABLE: MatchQuality[] = ['exact', 'near', 'close', 'approximate'];

export interface Edit {
  file: string;
  line: number;
  column: number;
  offset: number;
  before: string;
  after: string;
  token: string;
  quality: MatchQuality;
  /** Set when the literal sat inside a dark-theme scope. */
  theme?: 'light' | 'dark';
}

export type SkipReason =
  | 'no-token'
  | 'below-threshold'
  | 'preprocessor-variable'
  | 'color-function'
  | 'source-moved';

export interface Skipped {
  file: string;
  line: number;
  column: number;
  raw: string;
  reason: SkipReason;
  note: string;
}

export interface FileChange {
  file: string;
  before: string;
  after: string;
  edits: Edit[];
}

export interface FixResult {
  changes: FileChange[];
  skipped: Skipped[];
  edits: number;
}

export interface FixOptions {
  /** Worst fit to apply. Defaults to `near`, i.e. no visible change. */
  accept?: MatchQuality;
  /** Rewrite Sass and Less variable declarations too. Off by default. */
  rewritePreprocessorVariables?: boolean;
}

export const SKIP_NOTES: Record<SkipReason, string> = {
  'no-token': 'no Fluent token is close enough',
  'below-threshold': 'the nearest token would shift the color more than allowed',
  'preprocessor-variable': 'a Sass or Less variable may be passed to a color function',
  'color-function': 'the literal is an argument to a color function',
  'source-moved': 'the file changed since it was scanned',
};

/**
 * Turns a plan into concrete edits, replacing each color literal with the
 * Fluent CSS variable for its token. The file contents are produced but not
 * written; `applyFix` does that.
 */
export async function planFix(plan: MigrationPlan, options: FixOptions = {}): Promise<FixResult> {
  const accept = options.accept ?? 'near';
  const allowed = new Set(ACCEPTABLE.slice(0, ACCEPTABLE.indexOf(accept) + 1));

  const decisions = new Map<ColorOccurrence, PlanEntry>();
  for (const entry of plan.entries) {
    for (const occurrence of entry.occurrences) decisions.set(occurrence, entry);
  }

  const byFile = new Map<string, ColorOccurrence[]>();
  for (const occurrence of plan.scan.occurrences) {
    const bucket = byFile.get(occurrence.file);
    if (bucket) bucket.push(occurrence);
    else byFile.set(occurrence.file, [occurrence]);
  }

  const changes: FileChange[] = [];
  const skipped: Skipped[] = [];

  for (const [file, occurrences] of byFile) {
    const before = await readFile(path.join(plan.scan.root, file), 'utf8').catch(() => null);
    if (before === null) continue;

    const edits: Edit[] = [];
    for (const occurrence of occurrences) {
      const outcome = decide(occurrence, decisions.get(occurrence), before, allowed, options);
      if ('reason' in outcome) skipped.push(outcome);
      else edits.push(outcome);
    }

    if (edits.length === 0) continue;
    changes.push({ file, before, after: applyEdits(before, edits), edits });
  }

  changes.sort((a, b) => a.file.localeCompare(b.file));
  skipped.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
  return { changes, skipped, edits: changes.reduce((total, c) => total + c.edits.length, 0) };
}

function decide(
  occurrence: ColorOccurrence,
  entry: PlanEntry | undefined,
  source: string,
  allowed: Set<MatchQuality>,
  options: FixOptions,
): Edit | Skipped {
  const skip = (reason: SkipReason): Skipped => ({
    file: occurrence.file,
    line: occurrence.line,
    column: occurrence.column,
    raw: occurrence.raw,
    reason,
    note: SKIP_NOTES[reason],
  });

  const match: TokenMatch | undefined = entry?.best;
  if (!match || match.quality === 'poor') return skip('no-token');
  if (!allowed.has(match.quality)) return skip('below-threshold');
  if (!options.rewritePreprocessorVariables && isPreprocessorVariable(occurrence.property)) {
    return skip('preprocessor-variable');
  }

  const offset = offsetAt(source, occurrence.line, occurrence.column);
  // The literal must still be exactly where the scan said it was, otherwise
  // the file changed underneath us and every offset is suspect.
  if (source.slice(offset, offset + occurrence.raw.length) !== occurrence.raw) {
    return skip('source-moved');
  }
  if (insideColorFunction(source, offset)) return skip('color-function');

  return {
    file: occurrence.file,
    line: occurrence.line,
    column: occurrence.column,
    offset,
    before: occurrence.raw,
    after: `var(--${match.token.name})`,
    token: match.token.name,
    quality: match.quality,
    ...(occurrence.theme ? { theme: occurrence.theme } : {}),
  };
}

function applyEdits(source: string, edits: Edit[]): string {
  let result = source;
  for (const edit of [...edits].sort((a, b) => b.offset - a.offset)) {
    result =
      result.slice(0, edit.offset) + edit.after + result.slice(edit.offset + edit.before.length);
  }
  return result;
}

export async function applyFix(root: string, result: FixResult): Promise<void> {
  await Promise.all(
    result.changes.map((change) => writeFile(path.join(root, change.file), change.after, 'utf8')),
  );
}
