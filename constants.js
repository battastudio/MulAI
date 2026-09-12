// Shared constants for the MAIN process side (main.js, preload.js). The renderer
// can't require() Node modules, so preload.js re-exposes UA on window.multiai —
// keep this the single source of truth for the spoofed User-Agent.

// A clean Chrome UA (no "Electron") so Google sign-in / Cloudflare don't block
// the embedded views, and sign-in pop-ups look like a normal browser.
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

module.exports = { UA };
