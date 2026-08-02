import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { ColorGroup, ColorOccurrence, ScanOptions, ScanResult, UsageKind } from '../../types.js';
import { DEFAULT_INCLUDE, fileKind, findSourceFiles } from './files.js';
import { scanScript } from './script.js';
import { scanStylesheet } from './stylesheet.js';

export async function scanProject(options: ScanOptions): Promise<ScanResult> {
  const startedAt = Date.now();
  const root = path.resolve(options.root);
  const files = await findSourceFiles(root, options.include ?? DEFAULT_INCLUDE, options.ignore);

  const occurrences: ColorOccurrence[] = [];
  const filesWithColors = new Set<string>();

  const results = await Promise.all(
    files.map(async (file) => {
      const source = await readFile(path.join(root, file), 'utf8').catch(() => null);
      if (source === null) return [];
      return fileKind(file) === 'stylesheet'
        ? scanStylesheet(file, source)
        : scanScript(file, source);
    }),
  );

  for (const found of results) {
    for (const occurrence of found) {
      occurrences.push(occurrence);
      filesWithColors.add(occurrence.file);
    }
  }

  return {
    root,
    filesScanned: files.length,
    filesWithColors: filesWithColors.size,
    occurrences,
    groups: groupColors(occurrences),
    durationMs: Date.now() - startedAt,
  };
}

/** Collapses occurrences into one entry per distinct color, most used first. */
export function groupColors(occurrences: ColorOccurrence[]): ColorGroup[] {
  const byHex = new Map<string, ColorGroup>();

  for (const occurrence of occurrences) {
    const key = occurrence.hex.toLowerCase();
    let group = byHex.get(key);
    if (!group) {
      group = {
        hex: key,
        alpha: occurrence.alpha,
        count: 0,
        fileCount: 0,
        usages: {},
        occurrences: [],
      };
      byHex.set(key, group);
    }
    group.count++;
    group.occurrences.push(occurrence);
    group.usages[occurrence.usage] = (group.usages[occurrence.usage] ?? 0) + 1;
  }

  const groups = [...byHex.values()];
  for (const group of groups) {
    group.fileCount = new Set(group.occurrences.map((o) => o.file)).size;
  }
  return groups.sort((a, b) => b.count - a.count || a.hex.localeCompare(b.hex));
}

/** The usage that best describes a color, used when a color has mixed roles. */
export function dominantUsage(group: ColorGroup): UsageKind {
  let best: UsageKind = 'unknown';
  let bestCount = -1;
  for (const [usage, count] of Object.entries(group.usages) as Array<[UsageKind, number]>) {
    if (count > bestCount || (count === bestCount && best === 'unknown')) {
      best = usage;
      bestCount = count;
    }
  }
  return best;
}

export { DEFAULT_IGNORE, DEFAULT_INCLUDE } from './files.js';
