// Kopiert die Statusseite (Suche, Koppeln, Laden) und das Logo nach dist/.
import { copyFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
copyFileSync(join(here, '../src/status.html'), join(here, '../dist/status.html'));
// Logo wie in der Oberfläche
copyFileSync(join(here, '../../../packages/ui/public/icon.png'), join(here, '../dist/logo.png'));
console.log('Statusseite und Logo nach dist/ kopiert.');
