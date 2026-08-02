import { describe, expect, it } from 'vitest';
import { findColors } from '../src/core/color/parse.js';

const hexes = (text: string, options?: Parameters<typeof findColors>[1]) =>
  findColors(text, options).map((color) => color.hex);

describe('findColors', () => {
  it('reads every css color syntax', () => {
    expect(hexes('#fff')).toEqual(['#ffffff']);
    expect(hexes('#0f6cbd')).toEqual(['#0f6cbd']);
    expect(hexes('rgb(224, 224, 224)')).toEqual(['#e0e0e0']);
    expect(hexes('hsl(206, 100%, 40%)')).toEqual(['#0074cc']);
    expect(hexes('oklch(62.8% 0.188 260)')).toHaveLength(1);
    expect(hexes('rebeccapurple')).toEqual(['#663399']);
  });

  it('keeps alpha in the normalized hex', () => {
    const [color] = findColors('rgba(0, 0, 0, 0.14)');
    expect(color?.hex).toBe('#00000024');
    expect(color?.alpha).toBeCloseTo(0.14);
  });

  it('preserves the literal as authored', () => {
    expect(findColors('  #FFFFFF  ')[0]?.raw).toBe('#FFFFFF');
    expect(findColors('rgba(0, 0, 0, 0.5)')[0]?.raw).toBe('rgba(0, 0, 0, 0.5)');
  });

  it('ignores hex-like strings that are not colors', () => {
    expect(hexes('#12345')).toEqual([]);
    expect(hexes('#abcdefabc')).toEqual([]);
    expect(hexes('this.#privateField')).toEqual([]);
  });

  it('ignores keywords with no color value', () => {
    expect(hexes('transparent')).toEqual([]);
    expect(hexes('currentColor')).toEqual([]);
    expect(hexes('inherit')).toEqual([]);
  });

  it('does not read color names out of identifiers', () => {
    expect(hexes('$gray-100')).toEqual([]);
    expect(hexes('border-red-500')).toEqual([]);
    expect(hexes('.text-blue')).toEqual([]);
  });

  it('only accepts color names in value position when asked', () => {
    const options = { namedContext: 'value-only' } as const;
    expect(hexes('color: red', options)).toEqual(['#ff0000']);
    expect(hexes('red', options)).toEqual(['#ff0000']);
    expect(hexes('a red button', options)).toEqual([]);
  });

  it('handles nested parentheses in color functions', () => {
    expect(hexes('rgb(calc(255 - 0) 0 0)')).toEqual([]);
    expect(hexes('color-mix(in srgb, #ffffff 50%, #000000)')).toEqual(['#ffffff', '#000000']);
  });

  it('finds several colors in one value', () => {
    expect(hexes('linear-gradient(90deg, #c50f1f 0%, #b10e1c 100%)')).toEqual([
      '#c50f1f',
      '#b10e1c',
    ]);
  });

  it('reports the offset of each literal', () => {
    expect(findColors('1px solid #e0e0e0')[0]?.index).toBe(10);
  });
});
