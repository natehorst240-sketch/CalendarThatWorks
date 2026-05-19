/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: process.cwd(),
  // Consume `works-calendar` the way any npm consumer would — from the
  // package's compiled `dist/` artifacts. The host's package.json links
  // the local repo via `file:../..`, so a single `npm run build` at the
  // repo root is enough to make it consumable here.
  webpack: (config) => {
    // The calendar lazy-loads `exceljs` for its Excel export. That chunk
    // pulls in `unzipper`, which has optional Node-only deps (`@aws-sdk/*`)
    // that don't ship in a Next.js client/server bundle. Mark them false
    // so webpack's resolver returns an empty module instead of erroring;
    // the export feature still works if a consumer hits it on the server.
    config.resolve.fallback = {
      ...(config.resolve.fallback ?? {}),
      '@aws-sdk/client-s3': false,
    };
    return config;
  },
};

export default nextConfig;
