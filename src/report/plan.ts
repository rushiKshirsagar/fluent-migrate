import pc from 'picocolors';
import type { MatchQuality, TokenMatch } from '../core/match/index.js';
import type { MigrationPlan, PlanEntry, ThemePair } from '../core/plan/index.js';
import { tokenValue } from '../core/tokens/index.js';
import { swatch } from './console.js';
import { renderTable } from './table.js';

const QUALITY_LABEL: Record<MatchQuality, string> = {
  exact: 'exact',
  near: 'near',
  close: 'close',
  approximate: 'approx',
  poor: 'no fit',
};

function paintQuality(quality: MatchQuality): string {
  const label = QUALITY_LABEL[quality];
  if (quality === 'exact') return pc.green(label);
  if (quality === 'near') return pc.green(label);
  if (quality === 'close') return pc.yellow(label);
  if (quality === 'approximate') return pc.yellow(label);
  return pc.red(label);
}

function describeMatch(match: TokenMatch | undefined): string {
  if (!match) return pc.red('no token fits');
  const drift = match.deltaE === 0 ? '' : pc.dim(` Δ${match.deltaE.toFixed(3)}`);
  // A poor match is shown only as a reference point, never as a recommendation.
  const name = match.quality === 'poor' ? pc.dim(`nearest is ${match.token.name}`) : pc.cyan(match.token.name);
  return `${name}${drift}`;
}

export interface PlanReportOptions {
  limit?: number;
  showAlternatives?: boolean;
}

export function printPlanReport(plan: MigrationPlan, options: PlanReportOptions = {}): void {
  const limit = options.limit ?? 40;
  const entries = limit > 0 ? plan.entries.slice(0, limit) : plan.entries;

  console.log('');
  console.log(pc.bold(pc.cyan('  fluent-migrate')) + pc.dim('  ·  token plan'));
  console.log(
    pc.dim(
      `  ${plan.scan.root}\n  ${plan.entries.length} color/role combinations from ${plan.scan.occurrences.length} occurrences`,
    ),
  );
  console.log('');

  if (plan.entries.length === 0) {
    console.log(pc.yellow('  Nothing to map.'));
    console.log('');
    return;
  }

  printEntries(entries, options.showAlternatives ?? false);

  if (plan.entries.length > entries.length) {
    console.log(
      pc.dim(`\n  … and ${plan.entries.length - entries.length} more (use --limit 0 to see all)`),
    );
  }

  if (plan.pairs.length > 0) printPairs(plan.pairs);

  console.log('');
  printStats(plan);
  console.log('');
  console.log(
    pc.dim('  next: ') + pc.cyan('npx fluent-migrate fix') + pc.dim('  to rewrite components onto these tokens'),
  );
  console.log('');
}

function printEntries(entries: PlanEntry[], showAlternatives: boolean): void {
  const rows = entries.map((entry) => [
    swatch(entry.hex),
    pc.bold(entry.hex),
    entry.usage + (entry.state === 'rest' ? '' : pc.dim(`:${entry.state}`)),
    entry.theme === 'dark' ? pc.dim('dark') : '',
    String(entry.count),
    paintQuality(entry.best?.quality ?? 'poor'),
    describeMatch(entry.best),
    entry.best ? swatch(tokenValue(entry.best.token, entry.theme)) : '',
  ]);

  console.log(
    renderTable(
      [
        { header: '' },
        { header: 'color' },
        { header: 'used as' },
        { header: 'theme' },
        { header: 'uses', align: 'right' },
        { header: 'fit' },
        { header: 'fluent token' },
        { header: '' },
      ],
      rows,
      pc.dim,
    )
      .split('\n')
      .map((line) => `  ${line}`)
      .join('\n'),
  );

  if (!showAlternatives) return;

  console.log('');
  console.log(pc.bold('  alternatives'));
  for (const entry of entries) {
    if (entry.matches.length < 2) continue;
    console.log(`\n  ${swatch(entry.hex)} ${pc.bold(entry.hex)} ${pc.dim(`as ${entry.usage}`)}`);
    for (const match of entry.matches) {
      const value = tokenValue(match.token, entry.theme);
      console.log(
        `    ${swatch(value)} ${pc.cyan(match.token.name.padEnd(38))} ${value.padEnd(10)} ${pc.dim(
          `Δ${match.deltaE.toFixed(3)}`,
        )}  ${paintQuality(match.quality)}`,
      );
    }
  }
}

/**
 * When one token cannot cover both halves, the pair needs two tokens, so show
 * those instead of a compromise that is wrong in both themes.
 */
function describePair(pair: ThemePair): string {
  if (!pair.split) return describeMatch(pair.best);
  const { light, dark } = pair.split;
  return (
    `${pc.cyan(light.token.name)} ${pc.dim('in light')} / ` +
    `${pc.cyan(dark.token.name)} ${pc.dim('in dark')}`
  );
}

function printPairs(pairs: ThemePair[]): void {
  console.log('');
  console.log(pc.bold('  light / dark pairs'));
  console.log(
    pc.dim('  definitions that already switch by theme — one token replaces both halves'),
  );
  console.log('');

  const rows = pairs.map((pair) => [
    pc.bold(pair.name),
    pc.dim(pair.file),
    `${swatch(pair.light)} ${pair.light}`,
    `${swatch(pair.dark)} ${pair.dark}`,
    paintQuality(pair.best?.quality ?? 'poor'),
    describePair(pair),
  ]);

  console.log(
    renderTable(
      [
        { header: 'definition' },
        { header: 'file' },
        { header: 'light' },
        { header: 'dark' },
        { header: 'fit' },
        { header: 'fluent token' },
      ],
      rows,
      pc.dim,
    )
      .split('\n')
      .map((line) => `  ${line}`)
      .join('\n'),
  );
}

function printStats(plan: MigrationPlan): void {
  const { stats } = plan;
  const total = plan.entries.length;
  const confident = stats.exact + stats.near;

  console.log(
    `  ${pc.green(`${confident}/${total}`)} colors map onto a token with no visible change` +
      pc.dim(`  (${stats.exact} exact, ${stats.near} imperceptible)`),
  );

  const shifted = stats.close + stats.approximate;
  if (shifted > 0) {
    console.log(
      `  ${pc.yellow(String(shifted))} ${shifted === 1 ? 'color shifts' : 'colors shift'}` +
        ' slightly to reach the nearest token' +
        pc.dim(`  (${stats.close} close, ${stats.approximate} approximate)`),
    );
  }
  if (stats.poor > 0) {
    console.log(
      `  ${pc.red(String(stats.poor))} ${stats.poor === 1 ? 'color has' : 'colors have'}` +
        ' no reasonable token' +
        pc.dim('  — keep a custom value'),
    );
  }
}
