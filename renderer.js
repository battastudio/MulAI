// ===========================================================================
//  Renderer — runs in the app window (not in the sites).
//  Renders the AI panels from a single registry (CATALOG + user-added sites),
//  and on "Send to all" injects a small script into each <webview> that finds
//  the message box, types the text, and presses send.
//
//  ⚠️ Selectors differ per site and change over time. If one panel stops
//     receiving the message, fix that site's entry in CATALOG below.
// ===========================================================================

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

// Generic selectors that work on most modern chat UIs. A CATALOG entry only
// needs to override these when the defaults don't hit the right element.
const DEFAULT_INPUT = 'div[contenteditable="true"], textarea';
const DEFAULT_SEND = 'button[aria-label*="Send" i], button[type="submit"]';
const DEFAULT_FILE = 'input[type="file"]';

// One object per known AI. `flag` marks sites likely to resist embedding.
const CATALOG = [
  { key: 'claude',     name: 'Claude',     url: 'https://claude.ai/new',            loginUrl: 'https://claude.ai/login',            color: '#d97757',
    input: 'div[contenteditable="true"]', send: 'button[aria-label="Send message"], button[aria-label*="Send" i]' },
  { key: 'chatgpt',    name: 'ChatGPT',    url: 'https://chatgpt.com/',             loginUrl: 'https://chatgpt.com/',               color: '#10a37f',
    input: '#prompt-textarea, div[contenteditable="true"], textarea', send: 'button[data-testid="send-button"], button[aria-label*="Send" i]', flag: 'bot detection' },
  { key: 'gemini',     name: 'Gemini',     url: 'https://gemini.google.com/app',    loginUrl: 'https://gemini.google.com/app',      color: '#4f86f7', imageMode: 'paste',
    input: 'div.ql-editor[contenteditable="true"], div[contenteditable="true"], textarea', send: 'button[aria-label*="Send" i], button.send-button' },
  { key: 'grok',       name: 'Grok',       url: 'https://grok.com/',                loginUrl: 'https://grok.com/',                  color: '#8a8f98', flag: 'bot detection' },
  { key: 'perplexity', name: 'Perplexity', url: 'https://www.perplexity.ai/',       loginUrl: 'https://www.perplexity.ai/',         color: '#20b8cd' },
  { key: 'copilot',    name: 'Copilot',    url: 'https://copilot.microsoft.com/',   loginUrl: 'https://copilot.microsoft.com/',     color: '#0078d4' },
  { key: 'deepseek',   name: 'DeepSeek',   url: 'https://chat.deepseek.com/',       loginUrl: 'https://chat.deepseek.com/sign_in',  color: '#3fbf7f', imageMode: 'file',
    input: 'textarea#chat-input, textarea', send: 'div[role="button"][aria-disabled="false"], button[type="submit"]',
    models: [{ name: 'DeepThink', match: 'DeepThink' }, { name: 'Search', match: 'Search' }] },
  { key: 'qwen',       name: 'Qwen',       url: 'https://chat.qwen.ai/',            loginUrl: 'https://chat.qwen.ai/',              color: '#b06ef0', imageMode: 'file' },
  { key: 'mistral',    name: 'Le Chat',    url: 'https://chat.mistral.ai/chat',     loginUrl: 'https://chat.mistral.ai/chat',       color: '#ff7000' },
  { key: 'kimi',       name: 'Kimi',       url: 'https://www.kimi.com/',            loginUrl: 'https://www.kimi.com/',              color: '#6a5cff', imageMode: 'paste' },
  { key: 'meta',       name: 'Meta AI',    url: 'https://www.meta.ai/',             loginUrl: 'https://www.meta.ai/',               color: '#0866ff' },
  { key: 'poe',        name: 'Poe',        url: 'https://poe.com/',                 loginUrl: 'https://poe.com/login',              color: '#5a4bd6' },
  { key: 'pi',         name: 'Pi',         url: 'https://pi.ai/talk',               loginUrl: 'https://pi.ai/talk',                 color: '#d96a9a' },
  { key: 'you',        name: 'You.com',    url: 'https://you.com/',                 loginUrl: 'https://you.com/',                   color: '#8b5cf6' },
];

