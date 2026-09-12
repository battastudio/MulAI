// ===========================================================================
//  renderer/panels.js — renders one <section class="panel"> per enabled site
//  (header controls + <webview>) and keeps the "logged-in" collapse in sync.
// ===========================================================================

(function () { /* MAI-IIFE */
const { UA, state, store, enabledSiteList, adapter, moveSite, injectScrollHook, el, dom } = window.MAI;

function renderPanels() {
  dom.grid.innerHTML = '';
  for (const site of enabledSiteList()) {
    const panel = document.createElement('section');
    panel.className = 'panel';

    const head = document.createElement('div');
    head.className = 'phead';
    head.innerHTML =
      `<span class="dot" style="background:${site.color || '#888'}"></span>` +
      `<span class="pname">${site.name}</span>` +
      (site.flag ? `<span class="flag" title="This site may resist embedding">⚠</span>` : '');

    const sendOne = document.createElement('button');
    sendOne.className = 'send-one';
    sendOne.textContent = '➤';
    sendOne.title = 'Send only to ' + site.name;
    sendOne.addEventListener('click', () => MAI.broadcast([site]));

    const login = document.createElement('button');
    login.className = 'login';
    login.textContent = 'Log in';
    login.title = 'Open a login window';
    login.addEventListener('click', async () => {
      const orig = login.textContent;
      login.disabled = true;
      login.textContent = 'Signing in…';
      try { await window.multiai.openLogin(site.key, site.loginUrl || site.url); }
      catch (err) { console.warn('[Multi-AI] login error:', err.message); }
      finally { login.disabled = false; login.textContent = orig; wv.reload(); }
    });

    const reload = document.createElement('button');
    reload.className = 'reload';
    reload.textContent = '⟳';
    reload.title = 'Reload';
    reload.addEventListener('click', () => wv.reload());

    head.append(sendOne);

    // Per-panel shortcut to the site's own controls/model menu (only where a
    // stable text match is known — models live inside each site's UI).
    if (site.models && site.models.length) {
      const sel = document.createElement('select');
      sel.className = 'model-sel';
      sel.title = 'Toggle this site’s controls';
      sel.innerHTML = '<option value="">⌄ Model</option>' +
        site.models.map((m, i) => `<option value="${i}">${m.name}</option>`).join('');
      sel.addEventListener('change', () => {
        const m = site.models[sel.value];
        sel.value = '';
        if (!m) return;
        wv.executeJavaScript(
          `(function(){var t=${JSON.stringify(m.match)};var els=[].slice.call(document.querySelectorAll('button,[role=button],a,div'));` +
          `var el=els.find(function(e){return (e.textContent||'').trim().indexOf(t)===0;});if(el)el.click();})()`,
          true,
        ).catch(() => {});
      });
      head.append(sel);
    }

    head.append(login, reload);

    // Drag a header to reorder panels; order persists via enabledSites.
    head.draggable = true;
    head.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/plain', site.key);
      document.body.classList.add('dragging');
    });
    head.addEventListener('dragend', () => document.body.classList.remove('dragging'));
    panel.addEventListener('dragover', (e) => { e.preventDefault(); panel.classList.add('drop-target'); });
    panel.addEventListener('dragleave', () => panel.classList.remove('drop-target'));
    panel.addEventListener('drop', (e) => {
      e.preventDefault();
      panel.classList.remove('drop-target');
      moveSite(e.dataTransfer.getData('text/plain'), site.key);
    });

    const wv = document.createElement('webview');
    wv.id = 'wv-' + site.key;
    wv.className = 'view';
    wv.setAttribute('src', site.url);
    wv.setAttribute('partition', 'persist:multiai');
    wv.setAttribute('useragent', state.ua || UA);
    wv.setAttribute('allowpopups', '');
    wv.addEventListener('dom-ready', () => { refreshLoggedIn(); if (state.syncScroll) injectScrollHook(wv); });

    // Double-click a header to maximize just that panel (again to restore).
    head.addEventListener('dblclick', () => {
      const on = panel.classList.toggle('maximized');
      dom.grid.classList.toggle('has-maximized', on);
    });

    panel.append(head, wv);
    dom.grid.appendChild(panel);
  }
  refreshLoggedIn();
}

// Collapse a panel's header once its message box exists (⇒ logged in) so the
// webview gets more vertical space. Header returns on hover (CSS).
async function refreshLoggedIn() {
  await Promise.all(
    enabledSiteList().map(async (site) => {
      const wv = el('wv-' + site.key);
      const panel = wv && wv.closest('.panel');
      if (!panel) return;
      try {
        const ok = await wv.executeJavaScript(
          `!!document.querySelector(${JSON.stringify(adapter(site).input)})`, true);
        panel.classList.toggle('logged-in', !!ok);
      } catch (_) { /* webview not ready yet */ }
    }),
  );
}
setInterval(refreshLoggedIn, 3000);

Object.assign(window.MAI, { renderPanels, refreshLoggedIn });
})();
