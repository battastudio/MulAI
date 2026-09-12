// ===========================================================================
//  renderer/image.js — the pasted-image pipeline: capture a paste anywhere in
//  the window, show a chip, and (Phase A of a send) attach + verify the image in
//  every panel before any text goes out.
// ===========================================================================

(function () { /* MAI-IIFE */
const { state, adapter, enabledSiteList, focusJS, sleep, countPreviews, confirmPreview, dropImage, el, dom } = window.MAI;

function renderImage() {
  dom.attachments.innerHTML = '';
  if (!state.pendingImage) return;
  const chip = document.createElement('div');
  chip.className = 'chip';
  chip.innerHTML = `<img src="${state.pendingImage}" /> image`;
  const copy = document.createElement('button');
  copy.textContent = '📋';
  copy.title = 'Copy image to clipboard (then click a panel and press ⌘V)';
  copy.addEventListener('click', async () => {
    try { await window.multiai.writeClipboardImage(state.pendingImage); dom.status.textContent = 'image copied — click a panel and press ⌘V'; } catch (_) {}
  });
  const x = document.createElement('button');
  x.textContent = '✕';
  x.title = 'Remove image';
  x.addEventListener('click', () => { state.pendingImage = null; renderImage(); });
  chip.append(copy, x);
  dom.attachments.appendChild(chip);
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
        state.pendingImage = reader.result;
        renderImage();
        // Paste-all: upload the image into every panel now (verified), so it's
        // already there when the user types and sends.
        if (state.pasteAll) {
          state.busy = true;
          try { await distributeImage(enabledSiteList(), state.pendingImage); }
          finally { state.busy = false; }
        }
      };
      reader.readAsDataURL(file);
      e.preventDefault();
      return;
    }
  }
});

// PHASE A — attach the image to one panel, replicating the manual ⌘V the user
// confirmed works: real focus → paste → verify a preview appeared → retry.
// Returns true only once a preview is actually confirmed in that composer.
async function attachImage(site, image) {
  const wv = el('wv-' + site.key);
  if (!wv) return false;
  const a = adapter(site);
  const base = await countPreviews(wv);
  if (base > 0) return true;                 // already attached (e.g. live-distributed)
  const id = wv.getWebContentsId();
  for (let r = 0; r < 3; r++) {
    // Trusted paste into this exact panel. Order matters: focus the webContents
    // FIRST, then the composer, then paste — else focusing the contents blurs
    // the composer and the paste lands nowhere.
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
    dom.status.textContent = 'attaching image… ' + results.map((r) => `${r.name} ${r.ok ? '✓' : '✗'}`).join(' · ');
  }
  return results;
}

Object.assign(window.MAI, { renderImage, attachImage, distributeImage });
})();
