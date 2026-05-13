/**
 * Lite-entry build — appends works-calendar-lite.es.js and index.lite.d.ts
 * to the dist/ directory produced by the main vite.config.ts build.
 *
 * Run after the main build:
 *   vite build && vite build --config vite.lite.config.ts
 */
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import dts from 'vite-plugin-dts';
import { resolve } from 'path';
import { readFileSync, writeFileSync } from 'fs';

/**
 * The lite entry's emitted `.d.ts` re-exports symbols from sibling
 * source paths (e.g. `./WorksCalendar.tsx`, `./views/ScheduleView`)
 * that aren't shipped per-file from this build. Rewrite each relative
 * import in `dist/index.lite.d.ts` to the package root so TypeScript
 * resolves the types via the main entry's rolled-up declarations.
 *
 * The rolled-up `dist/index.d.ts` has no `default` export — every
 * symbol that the source re-exports via `export { default as Foo }`
 * surfaces as a named export there. Strip the `default as` aliasing
 * during the rewrite so the lite re-exports resolve to those names.
 */
const rewriteLiteImportsPlugin = (): Plugin => ({
  name: 'rewrite-lite-types',
  closeBundle() {
    const file = 'dist/index.lite.d.ts';
    const before = readFileSync(file, 'utf8');
    const after = before.replace(
      /(export|import)(\s+type)?\s*\{([^}]*)\}\s*from\s*(['"])(\.[^'"]*)\4/g,
      (_match, kind, typeMod, names, quote) => {
        const cleaned = names.replace(/\bdefault\s+as\s+/g, '');
        return `${kind}${typeMod ?? ''} {${cleaned}} from ${quote}works-calendar${quote}`;
      },
    );
    if (after !== before) writeFileSync(file, after, 'utf8');
  },
});

export default defineConfig({
  plugins: [
    react(),
    dts({
      tsconfigPath: './tsconfig.build.json',
      entryRoot: 'src',
      include: ['src/index.lite.ts'],
      exclude: ['src/**/__tests__/**', 'src/**/*.test.*', 'src/test-setup.ts'],
      outDir: 'dist',
      skipDiagnostics: true,
    }),
    rewriteLiteImportsPlugin(),
  ],
  build: {
    emptyOutDir: false,
    lib: {
      entry: resolve(__dirname, 'src/index.lite.ts'),
      formats: ['es'],
      fileName: () => 'works-calendar-lite.es.js',
    },
    rollupOptions: {
      external: [
        'react', 'react-dom', '@supabase/supabase-js',
        'maplibre-gl', 'maplibre-gl/dist/maplibre-gl.css',
        'react-map-gl', 'react-map-gl/maplibre',
        'exceljs', 'date-fns', 'lucide-react',
      ],
    },
  },
});
