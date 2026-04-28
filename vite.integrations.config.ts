/**
 * Subpath build for optional `works-calendar/integrations/*`
 * modules. Run *after* the main `vite.config.ts` build so the dist/
 * directory already contains the primary library; this pass only
 * appends the integration modules and their types.
 *
 * ESM-only: subpath modules are an opt-in for modern consumers; UMD
 * subpaths aren't consumable as script tags anyway. The main entry
 * keeps emitting both formats.
 */
import { defineConfig, type Plugin } from 'vite';
import dts from 'vite-plugin-dts';
import { resolve } from 'path';
import { readFileSync, writeFileSync } from 'fs';
import { glob } from 'glob';

/**
 * The emitted subpath `.d.ts` files import types relative to the
 * source tree (e.g. `from '../core/pools/locationAdapters'`). After
 * publish, the package only ships `dist/index.d.ts` for the main
 * entry — those relative paths don't resolve. Rewrite them to import
 * from the package root so consumers' tsc finds the types via the
 * main types pointer.
 */
const rewritePackageImportsPlugin = (): Plugin => ({
  name: 'rewrite-subpath-types',
  closeBundle() {
    const files = glob.sync('dist/integrations/**/*.d.ts');
    for (const file of files) {
      const before = readFileSync(file, 'utf8');
      // Match `from '...src-tree-path...'` (relative path traversing
      // out of dist/integrations/) and rewrite to `from 'works-calendar'`.
      const after = before.replace(
        /from\s+['"](\.\.\/(?:[^'"]*\/)?(?:core|hooks|providers|types|ui|views)\/[^'"]+)['"]/g,
        "from 'works-calendar'",
      );
      if (after !== before) writeFileSync(file, after, 'utf8');
    }
  },
});

export default defineConfig({
  plugins: [
    dts({
      tsconfigPath: './tsconfig.build.json',
      entryRoot: 'src',
      include: ['src/integrations/**/*.ts'],
      exclude: ['src/**/__tests__/**', 'src/**/*.test.*'],
      outDir: 'dist',
      // No rollupTypes here — the subpath module imports types from
      // the main library (`../core/pools/locationAdapters`), and
      // rolling them up duplicates declarations already shipped in
      // `dist/index.d.ts`. Per-file emission + the rewrite plugin
      // below points the imports at the package root so consumers'
      // tsc finds the types via the main entry.
    }),
    rewritePackageImportsPlugin(),
  ],
  build: {
    // Don't wipe the main build output — this pass strictly appends.
    emptyOutDir: false,
    lib: {
      entry: {
        'integrations/asset-tracker': resolve(__dirname, 'src/integrations/asset-tracker.ts'),
      },
      formats: ['es'],
      fileName: (_format, entryName) => `${entryName}.es.js`,
    },
    rollupOptions: {
      external: [
        'react', 'react-dom', 'xlsx', '@supabase/supabase-js',
        'maplibre-gl', 'maplibre-gl/dist/maplibre-gl.css',
        'react-map-gl', 'react-map-gl/maplibre',
        // Don't inline anything from the main library — consumers
        // import the bridge alongside the main entry, so types from
        // `../core/pools/locationAdapters` should resolve through
        // the package, not be duplicated into the subpath bundle.
        /^\.\.\/core\//,
      ],
    },
  },
});
