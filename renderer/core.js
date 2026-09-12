// ===========================================================================
//  renderer/core.js — the shared spine for every renderer module.
//  No bundler: modules load as ordered <script> tags and hang their public API
//  off the single `window.MAI` namespace. This file must load FIRST — it owns
//  the constants, the persisted-state object, the localStorage `store`, shared
//  DOM refs, and a couple of tiny helpers everyone reuses.
// ===========================================================================

// Clean Chrome UA — the source of truth lives in constants.js and is exposed to
// the renderer via preload (window.multiai.UA); this fallback covers the case
// where preload hasn't run (e.g. opened outside Electron).
(function () { /* MAI-IIFE */
const UA = (window.multiai && window.multiai.UA) ||
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

// Generic selectors that work on most modern chat UIs. A CATALOG entry only
// overrides these when the defaults don't hit the right element.
const DEFAULT_INPUT = 'div[contenteditable="true"], textarea';
const DEFAULT_SEND = 'button[aria-label*="Send" i], button[type="submit"]';
const DEFAULT_FILE = 'input[type="file"]';

// Tiny typed localStorage wrapper — the ONE persistence primitive every tool
// reuses (rule 9). Never add a second storage mechanism.
const store = {
  get(k, def) { try { const v = localStorage.getItem(k); return v == null ? def : JSON.parse(v); } catch (_) { return def; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} },
};

// All mutable, cross-module state lives here so any module can read/write it by
// reference (no bundler = no shared `let`). Seeded from persisted settings.
const state = {
  customSites: store.get('customSites', []),
  enabledSites: store.get('enabledSites', ['claude', 'gemini', 'deepseek', 'qwen']),
  theme: store.get('theme', 'dark'),
  promptHistory: store.get('promptHistory', []),
  promptLibrary: store.get('promptLibrary', []),
  syncScroll: store.get('syncScroll', false),
  pasteAll: store.get('pasteAll', true),
  ua: store.get('ua', ''),          // optional User-Agent override ('' = default)
  busy: false,                       // true while attaching/sending — pauses scroll-sync
  pendingImage: null,                // data URL queued for broadcast
  histIndex: -1,                     // prompt-history cursor
  lastMasterAt: 0,                   // scroll-sync bookkeeping
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const focusJS = (sel) =>
  `(function(){var el=document.querySelector(${JSON.stringify(sel)});if(el){el.focus();return true;}return false;})()`;
const el = (id) => document.getElementById(id);

// Shared DOM refs grabbed once (scripts run at end of <body>, so these exist).
const dom = {
  status: el('statusLine'),
  prompt: el('prompt'),
  grid: el('grid'),
  attachments: el('attachments'),
};

// The one namespace. Modules add their functions to it as they load.
window.MAI = { UA, DEFAULT_INPUT, DEFAULT_SEND, DEFAULT_FILE, store, state, sleep, focusJS, el, dom };
})();
