// ===========================================================================
//  renderer/catalog.js — the AI site registry + the helpers that read it.
//  Adding a provider = append one object here. Only override selectors when the
//  generic DEFAULT_* in core.js don't hit the right element (rule 10).
//    key, name, url, loginUrl, color  — required-ish
//    input, send, fileInput, attachSel — selector overrides (optional)
//    imageMode: 'paste' | 'file'       — how the site accepts images
//    flag: '<reason>'                  — marks sites likely to resist embedding
//    models: [{name, match}]           — optional per-site control shortcuts
// ===========================================================================

(function () { /* MAI-IIFE */
const { DEFAULT_INPUT, DEFAULT_SEND, DEFAULT_FILE, store, state } = window.MAI;

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
  { key: 'doubao',     name: 'Doubao',     url: 'https://www.doubao.com/chat/',     loginUrl: 'https://www.doubao.com/chat/',       color: '#3b6cff', imageMode: 'file' },
  { key: 'groq',       name: 'Groq',       url: 'https://chat.groq.com/',           loginUrl: 'https://chat.groq.com/',             color: '#f55036' },
  { key: 'huggingchat',name: 'HuggingChat',url: 'https://huggingface.co/chat/',     loginUrl: 'https://huggingface.co/chat/',       color: '#ffcc4d' },
  { key: 'character',  name: 'Character.AI',url: 'https://character.ai/',           loginUrl: 'https://character.ai/',              color: '#4a6cf7', flag: 'bot detection' },
  { key: 'lmarena',    name: 'LMArena',    url: 'https://lmarena.ai/',              loginUrl: 'https://lmarena.ai/',                color: '#22c55e' },
];

// CATALOG + user-added sites, de-duplicated by key.
const allSites = () => {
  const seen = new Set();
  return [...CATALOG, ...state.customSites].filter((s) => !seen.has(s.key) && seen.add(s.key));
};
const siteByKey = (k) => allSites().find((s) => s.key === k);
const enabledSiteList = () => state.enabledSites.map(siteByKey).filter(Boolean);
const adapter = (s) => ({
  input: s.input || DEFAULT_INPUT,
  send: s.send || DEFAULT_SEND,
  fileInput: s.fileInput || DEFAULT_FILE,
  attachSel: s.attachSel || '',
});

// Reorder enabledSites so `fromKey` lands just before `toKey`, then re-render.
function moveSite(fromKey, toKey) {
  if (!fromKey || fromKey === toKey) return;
  const rest = state.enabledSites.filter((k) => k !== fromKey);
  const at = rest.indexOf(toKey);
  if (at < 0) return;
  rest.splice(at, 0, fromKey);
  state.enabledSites = rest;
  store.set('enabledSites', state.enabledSites);
  MAI.renderPanels();
}

Object.assign(window.MAI, { CATALOG, allSites, siteByKey, enabledSiteList, adapter, moveSite });
})();
