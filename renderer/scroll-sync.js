// ===========================================================================
//  renderer/scroll-sync.js — optional "scroll all panels together" (off by
//  default). Owns its toolbar button too, since the toggle and the polling loop
//  are one feature.
//  ponytail: heuristic — hooks the biggest overflowing element per page and
//  mirrors the most-recently-scrolled panel's ratio to the others. Fragile for
//  virtualized chat lists; a best-effort convenience behind a toggle.
// ===========================================================================

(function () { /* MAI-IIFE */
const { store, state, enabledSiteList, el } = window.MAI;

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

setInterval(async () => {
  if (!state.syncScroll || state.busy) return;   // don't compete with an attach/send
  const sites = enabledSiteList();
  if (sites.length < 2) return;
  const reads = await Promise.all(sites.map(async (s) => {
    const wv = el('wv-' + s.key);
    if (!wv) return null;
    try { return { key: s.key, ...(await wv.executeJavaScript('({r:window.__mai_ratio,at:window.__mai_at||0})', true)) }; }
    catch (_) { return null; }
  }));
  const valid = reads.filter((r) => r && typeof r.r === 'number');
  const master = valid.sort((a, b) => b.at - a.at)[0];
  if (!master || master.at <= state.lastMasterAt) return;
  state.lastMasterAt = master.at;
  for (const s of sites) {
    if (s.key === master.key) continue;
    const wv = el('wv-' + s.key);
    if (!wv) continue;
    try {
      await wv.executeJavaScript(
        `(function(r){window.__mai_mute=Date.now()+300;var el=window.__mai_el||document.scrollingElement;` +
        `if(el){var d=el.scrollHeight-el.clientHeight;if(d>0)el.scrollTop=r*d;}})(${master.r})`, true);
    } catch (_) {}
  }
}, 150);

const syncToggle = el('syncToggle');
function applySync(on) {
  state.syncScroll = on;
  syncToggle.classList.toggle('on', on);
  syncToggle.textContent = on ? '⇅ Sync on' : '⇅ Sync';
  store.set('syncScroll', on);
  if (on) enabledSiteList().forEach((s) => {
    const wv = el('wv-' + s.key);
    if (wv) injectScrollHook(wv);
  });
}
syncToggle.addEventListener('click', () => applySync(!state.syncScroll));
applySync(state.syncScroll);

Object.assign(window.MAI, { injectScrollHook, applySync });
})();
