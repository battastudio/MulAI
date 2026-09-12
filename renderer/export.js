// ===========================================================================
//  renderer/export.js — grab each panel's latest answer and save one Markdown
//  file (prompt at top, a section per AI). Doubles as a side-by-side compare.
//  ponytail: heuristic answer-scrape — tries common assistant-message
//  selectors, else the longest text block on the page. Chat DOMs vary, so this
//  is best-effort; upgrade with per-site selectors in CATALOG if a site drifts.
// ===========================================================================

(function () { /* MAI-IIFE */
const { state, enabledSiteList, el, dom } = window.MAI;

const SCRAPE = `(function(){
  var sels = [
    '[data-message-author-role="assistant"]',
    '.assistant, .model-response, .response-content, [class*="assistant" i]',
    '[class*="markdown" i]'
  ];
  for (var i=0;i<sels.length;i++){
    var nodes = document.querySelectorAll(sels[i]);
    if (nodes.length){ var t=(nodes[nodes.length-1].innerText||'').trim(); if (t) return t; }
  }
  // Fallback: the longest visible text block.
  var best='', all=document.querySelectorAll('article,section,div,p');
  for (var j=0;j<all.length;j++){ var s=(all[j].innerText||'').trim(); if (s.length>best.length && s.length<8000) best=s; }
  return best;
})()`;

async function collect() {
  const out = [];
  for (const site of enabledSiteList()) {
    const wv = el('wv-' + site.key);
    let text = '';
    if (wv) { try { text = await wv.executeJavaScript(SCRAPE, true); } catch (_) {} }
    out.push({ name: site.name, text: (text || '_(no answer captured)_').trim() });
  }
  return out;
}

function toMarkdown(prompt, answers) {
  const lines = ['# Multi-AI export', ''];
  if (prompt) lines.push('## Prompt', '', '> ' + prompt.replace(/\n/g, '\n> '), '');
  for (const a of answers) lines.push(`## ${a.name}`, '', a.text, '');
  return lines.join('\n');
}

function download(md) {
  const blob = new Blob([md], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'multi-ai-export.md';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function exportAll() {
  dom.status.textContent = 'collecting answers…';
  const answers = await collect();
  const lastPrompt = state.promptHistory[0] || '';
  download(toMarkdown(lastPrompt, answers));
  dom.status.textContent = `exported ${answers.length} answer(s) → multi-ai-export.md`;
}

el('exportBtn').addEventListener('click', exportAll);

Object.assign(window.MAI, { exportAll });
})();
