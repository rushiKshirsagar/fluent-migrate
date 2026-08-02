import type { UsageKind } from '../../types.js';

/** Which surface of an element a token is meant to paint. */
export type TokenRole = 'foreground' | 'background' | 'stroke' | 'shadow' | 'other';

/** The Fluent token group a token belongs to. */
export type TokenFamily =
  | 'neutral'
  | 'brand'
  | 'compound'
  | 'subtle'
  | 'palette'
  | 'status'
  | 'transparent'
  | 'stencil'
  | 'other';

/** The interaction state a token is designed for. */
export type TokenState =
  | 'rest'
  | 'hover'
  | 'pressed'
  | 'active'
  | 'selected'
  | 'disabled'
  | 'focus';

export interface FluentToken {
  /** Token name as exported by Fluent, e.g. `colorNeutralForeground1`. */
  name: string;
  role: TokenRole;
  family: TokenFamily;
  state: TokenState;
  /** Numeric suffix, e.g. `2` in `colorNeutralForeground2`. `0` when absent. */
  rank: number;
  /** Palette hue (`Red`) or status kind (`Danger`) segment of the name. */
  variant?: string;
  inverted?: boolean;
  /** Tokens that keep the same value in both themes. */
  fixed?: boolean;
  onBrand?: boolean;
  link?: boolean;
  /** Normalized `#rrggbb`, or `#rrggbbaa` when translucent. */
  light: string;
  dark: string;
}

export type Theme = 'light' | 'dark';

/** Fluent token roles that can legitimately serve a given CSS usage. */
export const ROLES_FOR_USAGE: Record<UsageKind, TokenRole[]> = {
  text: ['foreground'],
  fill: ['foreground'],
  stroke: ['foreground'],
  background: ['background'],
  gradient: ['background'],
  border: ['stroke'],
  outline: ['stroke'],
  shadow: ['shadow'],
  variable: ['foreground', 'background', 'stroke', 'shadow', 'other'],
  unknown: ['foreground', 'background', 'stroke', 'shadow', 'other'],
};
