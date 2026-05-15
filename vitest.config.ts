import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'happy-dom',
    setupFiles: ['./src/test-setup.ts'],
    css: true,
    testTimeout: 60000,
    include: [
      'src/**/*.{test,spec}.{js,jsx,ts,tsx}',
      'demo/**/*.{test,spec}.{js,jsx,ts,tsx}',
    ],
    exclude: ['tests-e2e/**', 'node_modules/**', 'dist/**', 'demo/app/**', 'engine/**'],
  },
});
