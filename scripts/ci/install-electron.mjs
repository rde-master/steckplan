// CI: Electron-Programm laden, bevor es gebraucht wird (mit Wiederholung, siehe retry.mjs). Electron lädt sein
// Programm erst beim ersten Aufruf von GitHub; schlägt das fehl (z. B. 504), scheitern Smoke-Test und Installer.
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const require = createRequire(join(root, 'apps', 'desktop', 'package.json'));
const installer = join(dirname(require.resolve('electron/package.json')), 'install.js');
const result = spawnSync(process.execPath, [join(root, 'scripts', 'ci', 'retry.mjs'), '8', process.execPath, installer], { stdio: 'inherit' });
process.exit(result.status ?? 1);
