import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { brotliCompress, constants, gzip } from 'node:zlib';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const gzipAsync = promisify(gzip);
const brotliAsync = promisify(brotliCompress);

/**
 * Legt neben jede Text-Datei der gebauten Oberfläche eine .gz- und eine .br-Fassung. Der Server liefert sie aus, wenn
 * der Browser sie annimmt (ohne HTTPS nur gzip) – etwa ein Drittel der Größe, ohne dass der Server je Abruf rechnet.
 */
function precompress(): Plugin {
  return {
    name: 'steckplan-precompress',
    apply: 'build',
    async writeBundle(options, bundle) {
      const dir = options.dir;
      if (!dir) return;
      const names = Object.keys(bundle).filter((name) => /\.(js|mjs|css|html|svg|json)$/.test(name));
      await Promise.all(
        names.map(async (name) => {
          const file = join(dir, name);
          const data = await readFile(file);
          // sehr kleine Dateien lohnen nicht
          if (data.length < 1024) return;
          const [gz, br] = await Promise.all([
            gzipAsync(data, { level: 9 }),
            brotliAsync(data, { params: { [constants.BROTLI_PARAM_QUALITY]: 11, [constants.BROTLI_PARAM_SIZE_HINT]: data.length } }),
          ]);
          await Promise.all([writeFile(`${file}.gz`, gz), writeFile(`${file}.br`, br)]);
        }),
      );
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), precompress()],
  server: {
    port: 5173,
    // Im Entwicklungsmodus läuft der Server separat (pnpm dev) auf Port 8080.
    proxy: {
      '/api': 'http://localhost:8080',
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 1700,
  },
});
