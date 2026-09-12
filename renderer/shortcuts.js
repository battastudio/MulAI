// ===========================================================================
//  renderer/shortcuts.js — the "?" help overlay listing keyboard shortcuts.
//  Opens from the header button or by pressing "?" while not typing.
// ===========================================================================

(function () { /* MAI-IIFE */
const { el } = window.MAI;

const modal = el('shortcuts');
function open() { modal.classList.add('open'); }
function close() { modal.classList.remove('open'); }

el('helpBtn').addEventListener('click', open);
el('shortcutsClose').addEventListener('click', close);
modal.addEventListener('click', (e) => { if (e.target === modal) close(); });

// "?" opens help — but only when the user isn't typing into a field.
window.addEventListener('keydown', (e) => {
  const t = e.target;
  const typing = t && (t.tagName === 'TEXTAREA' || t.tagName === 'INPUT' || t.isContentEditable);
  if (e.key === '?' && !typing) { e.preventDefault(); open(); }
  if (e.key === 'Escape') close();
});

Object.assign(window.MAI, { openShortcuts: open });
})();
