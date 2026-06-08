// ===========================================================================
//  Renderer — runs in the app window (not in the sites).
//  On "Send to all", it injects a small script into each <webview> that finds
//  the message box, types the text, and presses send.
//
//  ⚠️ Selectors differ per site and change over time. If one panel stops
//     receiving the message, fix that site's entry in ADAPTERS below.
// ===========================================================================

const ADAPTERS = {
  claude: {
    input: 'div[contenteditable="true"]',
    send: 'button[aria-label="Send message"], button[aria-label*="Send" i]',
    fileInput: 'input[type="file"]',
  },
  gemini: {
    input: 'div.ql-editor[contenteditable="true"], div[contenteditable="true"], textarea',
    send: 'button[aria-label*="Send" i], button.send-button',
    fileInput: 'input[type="file"]',
  },
  deepseek: {
    input: 'textarea#chat-input, textarea',
    send: 'div[role="button"][aria-disabled="false"], button[type="submit"]',
    fileInput: 'input[type="file"]',
  },
  qwen: {
    input: 'textarea, div[contenteditable="true"]',
    send: 'button[aria-label*="Send" i], button[type="submit"]',
    fileInput: 'input[type="file"]',
  },
};

// Build the self-contained script that runs INSIDE a panel's page.
// opts.append → add text after existing content (don't wipe a pasted image).
// opts.submitDelay → ms to wait before pressing send (longer when an image
// is uploading). opts.submit → whether to press send at all.
function buildInjection(inputSel, sendSel, text, opts = {}) {
  const append = !!opts.append;
  const submitDelay = opts.submitDelay != null ? opts.submitDelay : 250;
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
      setTimeout(function () {
        var btn = document.querySelector(sendSel);
        if (btn && !btn.disabled && btn.getAttribute('aria-disabled') !== 'true') btn.click();
        else pressEnter(input);
      }, ${submitDelay});
    }
    attempt(0);
  })();`;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const focusJS = (sel) =>
  `(function(){var el=document.querySelector(${JSON.stringify(sel)});if(el){el.focus();return true;}return false;})()`;

// Build a script that attaches an image to a site, INSIDE the page.
// Returns (resolves to) 'file' | 'paste' | null depending on what worked.
function buildImageInjection(fileInputSel, inputSel, dataURL) {
  return `(async function () {
    var dataURL = ${JSON.stringify(dataURL)};
    var fileInputSel = ${JSON.stringify(fileInputSel)};
    var inputSel = ${JSON.stringify(inputSel)};

    var blob = await (await fetch(dataURL)).blob();
    var file = new File([blob], 'image.png', { type: blob.type || 'image/png' });

    // Wait briefly for a file input to exist (sites hydrate slowly).
    function findFileInput() {
      return document.querySelector('input[type="file"][accept*="image" i]')
        || document.querySelector(fileInputSel)
        || document.querySelector('input[type="file"]');
    }

    // Primary: set the hidden <input type=file> (like a real file pick).
    for (var i = 0; i < 6; i++) {
      var fi = findFileInput();
      if (fi) {
        try {
          var dt = new DataTransfer();
          dt.items.add(file);
          fi.files = dt.files;
          fi.dispatchEvent(new Event('input', { bubbles: true }));
          fi.dispatchEvent(new Event('change', { bubbles: true }));
          return 'file';
        } catch (e) { /* fall through to paste */ }
      }
      await new Promise(function (r) { setTimeout(r, 400); });
    }

    // Secondary: dispatch a synthetic paste event on the message box.
    var input = document.querySelector(inputSel);
    if (input) {
      try {
        input.focus();
        var dt2 = new DataTransfer();
        dt2.items.add(file);
        var ev = new ClipboardEvent('paste', { bubbles: true, cancelable: true });
        try { Object.defineProperty(ev, 'clipboardData', { value: dt2 }); } catch (e) {}
        input.dispatchEvent(ev);
        return 'paste';
      } catch (e) { /* give up */ }
    }
    return null;
  })();`;
}

const statusLine = document.getElementById('statusLine');
const promptEl = document.getElementById('prompt');

// View toggle — grid (2×2) ⇄ mobile columns (|||| side by side).
const gridEl = document.getElementById('grid');
const viewToggle = document.getElementById('viewToggle');
function applyView(mode) {
  const columns = mode === 'columns';
  gridEl.classList.toggle('columns', columns);
  viewToggle.textContent = columns ? '▤ Columns' : '▥ Grid';
  try { localStorage.setItem('viewMode', mode); } catch (_) {}
}
viewToggle.addEventListener('click', () => {
  applyView(gridEl.classList.contains('columns') ? 'grid' : 'columns');
});
applyView(localStorage.getItem('viewMode') || 'grid');

// Reload buttons.
document.querySelectorAll('[data-reload]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const wv = document.getElementById('wv-' + btn.dataset.reload);
    if (wv) wv.reload();
  });
});

// "Log in" buttons — open a full login window, then reload the panel.
const LOGIN_URLS = {
  claude: 'https://claude.ai/login',
  gemini: 'https://gemini.google.com/app',
  deepseek: 'https://chat.deepseek.com/sign_in',
  qwen: 'https://chat.qwen.ai/',
};
document.querySelectorAll('[data-login]').forEach((btn) => {
  btn.addEventListener('click', async () => {
    const key = btn.dataset.login;
    const original = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Signing in…';
    try {
      await window.multiai.openLogin(key, LOGIN_URLS[key]);
    } catch (err) {
      console.warn('[Multi-AI] login window error:', err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = original;
      const wv = document.getElementById('wv-' + key);
      if (wv) wv.reload(); // pick up the new session
    }
  });
});

// "Import logins from browser" buttons.
const importStatus = document.getElementById('importStatus');
const SITE_LABELS = { claude: 'Claude', deepseek: 'DeepSeek', qwen: 'Qwen', gemini: 'Gemini' };

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
        ([site, n]) => `${SITE_LABELS[site]} ${n > 0 ? '✓' : '✗'}`,
      );
      const note = res.perSite.gemini === 0 ? '  ·  Gemini: use the Log in button' : '';
      const prof = res.profile ? ` [${res.profile}]` : '';
      importStatus.textContent = `Imported${prof} — ${parts.join('  ·  ')}${note}`;
      // Reload panels so they pick up the imported session.
      ['claude', 'gemini', 'deepseek', 'qwen'].forEach((k) => {
        const wv = document.getElementById('wv-' + k);
        if (wv) wv.reload();
      });
    }
    document.querySelectorAll('[data-import]').forEach((b) => (b.disabled = false));
  });
});

// ---- pasted image ----
let pendingImage = null; // data URL of the image to broadcast
const attachmentsEl = document.getElementById('attachments');

function renderImage() {
  attachmentsEl.innerHTML = '';
  if (!pendingImage) return;
  const chip = document.createElement('div');
  chip.className = 'chip';
  chip.innerHTML = `<img src="${pendingImage}" /> image`;
  const x = document.createElement('button');
  x.textContent = '✕';
  x.title = 'Remove image';
  x.addEventListener('click', () => { pendingImage = null; renderImage(); });
  chip.appendChild(x);
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
      reader.onload = () => { pendingImage = reader.result; renderImage(); };
      reader.readAsDataURL(file);
      e.preventDefault();
      return;
    }
  }
});

// Collapse a panel's header once it's usable (message box present ⇒ logged in)
// so the webview gets more vertical space. Header returns on hover (CSS).
async function refreshLoggedIn() {
  await Promise.all(
    Object.entries(ADAPTERS).map(async ([key, a]) => {
      const wv = document.getElementById('wv-' + key);
      const panel = wv && wv.closest('.panel');
      if (!panel) return;
      try {
        const ok = await wv.executeJavaScript(
          `!!document.querySelector(${JSON.stringify(a.input)})`,
          true,
        );
        panel.classList.toggle('logged-in', !!ok);
      } catch (_) {
        /* webview not ready yet — try again next tick */
      }
    }),
  );
}
document.querySelectorAll('webview').forEach((wv) => {
  wv.addEventListener('dom-ready', refreshLoggedIn);
});
setInterval(refreshLoggedIn, 3000);

async function sendAll() {
  const text = promptEl.value.trim();
  const hasImage = !!pendingImage;
  if (!text && !hasImage) return;
  statusLine.textContent = 'sending…';

  let delivered = 0;
  await Promise.all(
    Object.entries(ADAPTERS).map(async ([key, a]) => {
      const wv = document.getElementById('wv-' + key);
      if (!wv) return;
      try {
        if (hasImage) {
          // Attach the image via the site's file input (or synthetic paste).
          const method = await wv.executeJavaScript(
            buildImageInjection(a.fileInput, a.input, pendingImage),
            true,
          );
          if (!method) {
            // Last-resort fallback: OS clipboard + webview paste.
            try {
              await window.multiai.writeClipboardImage(pendingImage);
              await wv.executeJavaScript(focusJS(a.input), true);
              wv.paste();
            } catch (_) {}
          }
          await sleep(700); // let the upload begin
        }
        await wv.executeJavaScript(
          buildInjection(a.input, a.send, text, {
            append: hasImage,
            submitDelay: hasImage ? 2500 : 250, // wait for the upload to finish
          }),
          true,
        );
        delivered++;
      } catch (err) {
        console.warn('[Multi-AI]', key, 'failed:', err.message);
      }
    }),
  );

  statusLine.textContent = hasImage
    ? `sent to ${delivered}/4 · image is best-effort`
    : `sent to ${delivered}/4`;
  promptEl.value = '';
  pendingImage = null;
  renderImage();
  promptEl.focus();
}

document.getElementById('sendBtn').addEventListener('click', sendAll);
promptEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendAll();
  }
});
