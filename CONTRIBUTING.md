# Contributing to Multi-AI

This is the authoritative engineering rulebook. Read it before you write code.
Multi-AI is an Electron + vanilla-JS desktop app — **no framework, no bundler,
no build step**. Keep it that way.

## Golden rules

1. **≤150 lines per file** — hard cap, CI-enforced via `node scripts/check-lines.js`.
   Applies to every `.js` file including renderer modules. Too big? Split browser
   code into ordered `<script>` modules that each attach to `window.MAI`.
2. **One responsibility per file** — name the file after the one thing it does.
3. **Strict process boundary** — privileged work (fs, `child_process`, Node APIs,
   cookie/keychain access, dialogs) lives ONLY in the main process
   (`main.js` / `cookies/`), exposed to the renderer through explicit IPC in
   `preload.js`. Renderer modules NEVER `require` Node modules — they talk to
   `window.multiai`.
4. **Zero runtime dependencies** — Node/Electron stdlib only. Climb the ladder:
   does it need to exist? does stdlib do it? can it be one line?
5. **One namespace** — renderer modules attach their public API to the single
   `window.MAI` namespace; nothing else leaks to global. Load order matters
   (state/catalog first, `app.js` last).
6. **No premature abstraction** — no interface/factory/config for a single use.
7. **Validate every IPC input** at the boundary in the main process; never trust
   the renderer; fail clearly; don't swallow errors silently.
8. **No secrets in git, ever** — no telemetry, no phone-home; auth lives only in
   the Electron session partition, never committed.
9. **Reuse the kit** — the existing `store` (localStorage), the
   `.modal`/`.modal-card`/`.tb-btn` CSS, the CATALOG `adapter()` + `DEFAULT_*`
   selectors, and the existing injection helpers. Theme via CSS variables only.
   No CSS framework, no build step.
10. **AI sites are data** — add a provider by appending one object to `CATALOG`;
    only override selectors when the generic `DEFAULT_*` don't hit.
11. **Naming** — files kebab-case, functions camelCase, constants UPPER_SNAKE;
    descriptive, no cryptic abbreviations.
12. **No dead or commented-out code** — git remembers.
13. **Comments explain WHY not what** — mark deliberate shortcuts with a
    `ponytail:` comment naming the ceiling and the upgrade path.
14. **One runnable self-check per non-trivial module** — a `--selftest` flag or a
    `demo()` with `assert`s. No test framework.
15. **Docs as you go** — update `README.md` and the relevant `docs/*.md` page for
    every user-facing change.

## Architecture at a glance

- **Main process** (`main.js`) — privileged: window management, IPC handlers,
  User-Agent spoofing, cookie import. Cross-platform cookie import dispatches by
  `process.platform` under `cookies/*.js`.
- **Preload** (`preload.js`) — the only bridge: `contextBridge` exposes the
  `window.multiai` IPC API to the renderer. This contract is the trust boundary.
- **Renderer** — small ordered `<script>` modules under `renderer/*.js`, each
  attaching its public API to the single `window.MAI` namespace. Plain script
  tags in `index.html`, loaded in dependency order (state/catalog first, `app.js`
  last). No bundler.
- **Webview panels** use partition `persist:multiai`. The clean Chrome
  User-Agent is applied to every web-contents (including popups).
- **AI sites** are configured as data in the `CATALOG` array
  (`renderer/catalog.js`) — adapter + `DEFAULT_*` selectors per site.
- **Persistence** in the renderer is a tiny localStorage `store` wrapper.
- **Zero runtime deps.** Dev deps only: `electron`, `@electron/packager`.

## Before you open a PR

- [ ] Run `node scripts/check-lines.js` — every file ≤ 150 lines.
- [ ] Run the affected module's `--selftest` (or `demo()`).
- [ ] No secrets or personal cookies in the diff.
- [ ] `README.md` and the relevant `docs/*.md` page updated.
