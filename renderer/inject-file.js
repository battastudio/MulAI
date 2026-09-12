// ===========================================================================
//  renderer/inject-file.js — image attachment: set the site's hidden file input
//  (focus-independent), the CDP drag-drop fallback, and the preview counter used
//  ONLY to verify an image landed (never to trigger a second attach → doubles).
// ===========================================================================

(function () { /* MAI-IIFE */
const { sleep } = window.MAI;

// Attach via the site's own hidden <input type=file>. Returns 'file' if the file
// was actually set, else 'none'. Does exactly ONE thing (no synthetic paste, no
// preview polling) — stacking two methods is what caused double-attach.
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
// CDP in the main process). Universal + trusted; the drop point is the composer
// center from the input element's rect inside the guest.
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

Object.assign(window.MAI, { buildFileInjection, dropImage, countPreviews, confirmPreview });
})();