// ---- persisted settings ------------------------------------------------------
const store = {
  get(k, def) { try { const v = localStorage.getItem(k); return v == null ? def : JSON.parse(v); } catch (_) { return def; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} },
};

let customSites = store.get('customSites', []);
let enabledSites = store.get('enabledSites', ['claude', 'gemini', 'deepseek', 'qwen']);
let theme = store.get('theme', 'dark');
let promptHistory = store.get('promptHistory', []);
let syncScroll = store.get('syncScroll', false);
let pasteAll = store.get('pasteAll', true);
let busy = false; // true while attaching/sending — pauses scroll-sync polling

const allSites = () => {
  const seen = new Set();
  return [...CATALOG, ...customSites].filter((s) => !seen.has(s.key) && seen.add(s.key));
};
const siteByKey = (k) => allSites().find((s) => s.key === k);
const enabledSiteList = () => enabledSites.map(siteByKey).filter(Boolean);
const adapter = (s) => ({
  input: s.input || DEFAULT_INPUT,
  send: s.send || DEFAULT_SEND,
  fileInput: s.fileInput || DEFAULT_FILE,
  attachSel: s.attachSel || '',
});

// Reorder enabledSites so `fromKey` lands just before `toKey`, then re-render.
function moveSite(fromKey, toKey) {
  if (!fromKey || fromKey === toKey) return;
  const rest = enabledSites.filter((k) => k !== fromKey);
  const at = rest.indexOf(toKey);
  if (at < 0) return;
  rest.splice(at, 0, fromKey);
  enabledSites = rest;
  store.set('enabledSites', enabledSites);
  renderPanels();
}

