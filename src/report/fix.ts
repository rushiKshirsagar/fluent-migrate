import pc from 'picocolors';
import type { Edit, FixResult, SkipReason, Skipped } from '../core/fix/index.js';


export interface FixReportOptions {
  write: boolean;
  /** Print the changed lines for every file rather than a per-file count. */
  showDiff?: boolean;
}

export function printFixReport(result: FixResult, options: FixReportOptions): void {
  console.log('');
  console.log(pc.bold(pc.cyan('  fluent-migrate')) + pc.dim('  ·  ') + (options.write ? 'fix' : 'fix ' + pc.yellow('(dry run)')));
  console.log('');

  if (result.edits === 0) {
    console.log(pc.yellow('  Nothing to rewrite.'));
    printSkipped(result.skipped);
    console.log('');
    return;
  }

  if (options.showDiff !== false) {
    for (const change of result.changes) {
      console.log(`  ${pc.underline(change.file)} ${pc.dim(`${change.edits.length} changes`)}`);
      const lines = change.before.split('\n');
      for (const [line, edits] of groupByLine(change.edits)) {
        printLine(lines[line - 1] ?? '', edits);
      }
      console.log('');
    }
  }

  const files = result.changes.length;
  console.log(
    `  ${pc.green(String(result.edits))} colors rewritten across ` +
      `${pc.green(String(files))} ${files === 1 ? 'file' : 'files'}`,
  );

  printSkipped(result.skipped);
  printThemeNote(result);

  console.log('');
  if (options.write) {
    console.log(pc.dim('  files written. review with ') + pc.cyan('git diff'));
  } else {
    console.log(pc.dim('  nothing written. re-run with ') + pc.cyan('--write') + pc.dim(' to apply'));
  }
  console.log('');
}

function groupByLine(edits: Edit[]): Map<number, Edit[]> {
  const byLine = new Map<number, Edit[]>();
  for (const edit of [...edits].sort((a, b) => a.line - b.line || a.column - b.column)) {
    const bucket = byLine.get(edit.line);
    if (bucket) bucket.push(edit);
    else byLine.set(edit.line, [edit]);
  }
  return byLine;
}

/** Renders one before/after pair per line, with every edit on it applied. */
function printLine(line: string, edits: Edit[]): void {
  const first = edits[0]!;
  let before = '';
  let after = '';
  let cursor = 0;

  for (const edit of edits) {
    const start = edit.column - 1;
    before += line.slice(cursor, start) + pc.red(edit.before);
    after += line.slice(cursor, start) + pc.green(edit.after);
    cursor = start + edit.before.length;
  }
  before += line.slice(cursor);
  after += line.slice(cursor);

  const shifted = edits.filter((edit) => edit.quality !== 'exact');
  const fit = shifted.length > 0 ? pc.dim(`  (${shifted[0]!.quality})`) : '';
  const location = pc.dim(`${first.line}:${first.column}`.padStart(8));
  console.log(`  ${location} ${pc.red('-')} ${before}`);
  console.log(`  ${' '.repeat(8)} ${pc.green('+')} ${after}${fit}`);
}

/**
 * Tokens carry their own dark value, so a dark-mode override that has just
 * been pointed at a token is now saying the same thing twice.
 */
function printThemeNote(result: FixResult): void {
  const dark = result.changes.flatMap((change) =>
    change.edits.filter((edit) => edit.theme === 'dark'),
  );
  if (dark.length === 0) return;
  console.log(
    pc.dim(
      `  ${dark.length} of these sit in dark-theme blocks. Fluent tokens already switch with the\n` +
        '  theme, so those overrides are now duplicates and can be deleted.',
    ),
  );
}

function printSkipped(skipped: Skipped[]): void {
  if (skipped.length === 0) return;

  const byReason = new Map<SkipReason, Skipped[]>();
  for (const skip of skipped) {
    const bucket = byReason.get(skip.reason);
    if (bucket) bucket.push(skip);
    else byReason.set(skip.reason, [skip]);
  }

  console.log(`  ${pc.yellow(String(skipped.length))} left alone:`);
  for (const [, group] of byReason) {
    const first = group[0]!;
    console.log(pc.dim(`    ${group.length}× ${first.note}`));
    for (const skip of group.slice(0, 3)) {
      console.log(pc.dim(`       ${skip.file}:${skip.line}  ${skip.raw}`));
    }
    if (group.length > 3) console.log(pc.dim(`       … and ${group.length - 3} more`));
  }
}
