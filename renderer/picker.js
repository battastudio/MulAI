// ===========================================================================
//  renderer/picker.js — the "Choose AI tools" modal: enable/disable sites, plus
//  add / edit / remove your own. Custom sites can carry selector overrides
//  (input/send/fileInput/imageMode) so a site the DEFAULT_* selectors miss can
//  still be driven — that's what the Advanced fields are for.
// ===========================================================================

(function () { /* MAI-IIFE */
const { store, state, allSites, siteByKey, el } = window.MAI;

const picker = el('picker');
const pickerList = el('pickerList');
const f = { name: el('addName'), url: el('addUrl'), input: el('addInput'), send: el('addSend'), file: el('addFile'), mode: el('addImageMode') };
const addBtn = el('addBtn');
let editingKey = null;   // non-null while editing an existing custom site

const COLORS = ['#e0679a', '#57b6c2', '#c2a457', '#7d9be0', '#8fc257', '#c27a57'];

function renderPickerList() {
  pickerList.innerHTML = '';
  for (const site of allSites()) {
    const row = document.createElement('label');
    row.className = 'picker-row';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = state.enabledSites.includes(site.key);
    cb.addEventListener('change', () => {
      state.enabledSites = cb.checked
        ? [...state.enabledSites, site.key]
        : state.enabledSites.filter((k) => k !== site.key);
      store.set('enabledSites', state.enabledSites);
      MAI.renderPanels();
    });
    const dot = `<span class="dot" style="background:${site.color || '#888'}"></span>`;
    const label = document.createElement('span');
    label.innerHTML = `${dot}<span class="pname">${site.name}</span>` +
      (site.flag ? ` <span class="flag" title="May resist embedding">⚠</span>` : '') +
      (site.custom ? ` <span class="picker-url">${site.url}</span>` : '');
    row.append(cb, label);

    if (site.custom) {
      const edit = document.createElement('button');
      edit.className = 'picker-edit'; edit.textContent = '✎'; edit.title = 'Edit this AI';
      edit.addEventListener('click', (e) => { e.preventDefault(); loadIntoForm(site); });
      const del = document.createElement('button');
      del.className = 'picker-del'; del.textContent = '✕'; del.title = 'Remove this AI';
      del.addEventListener('click', (e) => {
        e.preventDefault();
        state.customSites = state.customSites.filter((s) => s.key !== site.key);
        state.enabledSites = state.enabledSites.filter((k) => k !== site.key);
        store.set('customSites', state.customSites);
        store.set('enabledSites', state.enabledSites);
        if (editingKey === site.key) resetForm();
        renderPickerList(); MAI.renderPanels();
      });
      row.append(edit, del);
    }
    pickerList.appendChild(row);
  }
}

function loadIntoForm(site) {
  editingKey = site.key;
  f.name.value = site.name; f.url.value = site.url;
  f.input.value = site.input || ''; f.send.value = site.send || '';
  f.file.value = site.fileInput || ''; f.mode.value = site.imageMode || '';
  addBtn.textContent = 'Save changes';
  el('advFields').classList.add('open');
}
function resetForm() {
  editingKey = null;
  Object.values(f).forEach((x) => { x.value = ''; });
  addBtn.textContent = 'Add your own';
}

function saveSite() {
  const name = f.name.value.trim();
  let url = f.url.value.trim();
  if (!name || !url) return;
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
  const extra = {
    input: f.input.value.trim() || undefined, send: f.send.value.trim() || undefined,
    fileInput: f.file.value.trim() || undefined, imageMode: f.mode.value || undefined,
  };

  if (editingKey) {
    const s = state.customSites.find((x) => x.key === editingKey);
    if (s) Object.assign(s, { name, url, loginUrl: url, ...extra });
  } else {
    let base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'ai';
    let key = base, n = 2;
    while (siteByKey(key)) key = `${base}-${n++}`;
    state.customSites.push({ key, name, url, loginUrl: url, color: COLORS[state.customSites.length % COLORS.length], custom: true, ...extra });
    state.enabledSites.push(key);
  }
  store.set('customSites', state.customSites);
  store.set('enabledSites', state.enabledSites);
  resetForm();
  renderPickerList(); MAI.renderPanels();
}

function openPicker() { renderPickerList(); picker.classList.add('open'); }
function closePicker() { picker.classList.remove('open'); }
el('pickerBtn').addEventListener('click', openPicker);
el('pickerClose').addEventListener('click', closePicker);
picker.addEventListener('click', (e) => { if (e.target === picker) closePicker(); });
el('advToggle').addEventListener('click', () => el('advFields').classList.toggle('open'));
addBtn.addEventListener('click', saveSite);

Object.assign(window.MAI, { openPicker, closePicker, renderPickerList });
})();
