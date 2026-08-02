import { glob } from 'tinyglobby';

export const DEFAULT_INCLUDE = [
  '**/*.css',
  '**/*.scss',
  '**/*.sass',
  '**/*.less',
  '**/*.js',
  '**/*.jsx',
  '**/*.mjs',
  '**/*.cjs',
  '**/*.ts',
  '**/*.tsx',
];

export const DEFAULT_IGNORE = [
  '**/node_modules/**',
  '**/dist/**',
  '**/build/**',
  '**/out/**',
  '**/.next/**',
  '**/.nuxt/**',
  '**/.turbo/**',
  '**/coverage/**',
  '**/storybook-static/**',
  '**/*.min.css',
  '**/*.min.js',
  '**/*.d.ts',
  '**/*.map',
];

export type FileKind = 'stylesheet' | 'script';

export function fileKind(path: string): FileKind {
  return /\.(css|scss|sass|less)$/i.test(path) ? 'stylesheet' : 'script';
}

export async function findSourceFiles(
  root: string,
  include = DEFAULT_INCLUDE,
  ignore: string[] = [],
): Promise<string[]> {
  const files = await glob(include, {
    cwd: root,
    ignore: [...DEFAULT_IGNORE, ...ignore],
    dot: false,
    absolute: false,
    followSymbolicLinks: false,
  });
  return files.sort();
}
