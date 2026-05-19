// Stops Next.js from walking up the tree and hitting the repo root's
// postcss.config.js (which uses ESM default-export syntax that Next.js'
// PostCSS loader can't parse). We don't need any plugins at the host
// level — globals.css is plain CSS and the calendar's compiled styles
// already came pre-processed via the library's Vite build.
module.exports = {
  plugins: {},
};
