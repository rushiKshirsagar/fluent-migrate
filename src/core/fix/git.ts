import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);

export type WorkTreeState =
  | { safe: true }
  | { safe: false; reason: 'not-a-repo' | 'dirty' | 'no-git'; detail?: string };

async function git(root: string, args: string[]): Promise<string | undefined> {
  try {
    const { stdout } = await run('git', ['-C', root, ...args], { encoding: 'utf8' });
    return stdout;
  } catch {
    return undefined;
  }
}

/**
 * `fix --write` edits sources in place and keeps no backup of its own, so the
 * only way back is version control. Refuse to run unless git can undo it.
 */
export async function checkWorkTree(root: string): Promise<WorkTreeState> {
  if (!(await git(root, ['--version']))) {
    return { safe: false, reason: 'no-git' };
  }

  const inside = await git(root, ['rev-parse', '--is-inside-work-tree']);
  if (inside?.trim() !== 'true') {
    return { safe: false, reason: 'not-a-repo' };
  }

  const status = await git(root, ['status', '--porcelain', '--', '.']);
  const changed = (status ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  if (changed.length > 0) {
    const preview = changed.slice(0, 5).join('\n    ');
    const more = changed.length > 5 ? `\n    …and ${changed.length - 5} more` : '';
    return { safe: false, reason: 'dirty', detail: `${preview}${more}` };
  }

  return { safe: true };
}

export function explain(state: Extract<WorkTreeState, { safe: false }>): string {
  if (state.reason === 'no-git') {
    return 'git is not installed, so there would be no way to undo these edits.';
  }
  if (state.reason === 'not-a-repo') {
    return 'this directory is not a git repository, so there would be no way to undo these edits.';
  }
  return `this git tree has uncommitted changes, which would be impossible to tell apart from the rewrite:\n\n    ${state.detail}\n`;
}
