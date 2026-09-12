// ===========================================================================
//  renderer/broadcast.js — "send to all" in TWO PHASES: attach the image to
//  every panel and verify it (Phase A, in image.js), THEN type + send the text
//  (Phase B) — so no chat fires before the image is confirmed uploaded.
// ===========================================================================

(function () { /* MAI-IIFE */
const { state, store, adapter, enabledSiteList, buildInjection, distributeImage, renderImage, el, dom } = window.MAI;

// PHASE B — type the prompt into one panel and press send.
async function sendText(site, text, hasImage) {
  const wv = el('wv-' + site.key);
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

async function broadcast(sites) {
  const text = dom.prompt.value.trim();
  const image = state.pendingImage;
  if (!text && !image) return;

  if (text) {
    state.promptHistory = [text, ...state.promptHistory.filter((p) => p !== text)].slice(0, 50);
    store.set('promptHistory', state.promptHistory);
  }

  state.busy = true; // pause scroll-sync so it doesn't starve the attach/send
  try {
    let imgResults = [];
    if (image) imgResults = await distributeImage(sites, image);   // Phase A

    dom.status.textContent = 'sending…';
    for (const site of sites) {                                    // Phase B
      try { await sendText(site, text, !!image); }
      catch (err) { console.warn('[Multi-AI]', site.key, 'send failed:', err.message); }
    }

    if (image) {
      const failed = imgResults.filter((r) => !r.ok).map((r) => r.name);
      let msg = 'image: ' + imgResults.map((r) => `${r.name} ${r.ok ? '✓' : '✗'}`).join(' · ');
      if (failed.length) msg += ` — for ${failed.join(', ')}: click the panel & press ⌘V (image is on the clipboard)`;
      dom.status.textContent = msg;
    } else {
      dom.status.textContent = `sent to ${sites.length}/${sites.length}`;
    }
  } finally {
    state.busy = false;
  }
  dom.prompt.value = '';
  state.histIndex = -1;
  state.pendingImage = null;
  renderImage();
  dom.prompt.focus();
}

Object.assign(window.MAI, { sendText, broadcast });
})();
