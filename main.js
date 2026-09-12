// ===========================================================================
//  Multi-AI desktop — main process.
//  - Creates the window with the 4 embedded site panels.
//  - Opens a dedicated, full-size login window on request (shares the same
//    persistent session, so logging in there logs in the panel too).
//  - Lets panels/login windows open OAuth pop-ups (Google sign-in etc).
// ===========================================================================

const { app, BrowserWindow, ipcMain, clipboard, nativeImage, webContents } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { importCookies } = require('./cookies');
const { UA } = require('./constants');

function allowPopups(contents) {
  contents.setWindowOpenHandler(() => ({
    action: 'allow',
    overrideBrowserWindowOptions: {
      webPreferences: { partition: 'persist:multiai' },
    },
  }));
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    backgroundColor: '#0f1115',
    title: 'Multi-AI',
    webPreferences: {
      webviewTag: true,
      preload: path.join(__dirname, 'preload.js'),
      sandbox: false, // preload requires ./constants (a local module)
    },
  });
  win.loadFile('index.html');
}

// Open a real, full-size login window for one site, sharing the app session.
// Resolves when the window is closed so the panel can reload (now logged in).
ipcMain.handle('open-login', (_event, { key, url }) => {
  return new Promise((resolve) => {
    const w = new BrowserWindow({
      width: 520,
      height: 760,
      title: 'Sign in',
      backgroundColor: '#ffffff',
      webPreferences: { partition: 'persist:multiai' },
    });
    w.webContents.setUserAgent(UA);
    allowPopups(w.webContents);
    w.loadURL(url, { userAgent: UA });
    w.on('closed', () => resolve(key));
  });
});

// Put an image (data URL) onto the OS clipboard, so each panel can paste it.
ipcMain.handle('clipboard-image', (_event, { dataURL }) => {
  const img = nativeImage.createFromDataURL(dataURL);
  clipboard.writeImage(img);
  return { ok: !img.isEmpty() };
});

// Focus a specific webview's contents (used BEFORE focusing the composer element,
// so the composer stays the active element when we paste).
ipcMain.handle('focus-contents', (_event, id) => {
  const c = webContents.fromId(id);
  if (c) c.focus();
  return { ok: !!c };
});

// Paste the OS clipboard into a specific webview's contents. Paste ONLY — focus
// is arranged beforehand (focus-contents, then the composer) so calling focus()
// here would blur the composer back to the page body.
ipcMain.handle('paste-into', (_event, id) => {
  const c = webContents.fromId(id);
  if (c) c.paste();
  return { ok: !!c };
});

// Simulate a REAL file drag-and-drop of an image onto a panel's composer, via the
// Chrome DevTools Protocol. This is the one gesture every chat site accepts, it's
// trusted (indistinguishable from a user drop), and it targets this exact
// webContents — so it's immune to the focus races that plagued paste/file-input.
ipcMain.handle('drop-image', async (_event, { id, dataURL, x, y }) => {
  const c = webContents.fromId(id);
  const m = /^data:(.+?);base64,(.*)$/.exec(dataURL || '');
  if (!c || !m) return { ok: false };
  const filePath = path.join(os.tmpdir(), `multiai-drop-${id}.png`);
  try {
    fs.writeFileSync(filePath, Buffer.from(m[2], 'base64'));
  } catch (err) {
    return { ok: false, error: err.message };
  }
  const data = { items: [], files: [filePath], dragOperationsMask: 1 };
  const dbg = c.debugger;
  try {
    try { dbg.attach('1.3'); } catch (_) { /* already attached */ }
    for (const type of ['dragEnter', 'dragOver', 'drop']) {
      await dbg.sendCommand('Input.dispatchDragEvent', { type, x, y, data });
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  } finally {
    try { dbg.detach(); } catch (_) {}
  }
});

// Copy logins from the system browser (Edge/Chrome) into the app session.
ipcMain.handle('import-cookies', async (_event, { browser }) => {
  try {
    const result = await importCookies(browser);
    return { ok: true, ...result };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

// Apply the clean Chrome UA to EVERY web-contents (main window, webviews, and
// — crucially — sign-in pop-ups) the moment it's created, before it navigates.
// Pop-ups don't inherit the parent's UA, so without this the default "Electron"
// UA leaks on Google's account chooser and sign-in is blocked.
app.on('web-contents-created', (_event, contents) => {
  contents.setMaxListeners(50); // our polling adds transient did-stop-loading listeners
  contents.setUserAgent(UA);
  allowPopups(contents);
});

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
