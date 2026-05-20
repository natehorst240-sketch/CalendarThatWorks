/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: process.cwd(),
  // Consume `works-calendar` the way any npm consumer would — from the
  // package's compiled `dist/` artifacts. The host's package.json links
  // the local repo via `file:../..`, so a single `npm run build` at the
  // repo root is enough to make it consumable here. The core bundle no
  // longer references `exceljs` (that moved to the `works-calendar/xlsx`
  // subpath), so no webpack externals/fallbacks are needed here.
};

export default nextConfig;
