# Tools

Everything here is built into the top bar and the command palette. Nothing leaves your machine.

## 📢 Broadcast

Type in the composer and press **Enter** (or **Send to all**) — the prompt is injected into every enabled panel and sent. Each panel header also has a **➤** to send to just that one. `Shift+Enter` inserts a newline; `↑`/`↓` recall previous prompts when the caret is at the edge of the box.

## 🖼️ Image paste

Paste an image anywhere in the window (`⌘/Ctrl+V`). With **Paste-all** on (default), it's uploaded into every panel immediately and verified before your next send. If a site refuses the upload, the image is left on your clipboard — click that panel and press `⌘V` manually.

## 📚 Prompt library

Open with **📚 Prompts**. **Save current prompt** stores whatever is in the composer (named by its first line). Click a saved prompt to load it back; **✕** deletes it. Stored in `localStorage`.

## ⬇️ Export / compare

**⬇ Export** scrapes each panel's latest answer and downloads a single Markdown file — your prompt on top, one `##` section per AI — so you can diff answers side by side. Answer-scraping is a heuristic across differing chat DOMs; if a site drifts, tighten its selector in `renderer/catalog.js`.

## ⌘ Command palette

`⌘/Ctrl+K` opens a searchable list of every action (send, export, toggles, open any modal, import logins, focus a specific panel). `↑`/`↓` to move, `Enter` to run, `Esc` to close.

## ⚙️ Settings

One home for preferences: default view (grid/columns), theme, paste-all, scroll-sync, and a **User-Agent override** (blank = the built-in clean Chrome UA). **Reset to defaults** restores everything. The top-bar toggles stay as quick access and mirror these.

## Keyboard shortcuts

Press **?** (or the **?** button) for the full list: `Enter` send · `Shift+Enter` newline · `↑/↓` history · `⌘/Ctrl+K` palette · `Esc` close · drag a panel header to reorder · double-click to maximize.
