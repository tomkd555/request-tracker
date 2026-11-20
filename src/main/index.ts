import { app, dialog, shell, BrowserWindow } from "electron";
import { join } from "path";
import { electronApp, optimizer, is } from "@electron-toolkit/utils";
import { registerIpc } from "./ipc";

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.on("ready-to-show", () => {
    mainWindow.show();
  });

  // Links in colleagues' Markdown open in the browser or the mail program; the app window itself never leaves its own document.
  const openExternally = (url: string): void => {
    let protocol = "";
    try {
      protocol = new URL(url).protocol;
    } catch {
      return;
    }
    if (protocol === "http:" || protocol === "https:" || protocol === "mailto:") shell.openExternal(url).catch((e: unknown) => console.error(`main: link not opened: ${url}`, e));
  };
  mainWindow.webContents.setWindowOpenHandler((details) => {
    openExternally(details.url);
    return { action: "deny" };
  });
  mainWindow.webContents.on("will-navigate", (event) => {
    if (event.url !== mainWindow.webContents.getURL()) {
      event.preventDefault();
      openExternally(event.url);
    }
  });

  // A screen with unsaved edits cancels beforeunload (useNavigationGuard); Electron asks nothing by itself, so the question is put here, in the renderer's own wording.
  mainWindow.webContents.on("will-prevent-unload", (event) => {
    const choice = dialog.showMessageBoxSync(mainWindow, { type: "question", message: "編集内容を破棄しますか", buttons: ["破棄する", "キャンセル"], defaultId: 1, cancelId: 1, noLink: true });
    if (choice === 0) event.preventDefault(); // overrides the page's cancel, so the window closes
  });

  const devUrl = is.dev ? process.env["ELECTRON_RENDERER_URL"] : undefined;
  (devUrl ? mainWindow.loadURL(devUrl) : mainWindow.loadFile(join(__dirname, "../renderer/index.html"))).catch((e: unknown) => console.error("main: page not loaded", e));
}

// A second launch on the same user data would run with a local storage of its own, cut off from the first window's: it hands over to the first window and quits.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    const [window] = BrowserWindow.getAllWindows();
    if (!window) return;
    if (window.isMinimized()) window.restore();
    window.focus();
  });

  app.whenReady().then(() => {
    electronApp.setAppUserModelId("jp.tomkd.request-tracker");
    void registerIpc().warm(); // the share is read while the window boots

    app.on("browser-window-created", (_, window) => {
      optimizer.watchWindowShortcuts(window);
    });

    createWindow();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });
}

app.on("window-all-closed", () => {
  app.quit();
});
