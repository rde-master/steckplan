import { defineConfig } from 'tsup';

// Bündelt den eigenständigen Server samt Abhängigkeiten in eine Datei –
// das Docker-Image braucht dadurch kein node_modules.
export default defineConfig({
  entry: { standalone: 'src/standalone.ts' },
  format: ['cjs'],
  platform: 'node',
  target: 'node22',
  outDir: 'dist',
  clean: true,
  noExternal: [/.*/],
  sourcemap: false,
});
