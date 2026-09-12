// ===========================================================================
//  renderer/toolbar.js — the quick-access toggles in the top bar: theme,
//  grid/columns view, and paste-all. Each just flips a bit of `state`, persists
//  it, and reflects it in the button. Settings (settings.js) reuses these.
// ===========================================================================

(function () { /* MAI-IIFE */
const { store, state, el } = window.MAI;

const themeToggle = el('themeToggle');
const viewToggle = el('viewToggle');
const pasteAllToggle = el('pasteAllToggle');

function applyTheme(mode) {
  state.theme = mode;
  document.body.classList.toggle('light', mode === 'light');
  themeToggle.textContent = mode === 'light' ? '☀ Light' : '☾ Dark';
  store.set('theme', mode);
}
themeToggle.addEventListener('click', () => applyTheme(state.theme === 'light' ? 'dark' : 'light'));
applyTheme(state.theme);

function applyView(mode) {
  const columns = mode === 'columns';
  MAI.dom.grid.classList.toggle('columns', columns);
  viewToggle.textContent = columns ? '▤ Columns' : '▥ Grid';
  store.set('viewMode', mode);
}
viewToggle.addEventListener('click', () => {
  applyView(MAI.dom.grid.classList.contains('columns') ? 'grid' : 'columns');
});

function applyPasteAll(on) {
  state.pasteAll = on;
  pasteAllToggle.classList.toggle('on', on);
  pasteAllToggle.textContent = on ? '🖼 Paste-all on' : '🖼 Paste-all';
  store.set('pasteAll', on);
}
pasteAllToggle.addEventListener('click', () => applyPasteAll(!state.pasteAll));
applyPasteAll(state.pasteAll);

Object.assign(window.MAI, { applyTheme, applyView, applyPasteAll });
})();
