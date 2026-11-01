#!/usr/bin/env node
// Überträgt die Versionsnummer aus der Root-package.json in alle Pakete
// und in packages/core/src/version.ts (Anzeige in der App, Server, Docker).
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

if (!/^\d+\.\d+\.\d+(-[\w.]+)?$/.test(version)) {
  console.error(`Ungültige Version in package.json: ${version}`);
  process.exit(1);
}

const changed = [];
for (const group of ['packages', 'apps']) {
  for (const name of readdirSync(join(root, group))) {
    const file = join(root, group, name, 'package.json');
    if (!existsSync(file)) continue;
    const text = readFileSync(file, 'utf8');
    const pkg = JSON.parse(text);
    if (pkg.version !== version) {
      pkg.version = version;
      writeFileSync(file, JSON.stringify(pkg, null, 2) + '\n');
      changed.push(`${group}/${name}/package.json`);
    }
  }
}

const versionFile = join(root, 'packages/core/src/version.ts');
const versionSource = `// Automatisch erzeugt von scripts/sync-version.mjs – nicht von Hand ändern.\nexport const VERSION = '${version}';\n`;
if (!existsSync(versionFile) || readFileSync(versionFile, 'utf8') !== versionSource) {
  writeFileSync(versionFile, versionSource);
  changed.push('packages/core/src/version.ts');
}

console.log(changed.length ? `Version ${version} übernommen in:\n  ${changed.join('\n  ')}` : `Version ${version} ist überall aktuell.`);
