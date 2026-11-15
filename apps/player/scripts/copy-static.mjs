// Kopiert die Statusseite (Suche, Koppeln, Laden), die Seite des Bild-Verkleinerers und das Logo nach dist/.
import { copyFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
copyFileSync(join(here, '../src/status.html'), join(here, '../dist/status.html'));
// leere Seite des unsichtbaren Fensters, das Bilder auf Bildschirmgröße verkleinert
copyFileSync(join(here, '../src/resizer.html'), join(here, '../dist/resizer.html'));
// Logo wie in der Oberfläche
copyFileSync(join(here, '../../../packages/ui/public/icon.png'), join(here, '../dist/logo.png'));
console.log('Statusseite und Logo nach dist/ kopiert.');