// ---- injection scripts (run INSIDE a panel's page) --------------------------
// opts.append → add text after existing content (don't wipe a pasted image).
// opts.submitDelay → ms to wait before the FIRST send attempt.
// opts.submitTries → how many extra 400 ms retries to wait for an ENABLED send
// button (so an in-flight image upload finishes before we send).
function buildInjection(inputSel, sendSel, text, opts = {}) {
  const append = !!opts.append;
  const submitDelay = opts.submitDelay != null ? opts.submitDelay : 250;
  const submitTries = opts.submitTries != null ? opts.submitTries : 2;
  return `(function () {
    var text = ${JSON.stringify(text)};
    var inputSel = ${JSON.stringify(inputSel)};
    var sendSel = ${JSON.stringify(sendSel)};
    var append = ${append};

    function setNative(el, v) {
      var proto = el.tagName === 'TEXTAREA'
        ? window.HTMLTextAreaElement.prototype
        : window.HTMLInputElement.prototype;
      var d = Object.getOwnPropertyDescriptor(proto, 'value');
      var val = append ? (el.value || '') + v : v;
      if (d && d.set) d.set.call(el, val); else el.value = val;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }
    function setEditable(el, v) {
      el.focus();
      var sel = window.getSelection();
      var r = document.createRange();
      r.selectNodeContents(el);
      r.collapse(false);          // caret to END (keeps any pasted image)
      if (!append) {              // replace everything when not appending
        r.selectNodeContents(el);
      }
      sel.removeAllRanges();
      sel.addRange(r);
      document.execCommand('insertText', false, v);
    }
    function fill(el, v) {
      if (!v) return;
      if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') setNative(el, v);
      else setEditable(el, v);
    }
    function pressEnter(el) {
      ['keydown', 'keypress', 'keyup'].forEach(function (t) {
        el.dispatchEvent(new KeyboardEvent(t, {
          key: 'Enter', code: 'Enter', keyCode: 13, which: 13,
          bubbles: true, cancelable: true,
        }));
      });
    }
    function attempt(n) {
      var input = document.querySelector(inputSel);
      if (!input) {
        if (n < 8) return setTimeout(function () { attempt(n + 1); }, 400);
        return;
      }
      input.focus();
      fill(input, text);
      // Wait for an ENABLED send button (upload may still be in flight),
      // then click it; fall back to Enter only after the retries run out.
      function trySend(left) {
        var btn = document.querySelector(sendSel);
        if (btn && !btn.disabled && btn.getAttribute('aria-disabled') !== 'true') return btn.click();
        if (left > 0) return setTimeout(function () { trySend(left - 1); }, 400);
        pressEnter(input);
      }
      setTimeout(function () { trySend(${submitTries}); }, ${submitDelay});
    }
    attempt(0);
  })();`;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const focusJS = (sel) =>
  `(function(){var el=document.querySelector(${JSON.stringify(sel)});if(el){el.focus();return true;}return false;})()`;

// Attach an image via the site's own hidden <input type=file> — focus-independent,
// so it works regardless of which webview holds focus. Returns 'file' if the file
// was actually set on an input, else 'none'. Does exactly ONE thing (no synthetic
// paste, no preview polling) — stacking two methods is what caused double-attach.
function buildFileInjection(fileInputSel, attachSel, dataURL) {
  return `(async function () {
    var dataURL = ${JSON.stringify(dataURL)};
    var fileInputSel = ${JSON.stringify(fileInputSel)};
    var attachSel = ${JSON.stringify(attachSel || '')};
    var wait = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };

    var blob = await (await fetch(dataURL)).blob();
    var file = new File([blob], 'image.png', { type: blob.type || 'image/png' });

    function findFileInput() {
      return document.querySelector('input[type="file"][accept*="image" i]')
        || document.querySelector(fileInputSel)
        || document.querySelector('input[type="file"]');
    }
    // Click an attach / "+" / upload control to make a lazily-mounted input appear.
    function clickAttach() {
      var el = (attachSel && document.querySelector(attachSel)) || document.querySelector(
        'button[aria-label*="attach" i], button[aria-label*="upload" i], button[aria-label*="image" i],' +
        'button[aria-label*="file" i], button[aria-label*="add" i], button[aria-label*="plus" i],' +
        '[data-testid*="attach" i], [data-testid*="upload" i], [class*="upload" i] button, [class*="attach" i] button'
      );
      if (el) el.click();
    }

    for (var t = 0; t < 6; t++) {
      var fi = findFileInput();
      if (!fi) { clickAttach(); await wait(300); continue; }
      try {
        var dt = new DataTransfer();
        dt.items.add(file);
        fi.files = dt.files;
        var ok = fi.files && fi.files.length > 0;   // check NOW — the change handler may clear it
        fi.dispatchEvent(new Event('input', { bubbles: true }));
        fi.dispatchEvent(new Event('change', { bubbles: true }));
        if (ok) return 'file';
      } catch (e) {}
      break;
    }
    return 'none';
  })();`;
}

// Simulate a real file drag-and-drop of the image onto a panel's composer (via
// CDP in the main process). Universal + trusted; the composer center comes from
// the input element's rect inside the guest.
async function dropImage(wv, inputSel, dataURL) {
  try {
    const pt = await wv.executeJavaScript(
      `(function(){var el=document.querySelector(${JSON.stringify(inputSel)});` +
      `if(!el)return null;var r=el.getBoundingClientRect();` +
      `return {x:Math.round(r.left+r.width/2), y:Math.round(r.top+r.height/2)};})()`, true);
    if (!pt) return;
    await window.multiai.dropImage(wv.getWebContentsId(), dataURL, pt.x, pt.y);
    await sleep(1000);
  } catch (_) {}
}

// Count image-preview thumbnails in a panel — used ONLY to verify/report whether
// an image actually landed (never to trigger a second attach, so no doubles).
const PREVIEW_SEL =
  'img[src^="blob:"], img[src^="data:image"], [class*="attach" i] img, [class*="preview" i] img, [class*="thumbnail" i] img';
const countPreviews = (wv) =>
  wv.executeJavaScript(`document.querySelectorAll(${JSON.stringify(PREVIEW_SEL)}).length`, true).catch(() => 0);
async function confirmPreview(wv, base) {
  for (let i = 0; i < 10; i++) {
    if ((await countPreviews(wv)) > base) return true;
    await sleep(300);
  }
  return false;
}

// ---- DOM refs ---------------------------------------------------------------
const statusLine = document.getElementById('statusLine');
const promptEl = document.getElementById('prompt');
const gridEl = document.getElementById('grid');
const viewToggle = document.getElementById('viewToggle');
const themeToggle = document.getElementById('themeToggle');
const syncToggle = document.getElementById('syncToggle');
const pasteAllToggle = document.getElementById('pasteAllToggle');
const attachmentsEl = document.getElementById('attachments');

// ---- theme ------------------------------------------------------------------
function applyTheme(mode) {
  theme = mode;
  document.body.classList.toggle('light', mode === 'light');
  themeToggle.textContent = mode === 'light' ? '☀ Light' : '☾ Dark';
  store.set('theme', mode);
}
themeToggle.addEventListener('click', () => applyTheme(theme === 'light' ? 'dark' : 'light'));
applyTheme(theme);

// ---- paste-all toggle -------------------------------------------------------
function applyPasteAll(on) {
  pasteAll = on;
  pasteAllToggle.classList.toggle('on', on);
  pasteAllToggle.textContent = on ? '🖼 Paste-all on' : '🖼 Paste-all';
  store.set('pasteAll', on);
}
pasteAllToggle.addEventListener('click', () => applyPasteAll(!pasteAll));
applyPasteAll(pasteAll);

// ---- view toggle — grid (2×2) ⇄ mobile columns (||||) -----------------------
function applyView(mode) {
  const columns = mode === 'columns';
  gridEl.classList.toggle('columns', columns);
  viewToggle.textContent = columns ? '▤ Columns' : '▥ Grid';
  try { localStorage.setItem('viewMode', mode); } catch (_) {}
}
viewToggle.addEventListener('click', () => {
  applyView(gridEl.classList.contains('columns') ? 'grid' : 'columns');
});

// ---- scroll-sync (off by default) -------------------------------------------
// ponytail: heuristic — hooks the biggest overflowing element per page and
// mirrors the most-recently-scrolled panel's ratio to the others. Fragile for
// virtualized chat lists; a best-effort convenience behind a toggle.
const SCROLL_HOOK = `(function(){
  if (window.__mai_hooked) return; window.__mai_hooked = true;
  function biggest(){
    var best = document.scrollingElement, max = 0, els = document.querySelectorAll('*');
    for (var i=0;i<els.length;i++){ var e=els[i], d=e.scrollHeight-e.clientHeight;
      if (d>max && e.clientHeight>200){ max=d; best=e; } }
    return best;
  }
  document.addEventListener('scroll', function(ev){
    if (Date.now() < (window.__mai_mute||0)) return;
    var el = (ev.target===document||ev.target===document.body) ? document.scrollingElement : ev.target;
    var d = el.scrollHeight-el.clientHeight; if (d<=0) return;
    window.__mai_el=el; window.__mai_ratio=el.scrollTop/d; window.__mai_at=Date.now();
  }, true);
  window.__mai_el = biggest();
})()`;

function injectScrollHook(wv) { try { wv.executeJavaScript(SCROLL_HOOK, true).catch(() => {}); } catch (_) {} }

let lastMasterAt = 0;
setInterval(async () => {
  if (!syncScroll || busy) return;   // don't compete with an in-progress image attach/send
  const sites = enabledSiteList();
  if (sites.length < 2) return;
  const reads = await Promise.all(sites.map(async (s) => {
    const wv = document.getElementById('wv-' + s.key);
    if (!wv) return null;
    try { return { key: s.key, ...(await wv.executeJavaScript('({r:window.__mai_ratio,at:window.__mai_at||0})', true)) }; }
    catch (_) { return null; }
  }));
  const valid = reads.filter((r) => r && typeof r.r === 'number');
  const master = valid.sort((a, b) => b.at - a.at)[0];
  if (!master || master.at <= lastMasterAt) return;
  lastMasterAt = master.at;
  for (const s of sites) {
    if (s.key === master.key) continue;
    const wv = document.getElementById('wv-' + s.key);
    if (!wv) continue;
    try {
      await wv.executeJavaScript(
        `(function(r){window.__mai_mute=Date.now()+300;var el=window.__mai_el||document.scrollingElement;` +
        `if(el){var d=el.scrollHeight-el.clientHeight;if(d>0)el.scrollTop=r*d;}})(${master.r})`, true);
    } catch (_) {}
  }
}, 150);

function applySync(on) {
  syncScroll = on;
  syncToggle.classList.toggle('on', on);
  syncToggle.textContent = on ? '⇅ Sync on' : '⇅ Sync';
  store.set('syncScroll', on);
  if (on) enabledSiteList().forEach((s) => {
    const wv = document.getElementById('wv-' + s.key);
    if (wv) injectScrollHook(wv);
  });
}
syncToggle.addEventListener('click', () => applySync(!syncScroll));
applySync(syncScroll);

// ---- panel rendering (from the enabled site list) ---------------------------
function renderPanels() {
  gridEl.innerHTML = '';
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
    sendOne.addEventListener('click', () => broadcast([site]));

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

    // Per-panel shortcut to the site's own in-page controls/model menu (only
    // where a stable selector is known — models live inside each site's UI).
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
    wv.setAttribute('useragent', UA);
    wv.setAttribute('allowpopups', '');
    wv.addEventListener('dom-ready', () => { refreshLoggedIn(); if (syncScroll) injectScrollHook(wv); });

    // Double-click a header to maximize just that panel (double-click again to restore).
    head.addEventListener('dblclick', () => {
      const on = panel.classList.toggle('maximized');
      gridEl.classList.toggle('has-maximized', on);
    });

    panel.append(head, wv);
    gridEl.appendChild(panel);
  }
  refreshLoggedIn();
}

