import { describe, expect, it } from 'vitest';
import { classifyProperty } from '../src/core/usage.js';

describe('classifyProperty', () => {
  it('maps css properties to their role', () => {
    expect(classifyProperty('color')).toBe('text');
    expect(classifyProperty('background-color')).toBe('background');
    expect(classifyProperty('border-bottom')).toBe('border');
    expect(classifyProperty('outline-color')).toBe('outline');
    expect(classifyProperty('box-shadow')).toBe('shadow');
    expect(classifyProperty('fill')).toBe('fill');
    expect(classifyProperty('stroke')).toBe('stroke');
  });

  it('accepts camelCase style keys', () => {
    expect(classifyProperty('backgroundColor')).toBe('background');
    expect(classifyProperty('borderColor')).toBe('border');
    expect(classifyProperty('WebkitTextFillColor')).toBe('text');
  });

  it('reads intent out of variable names', () => {
    expect(classifyProperty('--app-background')).toBe('background');
    expect(classifyProperty('--text-muted')).toBe('text');
    expect(classifyProperty('$divider-color')).toBe('border');
    expect(classifyProperty('--brand-primary')).toBe('variable');
  });

  it('reads intent out of theme object keys', () => {
    expect(classifyProperty('text')).toBe('text');
    expect(classifyProperty('surface')).toBe('background');
    expect(classifyProperty('accent')).toBe('unknown');
  });

  it('detects gradients from the value', () => {
    expect(classifyProperty('background', 'linear-gradient(90deg, #ffffff, #000000)')).toBe('gradient');
  });
});
