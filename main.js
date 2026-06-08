// ===========================================================================
//  Multi-AI desktop — main process.
//  - Creates the window with the 4 embedded site panels.
//  - Opens a dedicated, full-size login window on request (shares the same
//    persistent session, so logging in there logs in the panel too).
//  - Lets panels/login windows open OAuth pop-ups (Google sign-in etc).
// ===========================================================================

const { app, BrowserWindow, ipcMain, clipboard, nativeImage } = require('electron');
const path = require('node:path');
const { importCookies } = require('./cookie-import');

// A clean Chrome user-agent (no "Electron") — needed so Google doesn't block
// sign-in, and to look like a normal browser to Cloudflare.
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

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
