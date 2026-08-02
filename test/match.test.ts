import { describe, expect, it } from 'vitest';
import { matchColor, matchThemePair, stateFromSelector } from '../src/core/match/index.js';
import { FLUENT_TOKENS } from '../src/core/tokens/index.js';

const best = (...args: Parameters<typeof matchColor>) => matchColor(...args)[0];

describe('matchColor', () => {
  it('finds the exact token for a Fluent value', () => {
    expect(best('#242424', { usage: 'text' })).toMatchObject({
      quality: 'exact',
      deltaE: 0,
    });
    expect(best('#242424', { usage: 'text' })?.token.name).toBe('colorNeutralForeground1');
    expect(best('#ffffff', { usage: 'background' })?.token.name).toBe('colorNeutralBackground1');
  });

  it('matches against the values of the theme in play', () => {
    const dark = best('#292929', { usage: 'background', theme: 'dark' });
    const light = best('#292929', { usage: 'background', theme: 'light' });
    expect(dark?.token.name).toBe('colorNeutralBackground1');
    expect(light?.token.name).not.toBe(dark?.token.name);
  });

  it('only offers tokens whose role suits the usage', () => {
    for (const match of matchColor('#ffffff', { usage: 'text' }, 20)) {
      expect(match.token.role).toBe('foreground');
    }
    for (const match of matchColor('#d1d1d1', { usage: 'border' }, 20)) {
      expect(match.token.role).toBe('stroke');
    }
  });

  it('takes opacity into account', () => {
    expect(best('#00000024', { usage: 'shadow' })?.token.name).toBe('colorNeutralShadowKey');
    expect(best('#00000024', { usage: 'shadow' })?.alphaDelta).toBe(0);
  });

  it('never suggests a fully transparent token for an opaque color', () => {
    const transparent = new Set(
      FLUENT_TOKENS.filter((token) => token.light.endsWith('00') && token.light.length === 9).map(
        (token) => token.name,
      ),
    );
    for (const match of matchColor('#ffffff', { usage: 'background' }, 30)) {
      expect(transparent.has(match.token.name)).toBe(false);
    }
  });

  it('falls back to the nearest token for a color Fluent does not have', () => {
    // Tailwind blue-500 has no Fluent equivalent, but the brand blue is a
    // reasonable landing spot for it.
    const match = best('#3b82f6', { usage: 'background' });
    expect(match?.token.name).toBe('colorBrandBackground');
    expect(match?.quality).toBe('approximate');
  });

  it('refuses to swap a gray for a saturated color', () => {
    // Slate and the brand blue sit at almost the same distance from each other
    // as blue-500 does, but only one of them is a sane substitution.
    const slate = best('#64748b', { usage: 'background' });
    expect(slate?.quality).toBe('poor');
    expect(slate?.deltaE).toBeLessThan(0.15);
  });

  it('prefers rest tokens unless another state is asked for', () => {
    expect(best('#ffffff', { usage: 'background' })?.token.state).toBe('rest');
    const hover = best('#f5f5f5', { usage: 'background', state: 'hover' });
    expect(hover?.token.state).toBe('hover');
  });

  it('reports a poor fit rather than a misleading one', () => {
    const match = best('#0f6cbd1a', { usage: 'background' });
    expect(match?.quality).toBe('poor');
  });

  it('steers loose colors toward foreground and background tokens', () => {
    const match = best('#107c10', { usage: 'unknown' });
    expect(['foreground', 'background']).toContain(match?.token.role);
  });
});

describe('matchThemePair', () => {
  it('finds one token that covers both halves of a pair', () => {
    const match = matchThemePair('#242424', '#ffffff', { usage: 'text' })[0];
    expect(match).toMatchObject({ quality: 'exact' });
    expect(match?.token.name).toBe('colorNeutralForeground1');
  });

  it('scores a mismatched pair by its worst half', () => {
    const match = matchThemePair('#f5f5f5', '#292929', { usage: 'background' })[0];
    expect(match?.quality).not.toBe('exact');
  });
});

describe('stateFromSelector', () => {
  it('reads interaction states out of selectors', () => {
    expect(stateFromSelector('.btn:hover')).toBe('hover');
    expect(stateFromSelector('.btn:active')).toBe('pressed');
    expect(stateFromSelector('.btn:focus-visible')).toBe('focus');
    expect(stateFromSelector('.btn[disabled]')).toBe('disabled');
    expect(stateFromSelector('.btn')).toBe('rest');
    expect(stateFromSelector(undefined)).toBe('rest');
  });
});
