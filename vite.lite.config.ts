/**
 * Lite-entry build — appends works-calendar-lite.{es,umd}.js and index.lite.d.ts
 * to the dist/ directory produced by the main vite.config.ts build.
 *
 * Run after the main build:
 *   vite build && vite build --config vite.lite.config.ts
 */
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import dts from 'vite-plugin-dts';
import { resolve } from 'path';

export default defineConfig({
  plugins: [
    react(),
    dts({
      tsconfigPath: './tsconfig.build.json',
      entryRoot: 'src',
      include: ['src/index.lite.ts', 'src/types/**/*.ts', 'src/vite-env.d.ts'],
      exclude: ['src/**/__tests__/**', 'src/**/*.test.*', 'src/test-setup.ts'],
      outDir: 'dist',
      skipDiagnostics: true,
    }),
  ],
  build: {
    emptyOutDir: false,
    lib: {
      entry: resolve(__dirname, 'src/index.lite.ts'),
      name: 'WorksCalendarLite',
      formats: ['es', 'umd'],
      fileName: (format) => `works-calendar-lite.${format}.js`,
    },
    rollupOptions: {
      external: [
        'react', 'react-dom', '@supabase/supabase-js',
        'maplibre-gl', 'maplibre-gl/dist/maplibre-gl.css',
        'react-map-gl', 'react-map-gl/maplibre',
        'exceljs', 'date-fns', 'lucide-react',
      ],
      output: {
        globals: {
          react: 'React',
          'react-dom': 'ReactDOM',
          'date-fns': 'dateFns',
          'lucide-react': 'LucideReact',
        },
      },
    },
  },
});
