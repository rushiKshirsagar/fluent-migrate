#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Command } from 'commander';
import pc from 'picocolors';
import { applyFix, planFix } from './core/fix/index.js';
import { checkWorkTree, explain } from './core/fix/git.js';
import type { MatchQuality } from './core/match/index.js';
import { buildPlan, serializePlan } from './core/plan/index.js';
import { buildPromptPack } from './core/prompt/index.js';
import { scanProject } from './core/scan/index.js';
import { printScanReport } from './report/console.js';
import { printFixReport } from './report/fix.js';
import { printPlanReport } from './report/plan.js';

/** Prefers a short relative path, but never one that climbs out of the tree. */
function displayPath(target: string): string {
  const relative = path.relative(process.cwd(), target);
  return relative && !relative.startsWith('..') ? relative : target;
}

const program = new Command();

program
  .name('fluent-migrate')
  .description('Migrate a React app\'s CSS/SCSS colors to Fluent UI makeStyles + design tokens.')
  .version('0.1.0');

program
  .command('scan', { isDefault: true })
  .description('find every color in the codebase and report on it')
  .argument('[path]', 'project directory to scan', '.')
  .option('-i, --include <globs...>', 'file globs to scan')
  .option('-e, --ignore <globs...>', 'extra globs to skip')
  .option('-l, --limit <n>', 'colors to list; 0 shows all', '40')
  .option('-v, --verbose', 'list every occurrence with its location')
  .option('--json <file>', 'also write the raw result to a JSON file')
  .action(async (target: string, options) => {
    const result = await scanProject({
      root: path.resolve(process.cwd(), target),
      include: options.include,
      ignore: options.ignore,
    });

    printScanReport(result, {
      limit: Number.parseInt(options.limit, 10),
      showOccurrences: Boolean(options.verbose),
    });

    if (options.json) {
      const output = path.resolve(process.cwd(), options.json);
      await writeFile(output, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
      console.log(pc.dim(`  wrote ${displayPath(output)}`));
      console.log('');
    }
  });

program
  .command('plan')
  .description('map every color found onto the closest Fluent design token')
  .argument('[path]', 'project directory to scan', '.')
  .option('-i, --include <globs...>', 'file globs to scan')
  .option('-e, --ignore <globs...>', 'extra globs to skip')
  .option('-l, --limit <n>', 'colors to list; 0 shows all', '40')
  .option('-a, --alternatives', 'show runner-up tokens for each color')
  .option('--json <file>', 'also write the plan to a JSON file')
  .action(async (target: string, options) => {
    const scan = await scanProject({
      root: path.resolve(process.cwd(), target),
      include: options.include,
      ignore: options.ignore,
    });
    const plan = buildPlan(scan);

    printPlanReport(plan, {
      limit: Number.parseInt(options.limit, 10),
      showAlternatives: Boolean(options.alternatives),
    });

    if (options.json) {
      const output = path.resolve(process.cwd(), options.json);
      await writeFile(output, `${JSON.stringify(serializePlan(plan), null, 2)}\n`, 'utf8');
      console.log(pc.dim(`  wrote ${displayPath(output)}`));
      console.log('');
    }
  });

program
  .command('fix')
  .description('replace color literals with the Fluent CSS variable for their token')
  .argument('[path]', 'project directory to rewrite', '.')
  .option('-i, --include <globs...>', 'file globs to scan')
  .option('-e, --ignore <globs...>', 'extra globs to skip')
  .option('-w, --write', 'apply the changes; without it nothing is written')
  .option(
    '--accept <fit>',
    'worst fit to apply: exact, near, close or approximate',
    'near',
  )
  .option('--preprocessor-vars', 'rewrite Sass and Less variable declarations too')
  .option('-q, --quiet', 'summarize instead of printing every changed line')
  .option('--allow-dirty', 'write even when git cannot undo the result')
  .action(async (target: string, options) => {
    const root = path.resolve(process.cwd(), target);
    const plan = buildPlan(
      await scanProject({ root, include: options.include, ignore: options.ignore }),
    );

    const accept = options.accept as MatchQuality;
    if (!['exact', 'near', 'close', 'approximate'].includes(accept)) {
      throw new Error(`--accept must be exact, near, close or approximate, not "${accept}"`);
    }

    const result = await planFix(plan, {
      accept,
      rewritePreprocessorVariables: Boolean(options.preprocessorVars),
    });

    printFixReport(result, { write: Boolean(options.write), showDiff: !options.quiet });

    if (options.write) {
      if (!options.allowDirty) {
        const state = await checkWorkTree(root);
        if (!state.safe) {
          throw new Error(
            `refusing to write because ${explain(state)}\n` +
              '  Commit or stash first, then re-run. Use --allow-dirty to override.',
          );
        }
      }
      await applyFix(root, result);
    }
  });

program
  .command('prompt')
  .description('write a migration brief and plan JSON for your coding agent to follow')
  .argument('[path]', 'project directory to scan', '.')
  .option('-i, --include <globs...>', 'file globs to scan')
  .option('-e, --ignore <globs...>', 'extra globs to skip')
  .option('-o, --out <dir>', 'where to write the pack', '.fluent-migrate')
  .action(async (target: string, options) => {
    const root = path.resolve(process.cwd(), target);
    const plan = buildPlan(
      await scanProject({ root, include: options.include, ignore: options.ignore }),
    );
    const pack = await buildPromptPack(plan);

    const outDir = path.resolve(process.cwd(), options.out);
    await mkdir(outDir, { recursive: true });
    for (const file of pack.files) {
      await writeFile(path.join(outDir, file.name), file.contents, 'utf8');
    }

    const relative = displayPath(outDir);
    console.log('');
    console.log(pc.bold(pc.cyan('  fluent-migrate')) + pc.dim('  ·  prompt pack'));
    console.log('');
    for (const file of pack.files) {
      console.log(`  ${pc.green('✓')} ${path.join(relative, file.name)}`);
    }
    console.log('');
    console.log(
      `  ${pc.bold(String(pack.components.length))} components to migrate, ` +
        `${pc.bold(String(plan.entries.length))} color decisions already made`,
    );
    console.log('');
    console.log(pc.dim(`  hand ${path.join(relative, 'PROMPT.md')} to your agent to do the rewrite`));
    console.log('');
  });

program.parseAsync(process.argv).catch((error: unknown) => {
  console.error(pc.red(`\n  fluent-migrate failed: ${(error as Error).message}\n`));
  process.exitCode = 1;
});
