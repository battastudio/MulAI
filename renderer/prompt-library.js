// ===========================================================================
//  renderer/prompt-library.js — save reusable prompts and drop them back into
//  the composer. Persists to store key `promptLibrary` (rule 9: reuse `store`).
// ===========================================================================

(function () { /* MAI-IIFE */
const { store, state, el, dom } = window.MAI;

const modal = el('prompts');
const list = el('promptList');

function save() {
  const text = dom.prompt.value.trim();
  if (!text) { dom.status.textContent = 'nothing to save — type a prompt first'; return; }
  const name = (text.split('\n')[0] || 'prompt').slice(0, 48);
  state.promptLibrary = [{ name, text }, ...state.promptLibrary.filter((p) => p.text !== text)].slice(0, 100);
  store.set('promptLibrary', state.promptLibrary);
  render();
}

function render() {
  list.innerHTML = '';
  if (!state.promptLibrary.length) {
    list.innerHTML = '<div class="empty">No saved prompts yet. Type one below and hit “Save current”.</div>';
    return;
  }
  for (const p of state.promptLibrary) {
    const row = document.createElement('div');
    row.className = 'lib-row';
    const load = document.createElement('button');
    load.className = 'lib-load';
    load.textContent = p.name;
    load.title = p.text;
    load.addEventListener('click', () => { dom.prompt.value = p.text; close(); dom.prompt.focus(); });
    const del = document.createElement('button');
    del.className = 'picker-del';
    del.textContent = '✕';
    del.title = 'Delete';
    del.addEventListener('click', () => {
      state.promptLibrary = state.promptLibrary.filter((x) => x !== p);
      store.set('promptLibrary', state.promptLibrary);
      render();
    });
    row.append(load, del);
    list.appendChild(row);
  }
}

function open() { render(); modal.classList.add('open'); }
function close() { modal.classList.remove('open'); }

el('promptsBtn').addEventListener('click', open);
el('promptsClose').addEventListener('click', close);
el('promptSaveBtn').addEventListener('click', save);
modal.addEventListener('click', (e) => { if (e.target === modal) close(); });

Object.assign(window.MAI, { openPrompts: open });
})();
