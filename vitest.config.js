import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { resolve, extname } from 'path';
import { existsSync } from 'fs';

function tsExtensionFallback() {
  return {
    name: 'ts-extension-fallback',
    resolveId(source, importer) {
      if (!importer) return null;
      if (extname(source) !== '.js') return null;
      const tsPath = source.replace(/\.js$/, '.ts');
      const base = resolve(importer, '..', tsPath);
      if (existsSync(base)) return base;
      return null;
    },
  };
}

export default defineConfig({
  plugins: [react(), tsExtensionFallback()],
  test: {
    globals: true,
    environment: 'happy-dom',
    setupFiles: ['./src/test-setup.js'],
    css: true,
  },
});
