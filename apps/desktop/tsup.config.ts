import { defineConfig } from 'tsup';

// Main- und Preload-Prozess werden mitsamt Server und Abhängigkeiten gebündelt,
// damit die App kein node_modules braucht (einfacheres Paketieren mit pnpm).
export default defineConfig({
  entry: { main: 'src/main.ts', preload: 'src/preload.ts' },
  format: ['cjs'],
  platform: 'node',
  target: 'node22',
  outDir: 'dist',
  clean: true,
  external: ['electron'],
  noExternal: [/^(?!electron$).*/],
  sourcemap: false,
  outExtension: () => ({ js: '.cjs' }),
});
