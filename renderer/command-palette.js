// ===========================================================================
//  renderer/command-palette.js — ⌘K / Ctrl-K launcher. A flat command registry
//  filtered by substring; ↑/↓ to move, Enter to run, Esc to close. Panel-focus
//  commands are generated from the enabled sites at open time.
// ===========================================================================

(function () { /* MAI-IIFE */
const { enabledSiteList, el } = window.MAI;

const modal = el('palette');
const input = el('paletteInput');
const list = el('paletteList');
let items = [];      // current filtered [{label, run}]
let active = 0;

function commands() {
  const M = window.MAI;
  const base = [
    { label: '➤ Send to all', run: () => M.broadcast(enabledSiteList()) },
    { label: '⬇ Export answers to Markdown', run: () => M.exportAll() },
    { label: '📚 Prompt library', run: () => M.openPrompts() },
    { label: '⚙ Choose AI tools', run: () => M.openPicker() },
    { label: '⚙ Settings', run: () => M.openSettings() },
    { label: '☾ Toggle theme', run: () => M.applyTheme(M.state.theme === 'light' ? 'dark' : 'light') },
    { label: '▥ Toggle grid / columns', run: () => M.applyView(M.dom.grid.classList.contains('columns') ? 'grid' : 'columns') },
    { label: '🖼 Toggle paste-all', run: () => M.applyPasteAll(!M.state.pasteAll) },
    { label: '⇅ Toggle scroll-sync', run: () => M.applySync(!M.state.syncScroll) },
    { label: '⬇ Import logins from Edge', run: () => document.querySelector('[data-import="edge"]').click() },
    { label: '⬇ Import logins from Chrome', run: () => document.querySelector('[data-import="chrome"]').click() },
  ];
  const focus = enabledSiteList().map((s) => ({
    label: `→ Focus ${s.name}`, run: () => { const wv = el('wv-' + s.key); if (wv) wv.focus(); },
  }));
  return base.concat(focus);
}

function render() {
  list.innerHTML = '';
  items.forEach((it, i) => {
    const row = document.createElement('div');
    row.className = 'cmd-row' + (i === active ? ' active' : '');
    row.textContent = it.label;
    row.addEventListener('click', () => run(i));
    list.appendChild(row);
  });
}

function filter() {
  const q = input.value.trim().toLowerCase();
  items = commands().filter((c) => c.label.toLowerCase().includes(q));
  active = 0;
  render();
}

function run(i) { const it = items[i]; close(); if (it) it.run(); }
function open() { input.value = ''; filter(); modal.classList.add('open'); input.focus(); }
function close() { modal.classList.remove('open'); }

input.addEventListener('input', filter);
input.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowDown') { active = Math.min(active + 1, items.length - 1); render(); e.preventDefault(); }
  else if (e.key === 'ArrowUp') { active = Math.max(active - 1, 0); render(); e.preventDefault(); }
  else if (e.key === 'Enter') { run(active); e.preventDefault(); }
  else if (e.key === 'Escape') { close(); }
});
modal.addEventListener('click', (e) => { if (e.target === modal) close(); });

window.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); open(); }
});

Object.assign(window.MAI, { openPalette: open });
})();
