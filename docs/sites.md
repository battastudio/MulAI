# Adding & managing AI sites

## The picker

**⚙ AIs** opens the picker. Tick any of the 19 built-ins to show/hide its panel. Order follows the order you enable them; drag a panel header in the grid to reorder (persisted). Default enabled: Claude · Gemini · DeepSeek · Qwen.

A **⚠** marks sites that often resist embedding (bot detection, e.g. ChatGPT, Grok). They may challenge automation — complete any check right inside the panel.

## Add your own

At the bottom of the picker: enter a **Name** and **URL**, click **Add your own**. It appears in the list and as a panel immediately, using the generic default selectors.

## Advanced: teach a custom site its selectors

Most sites work with the defaults (`div[contenteditable="true"], textarea` for input; a Send/submit button). When they don't, click the **⚙** next to the add form to reveal:

| Field | What it is |
|---|---|
| **Input selector** | CSS selector for the message box |
| **Send-button selector** | CSS selector for the send button |
| **File-input selector** | CSS selector for the hidden `<input type=file>` (image upload) |
| **Image mode** | `paste` or `file` — how the site accepts images |

How to find a selector: right-click the message box → **Inspect** → pick a stable attribute (id, `data-*`, `aria-label`) and copy a matching selector. Use **✎** on a custom row to edit it later; **✕** removes it.

## Built-in sites

Built-ins live in [`renderer/catalog.js`](../renderer/catalog.js) — one object each. Adding a provider there is a one-line contribution; only override selectors when the defaults miss.
