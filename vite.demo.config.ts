import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Base path is configurable via env so the same build works for both
// the Vercel root-domain deploy (workscalendar.com → `/`) and a
// GitHub Pages project deploy (`/CalendarThatWorks/`). Defaults to `/`
// because that's what Vercel needs; the GH Pages workflow can set
// VITE_BASE=/CalendarThatWorks/ before invoking the build.
const base = process.env.VITE_BASE ?? '/';

export default defineConfig({
  plugins: [react()],
  root: 'demo',
  base,
  build: {
    outDir: '../demo-dist',
    emptyOutDir: true,
  },
});
