import pc from 'picocolors';
import type { ColorGroup, ScanResult, UsageKind } from '../types.js';
import { renderTable } from './table.js';

const USAGE_ORDER: UsageKind[] = [
  'text',
  'background',
  'border',
  'outline',
  'shadow',
  'fill',
  'stroke',
  'gradient',
  'variable',
  'unknown',
];

const USAGE_LABEL: Record<UsageKind, string> = {
  text: 'text',
  background: 'background',
  border: 'border',
  outline: 'outline',
  shadow: 'shadow',
  fill: 'fill',
  stroke: 'stroke',
  gradient: 'gradient',
  variable: 'variable',
  unknown: 'unknown',
};

/** A two-cell truecolor block so the terminal shows the actual color. */
export function swatch(hex: string): string {
  const [r, g, b] = toRgb(hex);
  return `\x1b[48;2;${r};${g};${b}m  \x1b[0m`;
}

function toRgb(hex: string): [number, number, number] {
  const value = hex.replace('#', '').slice(0, 6).padEnd(6, '0');
  return [
    Number.parseInt(value.slice(0, 2), 16),
    Number.parseInt(value.slice(2, 4), 16),
    Number.parseInt(value.slice(4, 6), 16),
  ];
}

function usageSummary(group: ColorGroup): string {
  return USAGE_ORDER.filter((usage) => group.usages[usage])
    .map((usage) => `${USAGE_LABEL[usage]} ${pc.dim(String(group.usages[usage]))}`)
    .join(', ');
}

function shortLocation(group: ColorGroup): string {
  const first = group.occurrences[0];
  if (!first) return '';
  const more = group.count - 1;
  const location = `${first.file}:${first.line}`;
  return more > 0 ? `${location} ${pc.dim(`+${more}`)}` : location;
}

export interface ReportOptions {
  limit?: number;
  showOccurrences?: boolean;
}

export function printScanReport(result: ScanResult, options: ReportOptions = {}): void {
  const limit = options.limit ?? 40;
  const { groups } = result;

  console.log('');
  console.log(pc.bold(pc.cyan('  fluent-migrate')) + pc.dim('  ·  color scan'));
  console.log(
    pc.dim(
      `  ${result.root}\n  ${result.filesScanned} files scanned in ${result.durationMs}ms`,
    ),
  );
  console.log('');

  if (groups.length === 0) {
    console.log(pc.yellow('  No colors found. Nothing to migrate.'));
    console.log('');
    return;
  }

  const shown = limit > 0 ? groups.slice(0, limit) : groups;
  const rows = shown.map((group) => [
    swatch(group.hex),
    pc.bold(group.hex),
    String(group.count),
    String(group.fileCount),
    usageSummary(group),
    pc.dim(shortLocation(group)),
  ]);

  console.log(
    renderTable(
      [
        { header: '' },
        { header: 'color' },
        { header: 'uses', align: 'right' },
        { header: 'files', align: 'right' },
        { header: 'used as' },
        { header: 'first seen' },
      ],
      rows,
      pc.dim,
    )
      .split('\n')
      .map((line) => `  ${line}`)
      .join('\n'),
  );

  if (groups.length > shown.length) {
    console.log(pc.dim(`\n  … and ${groups.length - shown.length} more colors (use --limit 0 to see all)`));
  }

  console.log('');
  printTotals(result);

  if (options.showOccurrences) {
    printOccurrences(result);
  }

  console.log('');
  console.log(
    pc.dim('  next: ') + pc.cyan('npx fluent-migrate plan') + pc.dim('  to map these onto Fluent tokens'),
  );
  console.log('');
}

function printTotals(result: ScanResult): void {
  const totals = new Map<UsageKind, number>();
  for (const occurrence of result.occurrences) {
    totals.set(occurrence.usage, (totals.get(occurrence.usage) ?? 0) + 1);
  }

  const translucent = result.groups.filter((group) => group.alpha < 1).length;
  const themed = result.occurrences.filter((occurrence) => occurrence.theme === 'dark').length;

  const parts = [
    `${pc.bold(String(result.groups.length))} distinct colors`,
    `${pc.bold(String(result.occurrences.length))} occurrences`,
    `${pc.bold(String(result.filesWithColors))} files`,
  ];
  console.log(`  ${parts.join(pc.dim('  ·  '))}`);

  const breakdown = USAGE_ORDER.filter((usage) => totals.get(usage)).map(
    (usage) => `${USAGE_LABEL[usage]} ${pc.bold(String(totals.get(usage)))}`,
  );
  console.log(pc.dim(`  ${breakdown.join('  ·  ')}`));

  if (translucent > 0) {
    console.log(
      pc.dim(`  ${translucent} translucent colors — these usually need a custom token or an alpha overlay`),
    );
  }
  if (themed > 0) {
    console.log(pc.dim(`  ${themed} occurrences sit inside a dark-theme scope`));
  }
}

function printOccurrences(result: ScanResult): void {
  console.log('');
  console.log(pc.bold('  every occurrence'));
  let currentFile = '';
  for (const occurrence of [...result.occurrences].sort(
    (a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.column - b.column,
  )) {
    if (occurrence.file !== currentFile) {
      currentFile = occurrence.file;
      console.log(`\n  ${pc.underline(currentFile)}`);
    }
    const location = pc.dim(`${occurrence.line}:${occurrence.column}`.padEnd(9));
    const property = occurrence.property ? pc.cyan(occurrence.property) : pc.dim('—');
    console.log(
      `    ${location} ${swatch(occurrence.hex)} ${occurrence.raw.padEnd(24)} ${property} ${pc.dim(occurrence.usage)}`,
    );
  }
}
