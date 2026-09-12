# Architecture

For contributors. The full rulebook is [`CONTRIBUTING.md`](../CONTRIBUTING.md); this is the map.

## Three sides

- **Main process** (`main.js`, `cookies/`, `constants.js`) — the only place with Node/OS access: window + login-window management, IPC handlers, the clean-UA spoof applied to *every* web-contents (incl. sign-in pop-ups), image clipboard/paste/CDP-drop, and cookie import.
- **Preload** (`preload.js`) — a `contextBridge` exposing a tiny, explicit `window.multiai` API (login, import, clipboard, focus/paste, CDP drop) plus the shared UA. The renderer never requires Node.
- **Renderer** (`renderer/*.js`) — plain `<script>` modules, each ≤150 lines, wrapped in an IIFE and hanging their public API off one shared **`window.MAI`** namespace. No bundler; load order in `index.html` is `core → catalog → engines → UI → app`.

## The `window.MAI` namespace

`core.js` loads first and creates `MAI` with the constants, the persisted `state` object, the `store` (localStorage) wrapper, shared DOM refs, and helpers. Every later module does `const { … } = window.MAI` and `Object.assign(window.MAI, { … })`. Cross-module calls go through `MAI.*` (e.g. `MAI.renderPanels()`), never bare globals.

## How a send works (two phases)

`renderer/broadcast.js` → `broadcast(sites)`:

1. **Phase A — image (if any).** `image.js`/`inject-file.js` attach the pasted image to *every* panel and **verify a preview appeared** before anything sends (paste into the exact web-contents, or a trusted CDP file drag-drop as fallback). No chat fires until the image is confirmed.
2. **Phase B — text.** `inject-text.js` builds a self-contained IIFE injected into each panel: it fills the input (native setter for textareas, `execCommand('insertText')` for contenteditable), then waits for an *enabled* send button before clicking — falling back to Enter.

Selectors per site come from `catalog.js` via `adapter(site)` (site overrides, else `DEFAULT_*`).

## State & auth

UI preferences persist in `localStorage` (via `store`). Auth persists in the Electron session partition `persist:multiai` — shared by panels, login windows, and OAuth pop-ups. Nothing is committed to git (`.gitignore` blocks local state).

## Invariants (don't regress)

Partition `persist:multiai` · clean UA on all web-contents · Node-free namespaced renderer · zero runtime deps · ≤150 lines/file · the `window.multiai` IPC contract · CATALOG-driven sites.

## Checks

`npm run lint` (the ≤150-line gate, also CI) · `npm test` (cookie decrypt self-checks) · `npm start` to drive the real app.
