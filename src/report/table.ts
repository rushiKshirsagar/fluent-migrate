const ANSI = /\x1B\[[0-9;]*m/g;

export type Align = 'left' | 'right';

export interface Column {
  header: string;
  align?: Align;
}

export function visibleWidth(text: string): number {
  return text.replace(ANSI, '').length;
}

function pad(text: string, width: number, align: Align): string {
  const filler = ' '.repeat(Math.max(0, width - visibleWidth(text)));
  return align === 'right' ? filler + text : text + filler;
}

/** Renders a plain, dependency-free table with ANSI-aware column widths. */
export function renderTable(
  columns: Column[],
  rows: string[][],
  dim: (text: string) => string,
): string {
  const widths = columns.map((column, index) =>
    Math.max(visibleWidth(column.header), ...rows.map((row) => visibleWidth(row[index] ?? ''))),
  );

  const line = (cells: string[]): string =>
    cells
      .map((cell, index) => pad(cell, widths[index]!, columns[index]?.align ?? 'left'))
      .join('  ')
      .trimEnd();

  const header = line(columns.map((column) => dim(column.header.toUpperCase())));
  const rule = dim(widths.map((width) => '─'.repeat(width)).join('  '));
  return [header, rule, ...rows.map(line)].join('\n');
}
