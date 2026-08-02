export interface Position {
  line: number;
  column: number;
}

/** Moves a 1-based source position forward by `length` characters of `text`. */
export function advance(start: Position, text: string, length: number): Position {
  let { line, column } = start;
  for (let i = 0; i < length && i < text.length; i++) {
    if (text[i] === '\n') {
      line++;
      column = 1;
    } else {
      column++;
    }
  }
  return { line, column };
}

/** Replaces matches with spaces so that character offsets stay intact. */
export function blankOut(text: string, pattern: RegExp): string {
  return text.replace(pattern, (match) => match.replace(/[^\n]/g, ' '));
}

/** Converts a 1-based line/column pair into an absolute offset. */
export function offsetAt(text: string, line: number, column: number): number {
  let offset = 0;
  for (let current = 1; current < line; current++) {
    const next = text.indexOf('\n', offset);
    if (next === -1) return text.length;
    offset = next + 1;
  }
  return offset + column - 1;
}

/** Converts an absolute offset into a 1-based line/column pair. */
export function positionAt(text: string, offset: number): Position {
  let line = 1;
  let lastBreak = -1;
  for (let i = 0; i < offset; i++) {
    if (text[i] === '\n') {
      line++;
      lastBreak = i;
    }
  }
  return { line, column: offset - lastBreak };
}
