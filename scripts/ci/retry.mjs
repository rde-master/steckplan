// CI: Befehl bei Fehlern wiederholen (Downloads von GitHub, z. B. Electron, brechen gelegentlich mit 5xx ab).
// Aufruf: node scripts/ci/retry.mjs <Versuche> <Befehl> [Argumente …]
import { spawnSync } from 'node:child_process';

const [triesArg, command, ...args] = process.argv.slice(2);
const tries = Math.max(1, Number(triesArg) || 1);
if (!command) {
  console.error('Aufruf: node scripts/ci/retry.mjs <Versuche> <Befehl> [Argumente …]');
  process.exit(2);
}
for (let attempt = 1; attempt <= tries; attempt++) {
  const result = spawnSync(command, args, { stdio: 'inherit', shell: process.platform === 'win32' });
  if (result.status === 0) process.exit(0);
  if (attempt === tries) process.exit(result.status ?? 1);
  const wait = Math.min(120, 15 * 2 ** (attempt - 1));
  console.warn(`Versuch ${attempt}/${tries} fehlgeschlagen – neuer Versuch in ${wait} s …`);
  await new Promise((resolve) => setTimeout(resolve, wait * 1000));
}
