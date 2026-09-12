// ===========================================================================
//  renderer/settings.js — one home for preferences. Fields reuse the toolbar's
//  apply* functions and the `store`, so the top-bar toggles stay in sync.
//  The User-Agent override takes effect on the next panel render / restart.
// ===========================================================================

(function () { /* MAI-IIFE */
const { store, state, el } = window.MAI;

const modal = el('settings');
const s = {
  view: el('setView'), theme: el('setTheme'), paste: el('setPaste'),
  sync: el('setSync'), ua: el('setUa'),
};

function load() {
  s.view.value = store.get('viewMode', 'grid');
  s.theme.value = state.theme;
  s.paste.checked = state.pasteAll;
  s.sync.checked = state.syncScroll;
  s.ua.value = state.ua || '';
}

s.view.addEventListener('change', () => MAI.applyView(s.view.value));
s.theme.addEventListener('change', () => MAI.applyTheme(s.theme.value));
s.paste.addEventListener('change', () => MAI.applyPasteAll(s.paste.checked));
s.sync.addEventListener('change', () => MAI.applySync(s.sync.checked));
s.ua.addEventListener('change', () => {
  state.ua = s.ua.value.trim();
  store.set('ua', state.ua);
  MAI.renderPanels();   // rebuild webviews with the new UA
});

el('setReset').addEventListener('click', () => {
  state.ua = '';
  store.set('ua', '');
  MAI.applyTheme('dark');
  MAI.applyView('grid');
  MAI.applyPasteAll(true);
  MAI.applySync(false);
  MAI.renderPanels();
  load();
});

function open() { load(); modal.classList.add('open'); }
function close() { modal.classList.remove('open'); }
el('settingsBtn').addEventListener('click', open);
el('settingsClose').addEventListener('click', close);
modal.addEventListener('click', (e) => { if (e.target === modal) close(); });

Object.assign(window.MAI, { openSettings: open });
})();
