// Bridge between the app window (renderer) and the main process.
// Exposes a tiny, safe API for opening a dedicated login window.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('multiai', {
  // Opens the site in a full login window (shared session) and resolves
  // when that window is closed — so the panel can reload, now logged in.
  openLogin: (key, url) => ipcRenderer.invoke('open-login', { key, url }),

  // Copies auth cookies from the system browser into the app session.
  importCookies: (browser) => ipcRenderer.invoke('import-cookies', { browser }),

  // Puts a pasted image on the OS clipboard so panels can paste it in.
  writeClipboardImage: (dataURL) => ipcRenderer.invoke('clipboard-image', { dataURL }),

  // Focuses a specific webview's contents (before we focus the composer element).
  focusContents: (webContentsId) => ipcRenderer.invoke('focus-contents', webContentsId),

  // Pastes the OS clipboard into a specific webview's contents (paste only).
  pasteInto: (webContentsId) => ipcRenderer.invoke('paste-into', webContentsId),

  // Simulates a real file drag-and-drop of an image onto a panel at (x, y).
  dropImage: (webContentsId, dataURL, x, y) =>
    ipcRenderer.invoke('drop-image', { id: webContentsId, dataURL, x, y }),
});