// Collapse a panel's header once its message box exists (⇒ logged in) so the
// webview gets more vertical space. Header returns on hover (CSS).
async function refreshLoggedIn() {
  await Promise.all(
    enabledSiteList().map(async (site) => {
      const wv = document.getElementById('wv-' + site.key);
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

// ---- pasted image -----------------------------------------------------------
let pendingImage = null; // data URL of the image to broadcast

function renderImage() {
  attachmentsEl.innerHTML = '';
  if (!pendingImage) return;
  const chip = document.createElement('div');
  chip.className = 'chip';
  chip.innerHTML = `<img src="${pendingImage}" /> image`;
  const copy = document.createElement('button');
  copy.textContent = '📋';
  copy.title = 'Copy image to clipboard (then click a panel and press ⌘V)';
  copy.addEventListener('click', async () => {
    try { await window.multiai.writeClipboardImage(pendingImage); statusLine.textContent = 'image copied — click a panel and press ⌘V'; } catch (_) {}
  });
  const x = document.createElement('button');
  x.textContent = '✕';
  x.title = 'Remove image';
  x.addEventListener('click', () => { pendingImage = null; renderImage(); });
  chip.append(copy, x);
  attachmentsEl.appendChild(chip);
}

// Capture an image pasted anywhere in the app window.
window.addEventListener('paste', (e) => {
  const items = e.clipboardData?.items || [];
  for (const item of items) {
    if (item.type && item.type.startsWith('image/')) {
      const file = item.getAsFile();
      if (!file) continue;
      const reader = new FileReader();
      reader.onload = async () => {
        pendingImage = reader.result;
        renderImage();
        // Paste-all: upload the image into every panel right now (verified),
        // so it's already there when the user types and sends.
        if (pasteAll) {
          busy = true;
          try { await distributeImage(enabledSiteList(), pendingImage); }
          finally { busy = false; }
        }
      };
      reader.readAsDataURL(file);
      e.preventDefault();
      return;
    }
  }
});

// ---- send -------------------------------------------------------------------
// PHASE A — attach the image to one panel, replicating the manual ⌘V that the
// user confirmed works: real focus → paste → verify a preview appeared → retry.
// Returns true only once a preview is actually confirmed in that composer.
async function attachImage(site, image) {
  const wv = document.getElementById('wv-' + site.key);
  if (!wv) return false;
  const a = adapter(site);
  const base = await countPreviews(wv);
  if (base > 0) return true;                 // already attached (e.g. live-distributed)
  const id = wv.getWebContentsId();
  for (let r = 0; r < 3; r++) {
    // Trusted paste into this exact panel, replicating ⌘V. Order matters:
    // focus the webContents FIRST, then the composer, then paste — otherwise
    // focusing the contents blurs the composer and the paste lands nowhere.
    try {
      wv.focus();
      await window.multiai.focusContents(id);
      await sleep(120);
      await wv.executeJavaScript(focusJS(a.input), true);
      await sleep(120);
      await window.multiai.pasteInto(id);
      await sleep(600); // give the upload a moment before we check
    } catch (_) {}
    if (await confirmPreview(wv, base)) return true;
    // Alternate: a real CDP file drag-drop onto the composer.
    await dropImage(wv, a.input, image);
    if (await confirmPreview(wv, base)) return true;
  }
  return false;
}

// Attach the image to every enabled panel (Phase A), sequentially, verified.
async function distributeImage(sites, image) {
  try { await window.multiai.writeClipboardImage(image); } catch (_) {}
  const results = [];
  for (const site of sites) {
    let ok = false;
    try { ok = await attachImage(site, image); }
    catch (err) { console.warn('[Multi-AI]', site.key, 'attach failed:', err.message); }
    results.push({ name: site.name, ok });
    statusLine.textContent = 'attaching image… ' + results.map((r) => `${r.name} ${r.ok ? '✓' : '✗'}`).join(' · ');
  }
  return results;
}

// PHASE B — type the prompt into one panel and press send.
async function sendText(site, text, hasImage) {
  const wv = document.getElementById('wv-' + site.key);
  if (!wv) return;
  const a = adapter(site);
  await wv.executeJavaScript(
    buildInjection(a.input, a.send, text, {
      append: !!hasImage,
      submitDelay: hasImage ? 500 : 250,
      submitTries: hasImage ? 14 : 2,  // wait up to ~5.5s for the upload to finish
    }),
    true,
  );
}

// Send the current prompt + image to the given sites. TWO PHASES: attach the
// image to EVERY panel and verify it first, then send the text — so no chat is
// sent until the image is confirmed uploaded everywhere.
async function broadcast(sites) {
  const text = promptEl.value.trim();
  const image = pendingImage;
  if (!text && !image) return;

  if (text) {
    promptHistory = [text, ...promptHistory.filter((p) => p !== text)].slice(0, 50);
    store.set('promptHistory', promptHistory);
  }

  busy = true; // pause scroll-sync so it doesn't starve the attach/send
  try {
    // Phase A: image into all panels (verified) before any send.
    let imgResults = [];
    if (image) imgResults = await distributeImage(sites, image);

    // Phase B: now send the text.
    statusLine.textContent = 'sending…';
    for (const site of sites) {
      try { await sendText(site, text, !!image); }
      catch (err) { console.warn('[Multi-AI]', site.key, 'send failed:', err.message); }
    }

    if (image) {
      const failed = imgResults.filter((r) => !r.ok).map((r) => r.name);
      let msg = 'image: ' + imgResults.map((r) => `${r.name} ${r.ok ? '✓' : '✗'}`).join(' · ');
      if (failed.length) msg += ` — for ${failed.join(', ')}: click the panel & press ⌘V (image is on the clipboard)`;
      statusLine.textContent = msg;
    } else {
      statusLine.textContent = `sent to ${sites.length}/${sites.length}`;
    }
  } finally {
    busy = false;
  }
  promptEl.value = '';
  histIndex = -1;
  pendingImage = null;
  renderImage();
  promptEl.focus();
}

document.getElementById('sendBtn').addEventListener('click', () => broadcast(enabledSiteList()));

// Prompt history: ↑/↓ recall previous prompts when the caret is at the edge.
let histIndex = -1;
promptEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    broadcast(enabledSiteList());
    return;
  }
  if (e.key === 'ArrowUp' && promptEl.selectionStart === 0 && histIndex < promptHistory.length - 1) {
    histIndex++;
    promptEl.value = promptHistory[histIndex] || '';
    e.preventDefault();
  } else if (e.key === 'ArrowDown' && promptEl.selectionStart === promptEl.value.length && histIndex >= 0) {
    histIndex--;
    promptEl.value = histIndex >= 0 ? promptHistory[histIndex] : '';
    e.preventDefault();
  }
});

// ---- AI picker / settings modal ---------------------------------------------
const picker = document.getElementById('picker');
const pickerList = document.getElementById('pickerList');

function renderPickerList() {
  pickerList.innerHTML = '';
  for (const site of allSites()) {
    const row = document.createElement('label');
    row.className = 'picker-row';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = enabledSites.includes(site.key);
    cb.addEventListener('change', () => {
      enabledSites = cb.checked
        ? [...enabledSites, site.key]
        : enabledSites.filter((k) => k !== site.key);
      store.set('enabledSites', enabledSites);
      renderPanels();
    });
    const dot = `<span class="dot" style="background:${site.color || '#888'}"></span>`;
    const label = document.createElement('span');
    label.innerHTML = `${dot}<span class="pname">${site.name}</span>` +
      (site.flag ? ` <span class="flag" title="May resist embedding">⚠</span>` : '') +
      (site.custom ? ` <span class="picker-url">${site.url}</span>` : '');
    row.append(cb, label);

    if (site.custom) {
      const del = document.createElement('button');
      del.className = 'picker-del';
      del.textContent = '✕';
      del.title = 'Remove this AI';
      del.addEventListener('click', (e) => {
        e.preventDefault();
        customSites = customSites.filter((s) => s.key !== site.key);
        enabledSites = enabledSites.filter((k) => k !== site.key);
        store.set('customSites', customSites);
        store.set('enabledSites', enabledSites);
        renderPickerList();
        renderPanels();
      });
      row.appendChild(del);
    }
    pickerList.appendChild(row);
  }
}

function openPicker() { renderPickerList(); picker.classList.add('open'); }
function closePicker() { picker.classList.remove('open'); }
document.getElementById('pickerBtn').addEventListener('click', openPicker);
document.getElementById('pickerClose').addEventListener('click', closePicker);
picker.addEventListener('click', (e) => { if (e.target === picker) closePicker(); });

// Add your own AI by URL.
document.getElementById('addBtn').addEventListener('click', () => {
  const nameEl = document.getElementById('addName');
  const urlEl = document.getElementById('addUrl');
  const name = nameEl.value.trim();
  let url = urlEl.value.trim();
  if (!name || !url) return;
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url;

  let base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'ai';
  let key = base;
  let n = 2;
  while (siteByKey(key)) key = `${base}-${n++}`;

  const colors = ['#e0679a', '#57b6c2', '#c2a457', '#7d9be0', '#8fc257', '#c27a57'];
  customSites.push({ key, name, url, loginUrl: url, color: colors[customSites.length % colors.length], custom: true });
  enabledSites.push(key);
  store.set('customSites', customSites);
  store.set('enabledSites', enabledSites);
  nameEl.value = '';
  urlEl.value = '';
  renderPickerList();
  renderPanels();
});

// ---- "Import logins from browser" buttons -----------------------------------
const importStatus = document.getElementById('importStatus');
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
      enabledSiteList().forEach((s) => {
        const wv = document.getElementById('wv-' + s.key);
        if (wv) wv.reload();
      });
    }
    document.querySelectorAll('[data-import]').forEach((b) => (b.disabled = false));
  });
});

// ---- boot -------------------------------------------------------------------
applyView(localStorage.getItem('viewMode') || 'grid');
renderPanels();
