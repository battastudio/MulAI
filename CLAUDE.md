# Multi-AI — project rules for Claude

See [CONTRIBUTING.md](./CONTRIBUTING.md) for the full engineering rulebook
(Golden rules, architecture, PR checklist). This file lists the invariants that
must never regress and the per-change discipline.

## Invariants — do not regress

- **Webview partition is `persist:multiai`.** Every panel and login window shares
  this session. Do not change or fork it.
- **Clean Chrome User-Agent applied to every web-contents**, including popups —
  the spoof is what keeps AI sites loading. New windows/webviews must inherit it.
- **Renderer is Node-free and namespaced.** Renderer modules never `require` Node
  modules; each attaches its public API to the single `window.MAI` namespace.
  Load order matters (state/catalog first, `app.js` last).
- **Zero runtime dependencies** — Node/Electron stdlib only.
- **≤150 lines per file** — CI-enforced by `node scripts/check-lines.js`.
- **The `window.multiai` IPC contract** (defined in `preload.js`) is the only
  bridge between renderer and main. Privileged work stays in the main process;
  validate every IPC input at the boundary. Extend the contract explicitly, never
  bypass it.
- **CATALOG-driven site registry** — AI sites are data in `renderer/catalog.js`.
  Add a provider by appending one object; only override `DEFAULT_*` selectors
  when the generic ones don't hit.

## Code ↔ docs lockstep

Every user-facing change must be mirrored into `README.md` and the relevant
`docs/*.md` page in the same change. Code and docs move together, always.

## Per-change checklist

- [ ] Run `node scripts/check-lines.js`.
- [ ] Run the affected module's `--selftest` (or `demo()`).
- [ ] Update `README.md` and the relevant `docs/*.md` page.
