export { findColors, type FindColorsOptions, type FoundColor } from './core/color/parse.js';
export {
  applyFix,
  planFix,
  SKIP_NOTES,
  type Edit,
  type FileChange,
  type FixOptions,
  type FixResult,
  type SkipReason,
  type Skipped,
} from './core/fix/index.js';
export { insideColorFunction, isPreprocessorVariable } from './core/fix/guards.js';
export { checkWorkTree, explain, type WorkTreeState } from './core/fix/git.js';
export {
  matchColor,
  matchThemePair,
  stateFromSelector,
  QUALITY_THRESHOLD,
  type MatchContext,
  type MatchQuality,
  type TokenMatch,
} from './core/match/index.js';
export {
  buildPlan,
  serializePlan,
  type MigrationPlan,
  type PlanEntry,
  type PlanOptions,
  type ThemePair,
} from './core/plan/index.js';
export {
  buildPromptPack,
  type ComponentWork,
  type PromptPack,
} from './core/prompt/index.js';
export {
  DEFAULT_IGNORE,
  DEFAULT_INCLUDE,
  dominantUsage,
  groupColors,
  scanProject,
} from './core/scan/index.js';
export {
  chromaOf,
  deltaEOk,
  getIndexedTokens,
  toOklabCoords,
  tokenValue,
  FLUENT_THEME_VERSION,
  FLUENT_TOKENS,
  ROLES_FOR_USAGE,
  type FluentToken,
  type Oklab,
  type Theme,
  type TokenFamily,
  type TokenRole,
  type TokenState,
} from './core/tokens/index.js';
export { classifyProperty, toKebabCase } from './core/usage.js';
export { printScanReport, swatch, type ReportOptions } from './report/console.js';
export { printFixReport, type FixReportOptions } from './report/fix.js';
export { printPlanReport, type PlanReportOptions } from './report/plan.js';
export type {
  ColorGroup,
  ColorOccurrence,
  ColorSyntax,
  ScanOptions,
  ScanResult,
  UsageKind,
} from './types.js';
