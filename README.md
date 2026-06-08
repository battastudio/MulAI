# Multi-AI desktop app

One window with **Claude, Gemini, DeepSeek, and Qwen** side by side. Type a message once and
it's sent to all four. No API keys — each panel is a real embedded browser, so you just log
in normally and watch every answer render in place.

## Run it (on your Mac)

```sh
cd desktop
npm install      # downloads Electron (~one-time, ~150 MB)
npm start        # opens the Multi-AI window
```

## First use
1. The window shows four panels. Click the blue **Log in** button on a panel to open a
   **full-size login window** for that site. Sign in there (this also fixes Google/Gemini
   sign-in, which the small panel can block). Close the window when done — the panel reloads,
   now logged in. Sessions are saved and persist after that, so it's a one-time step.
   - You can also just log in directly inside the panel if it lets you.
2. If a panel shows a Cloudflare check, complete it **inside the panel** — it's a real browser.
3. Type a message in the box at the bottom and press **Enter** (or click **Send to all**).
   It types into every panel and presses send; the answers appear in each panel.

### Pasting an image
Copy an image (or take a screenshot) and press **Cmd+V** in the app — a thumbnail appears
above the box. On **Send to all**, the app attaches the image to each panel by setting the
site's file-upload input (same as picking a file), falling back to a synthetic paste, then
adds your text and presses send (after a ~2.5s wait so the upload finishes).

This is **best-effort, per site**:
- Works where the site has an image upload input or accepts image paste (Claude, Gemini, Qwen
  are good candidates).
- **DeepSeek's web chat may not accept images at all** — that panel just sends the text.
- If a panel doesn't attach the image, fix its `fileInput` selector in `renderer.js` →
  `ADAPTERS` (right-click the site's attach button → Inspect to find the `<input type=file>`).

> Note on "log in via Edge and come back": that VSCode-style flow only works for apps the
> service gives an official OAuth login to. These sites don't, and a web login is a cookie
> tied to the browser it happened in — so an external Edge login can't transfer here. The
> in-app **Log in** window is the equivalent that actually works, because it shares this
> app's saved session.

## Import logins from your browser (optional)
If you're already signed in to these sites in **Edge** or **Chrome**, the top bar's
**Import logins from: [Edge] [Chrome]** buttons can copy those sessions into the app so you
don't retype passwords.

- You'll get a one-time **macOS Keychain prompt** ("…wants to use the Edge/Chrome key") —
  click **Allow** (or Always Allow). That's needed to decrypt the browser's cookies.
- The app picks the browser **profile** that has the most of these sites logged in and shows
  which one it used, e.g. `Imported [Profile 1] — Claude ✓ · DeepSeek ✓ · Qwen ✓ · Gemini ✗`.
- **Gemini won't import** — Google binds its session to the original browser/device, so use
  the panel's **Log in** button for Gemini.
- A site may still re-show a Cloudflare check; complete it in the panel.

This is the same mechanism `yt-dlp --cookies-from-browser` uses — your own cookies, your own
accounts, on your own Mac.

## Why a desktop app (and not a webpage)
Web pages can't embed these sites — Cloudflare's bot check and the sites' anti-embedding
rules block iframes. A desktop app uses real Chromium browser views, which pass those checks
and keep your login, so all four can live in one window.

## Things to know
- **Fragile:** sites change their layouts. If a panel stops receiving the message, update its
  selectors in `renderer.js` → `ADAPTERS` (see below), then restart (`npm start`).
- **Login + occasional challenges** happen inside the panels; that's expected.
- **Personal use:** automating these sites may conflict with their Terms of Service.

## Fixing a panel that stopped sending
Open `renderer.js`, find the site in `ADAPTERS`, and update:
- `input` → a CSS selector that matches the message text box
- `send` → a CSS selector that matches the send button

To find them: in the running app, right-click the message box → **Inspect Element**, read the
element's tag / `aria-label` / id, and put a matching selector in. Restart the app.
