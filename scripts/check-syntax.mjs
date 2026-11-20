// Syntax-check every JavaScript file in the extension (cross-platform, no dependencies).
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const roots = ['.', 'lib', 'scripts', 'tests'];
const files = roots.flatMap((dir) => readdirSync(dir).filter((f) => f.endsWith('.js') || f.endsWith('.mjs')).map((f) => join(dir, f)));
let failed = 0;
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { stdio: 'inherit' });
  if (result.status !== 0) failed += 1;
}
console.log(`Syntax checked ${files.length} files, ${failed} failed.`);
process.exit(failed ? 1 : 0);
