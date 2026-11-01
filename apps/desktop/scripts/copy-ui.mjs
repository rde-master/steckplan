// Kopiert die gebaute UI (packages/ui/dist) nach dist/ui, von wo der eingebettete Server sie ausliefert.
import { cpSync, existsSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const source = join(here, '../../../packages/ui/dist');
const target = join(here, '../dist/ui');

if (!existsSync(join(source, 'index.html'))) {
  console.error('packages/ui/dist fehlt – zuerst die UI bauen (pnpm --filter @steckplan/ui build).');
  process.exit(1);
}
rmSync(target, { recursive: true, force: true });
cpSync(source, target, { recursive: true });
console.log('UI nach dist/ui kopiert.');
