// Startet die App im Testmodus: sie lädt die UI, prüft /api/health und beendet sich.
// Exit-Code 0 = Fenster und Statusseite (Suche) funktionieren.
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const electron = require('electron');
const appDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = [appDir];
if (process.platform === 'linux') args.push('--no-sandbox');

// ELECTRON_RUN_AS_NODE (z. B. aus VS Code geerbt) würde Electron als reines Node starten.
const env = { ...process.env, STECKPLAN_SMOKE_TEST: '1' };
delete env.ELECTRON_RUN_AS_NODE;

const result = spawnSync(electron, args, {
  stdio: 'inherit',
  env,
  timeout: 60_000,
});
process.exit(result.status ?? 1);
