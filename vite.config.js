import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { readdirSync, mkdirSync, copyFileSync } from 'fs';

/** Copy src/styles/*.css → dist/themes/ after lib build */
const copyThemesPlugin = () => ({
  name: 'copy-themes',
  closeBundle() {
    mkdirSync('dist/themes', { recursive: true });
    readdirSync('src/styles')
      .filter(f => f.endsWith('.css'))
      .forEach(f => copyFileSync(`src/styles/${f}`, `dist/themes/${f}`));
  },
});

export default defineConfig({
  plugins: [react(), copyThemesPlugin()],
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.js'),
      name: 'WorksCalendar',
      formats: ['es', 'umd'],
      fileName: (format) => `works-calendar.${format}.js`,
    },
    rollupOptions: {
      external: ['react', 'react-dom', 'xlsx', '@supabase/supabase-js'],
      output: {
        globals: {
          react: 'React',
          'react-dom': 'ReactDOM',
        },
      },
    },
  },
});
