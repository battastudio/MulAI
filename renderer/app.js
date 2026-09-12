// ===========================================================================
//  renderer/app.js — boot + wiring that doesn't belong to a single tool: the
//  composer send/history keys and the "import logins from browser" buttons.
//  Loads LAST, after every module has registered its API on window.MAI.
// ===========================================================================

(function () { /* MAI-IIFE */
const { state, store, siteByKey, enabledSiteList, broadcast, renderPanels, applyView, el, dom } = window.MAI;

el('sendBtn').addEventListener('click', () => broadcast(enabledSiteList()));

// Composer: Enter sends; ↑/↓ recall prompt history when the caret is at the edge.
dom.prompt.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    broadcast(enabledSiteList());
    return;
  }
  const h = state.promptHistory;
  if (e.key === 'ArrowUp' && dom.prompt.selectionStart === 0 && state.histIndex < h.length - 1) {
    state.histIndex++;
    dom.prompt.value = h[state.histIndex] || '';
    e.preventDefault();
  } else if (e.key === 'ArrowDown' && dom.prompt.selectionStart === dom.prompt.value.length && state.histIndex >= 0) {
    state.histIndex--;
    dom.prompt.value = state.histIndex >= 0 ? h[state.histIndex] : '';
    e.preventDefault();
  }
});

// "Import logins from browser" buttons (Edge / Chrome).
const importStatus = el('importStatus');
document.querySelectorAll('[data-import]').forEach((btn) => {
  btn.addEventListener('click', async () => {
    const browser = btn.dataset.import;
    document.querySelectorAll('[data-import]').forEach((b) => (b.disabled = true));
    importStatus.textContent = `Reading ${browser} cookies… (approve the Keychain prompt)`;

    const res = await window.multiai.importCookies(browser);
    if (!res || !res.ok) {
      importStatus.textContent = '⚠️ ' + ((res && res.error) || 'Import failed');
    } else {
      const parts = Object.entries(res.perSite).map(
        ([site, count]) => `${(siteByKey(site) || {}).name || site} ${count > 0 ? '✓' : '✗'}`,
      );
      const note = res.perSite.gemini === 0 ? '  ·  Gemini: use the Log in button' : '';
      const prof = res.profile ? ` [${res.profile}]` : '';
      importStatus.textContent = `Imported${prof} — ${parts.join('  ·  ')}${note}`;
      enabledSiteList().forEach((s) => { const wv = el('wv-' + s.key); if (wv) wv.reload(); });
    }
    document.querySelectorAll('[data-import]').forEach((b) => (b.disabled = false));
  });
});

// ---- boot -------------------------------------------------------------------
applyView(store.get('viewMode', 'grid'));
renderPanels();
})();
