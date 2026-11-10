// Kopiert die Statusseite (Suche, Koppeln, Laden) nach dist/.
import { copyFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
copyFileSync(join(here, '../src/status.html'), join(here, '../dist/status.html'));
console.log('Statusseite nach dist/ kopiert.');
