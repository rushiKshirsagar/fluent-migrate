import { matchColor } from '../src/core/match/index.js';
import { deltaEOk, toOklabCoords } from '../src/core/tokens/index.js';

const d = (a: string, b: string) => deltaEOk(toOklabCoords(a), toOklabCoords(b)).toFixed(4);

console.log('white vs #fafafa   ', d('#ffffff', '#fafafa'));
console.log('#e0e0e0 vs #d1d1d1 ', d('#e0e0e0', '#d1d1d1'));
console.log('#3b82f6 vs #0f6cbd ', d('#3b82f6', '#0f6cbd'));
console.log('#242424 vs #333333 ', d('#242424', '#333333'));
console.log('#616161 vs #707070 ', d('#616161', '#707070'));
console.log('red vs blue        ', d('#ff0000', '#0000ff'));
console.log('black vs white     ', d('#000000', '#ffffff'));
console.log();

const chroma = (hex: string) => {
  const { a, b } = toOklabCoords(hex);
  return Math.hypot(a, b).toFixed(3);
};
console.log(
  'chroma:',
  ['#64748b', '#3b82f6', '#0f6cbd', '#6366f1', '#242424', '#ffffff', '#e0e0e0', '#c50f1f']
    .map((c) => `${c} ${chroma(c)}`)
    .join('  '),
);
console.log();

for (const color of ['#3b82f6', '#6366f1', '#22c55e', '#eab308', '#64748b', '#f8fafc', '#111827']) {
  const matches = matchColor(color, { usage: 'background' }, 2);
  console.log(
    color,
    '->',
    matches
      .map((m) => `${m.token.name} ${m.token.light} Δ${m.deltaE.toFixed(3)} ${m.quality}`)
      .join('  |  '),
  );
}
