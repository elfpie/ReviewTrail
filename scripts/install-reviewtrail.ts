import { lstatSync, mkdirSync, readlinkSync, symlinkSync, unlinkSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

const root = resolve(import.meta.dir, '..');
const home = homedir();
const bin = process.env.REVIEWTRAIL_BIN_DIR || join(home, '.local', 'bin');
const claude = process.env.CLAUDE_CONFIG_DIR || join(home, '.claude');
const pi = process.env.PI_CODING_AGENT_DIR || join(home, '.pi', 'agent');
const targets = [
  { dest: join(bin, 'reviewtrail'), src: 'bin/reviewtrail', directory: false },
  { dest: join(claude, 'skills', 'reviewtrail'), src: 'integrations/claude/skills/reviewtrail', directory: true },
  { dest: join(pi, 'extensions', 'reviewtrail'), src: 'integrations/pi', directory: true },
];
function pointsTo(dest: string, src: string) {
  return lstatSync(dest, { throwIfNoEntry: false })?.isSymbolicLink()
    && resolve(dirname(dest), readlinkSync(dest)) === join(root, src);
}
for (const { dest, src } of targets) {
  if (lstatSync(dest, { throwIfNoEntry: false }) && !pointsTo(dest, src)) {
    throw new Error(`Already in use: ${dest}`);
  }
}
for (const { dest, src, directory } of targets) {
  if (!pointsTo(dest, src)) {
    mkdirSync(dirname(dest), { recursive: true });
    symlinkSync(join(root, src), dest, directory ? 'dir' : 'file');
  }
  console.log(dest);
}
// Migrate only the exact shims the first prototype installed from this checkout.
for (const [name, src] of [['plannotator', 'bin/plannotator.js'], ['plannotator-review', 'bin/plannotator-review']]) {
  const dest = join(bin, name);
  if (pointsTo(dest, src)) unlinkSync(dest);
}
