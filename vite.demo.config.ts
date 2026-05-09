import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const isProd = process.env.NODE_ENV === 'production';

export default defineConfig({
  plugins: [react()],
  root: 'demo',
  base: isProd ? '/CalendarThatWorks/' : '/',
  build: {
    outDir: '../demo-dist',
    emptyOutDir: true,
  },
});
