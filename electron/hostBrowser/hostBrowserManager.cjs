"use strict";

const path = require("node:path");
const fs = require("node:fs");
const { createHash, randomUUID } = require("node:crypto");
const { createBookmarkStore } = require("./bookmarkStore.cjs");
const { createDownloadStore } = require("./downloadStore.cjs");
const { createSiteIconStore, iconOrigin, validImageDataUrl } = require("./siteIconStore.cjs");
const { windowsFramelessContentChromeOptions } = require("../bridges/windowManager/windowsWindowChrome.cjs");

const DEAD_PROXY = "socks5://127.0.0.1:9";
const CHROME_HEIGHT = 80;
const MAX_TABS = 32;
const DOWNLOAD_PANEL_WIDTH = 372;
const ALLOWED_PAGE_SCHEMES = new Set(["http:", "https:", "ws:", "wss:", "blob:", "data:"]);
const THEME_TOKEN_NAMES = ["background", "foreground", "secondary", "muted", "muted-foreground", "border", "primary", "primary-foreground"];

function validThemeTokens(input) {
  const result = {};
  for (const name of THEME_TOKEN_NAMES) {
    const value = input?.[name];
    if (typeof value === "string" && /^\s*\d+(\.\d+)?\s+\d+(\.\d+)?%\s+\d+(\.\d+)?%\s*$/.test(value)) result[name] = value.trim();
  }
  return result;
}

function imageMime(bytes) {
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return "image/png";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 6 && ["GIF87a", "GIF89a"].includes(bytes.subarray(0, 6).toString())) return "image/gif";
  if (bytes.length >= 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  if (bytes.length >= 4 && bytes[0] === 0 && bytes[1] === 0 && bytes[2] === 1 && bytes[3] === 0) return "image/x-icon";
  return null;
}

async function fetchPageIcon(pageSession, url) {
  if (validImageDataUrl(url)) return url;
  const parsed = new URL(url);
  if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await pageSession.fetch(parsed.href, { signal: controller.signal });
    if (!response.ok || !response.body) return null;
    const reader = response.body.getReader();
    const chunks = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 64 * 1024) { await reader.cancel(); return null; }
      chunks.push(Buffer.from(value));
    }
    const bytes = Buffer.concat(chunks);
    const mime = imageMime(bytes);
    return mime ? `data:${mime};base64,${bytes.toString("base64")}` : null;
  } catch { return null; }
  finally { clearTimeout(timer); }
}

function normalizeBrowserUrl(input) {
  const raw = String(input || "").trim();
  if (!raw || raw.length > 2048) throw new Error("Enter a valid web address");
  const isLocal = /^(localhost|127\.\d+\.\d+\.\d+|\[[0-9a-f:]+\])(?::\d+)?(?:\/|$)/i.test(raw);
  const candidate = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `${isLocal ? "http" : "https"}://${raw}`;
  const url = new URL(candidate);
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("Only HTTP and HTTPS pages can open here");
  if (!url.hostname || url.username || url.password) throw new Error("Enter a valid web address without credentials");
  return url.href;
}

function createHostBrowserManager({ electron, app, portForwardingBridge }) {
  const { BrowserWindow, WebContentsView, session, ipcMain, shell } = electron;
  const windows = new Map();
  const byChromeId = new Map();
  const byDownloadsId = new Map();
  const siteIconStore = createSiteIconStore(app);
  const downloadStore = createDownloadStore(app);
  const bookmarkStore = createBookmarkStore(app, () => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed() && !win.webContents.isDestroyed()) {
        win.webContents.send("netcatty:host-browser:bookmarks-changed");
      }
    }
  });
  const send = (record) => {
    if (record.win.isDestroyed() || record.win.webContents.isDestroyed()) return;
    record.win.webContents.send("netcatty:host-browser:state", snapshot(record));
  };
  const notifyDownloads = (record) => {
    if (record.win.isDestroyed()) return;
    const downloads = downloadStore.list(record.hostId);
    if (record.downloadsPanelOpen) positionDownloadsView(record);
    record.win.webContents.send("netcatty:host-browser:downloads-changed", downloads);
    if (record.downloadsView && !record.downloadsView.webContents.isDestroyed()) {
      record.downloadsView.webContents.send("netcatty:host-browser:downloads-changed", downloads);
    }
  };
  const snapshot = (record) => ({
    hostId: record.hostId,
    label: record.label,
    theme: record.theme,
    themeTokens: record.themeTokens,
    platform: process.platform,
    isMaximized: record.win.isMaximized(),
    downloadsPanelOpen: record.downloadsPanelOpen,
    route: record.route,
    error: record.error,
    activeTabId: record.activeTabId,
    tabs: [...record.tabs.values()].map(({ id, url, title, loading, canGoBack, canGoForward }) => {
      const icon = siteIconStore.get(record.hostId, url);
      return { id, url, title, loading, canGoBack, canGoForward,
        iconDataUrl: icon?.dataUrl || null, iconGlyph: icon?.glyph || null, iconColor: icon?.color || null };
    }),
  });
  const notifySiteIcon = (record) => {
    send(record);
    if (!record.win.isDestroyed()) record.win.webContents.send("netcatty:host-browser:site-icons-changed");
  };
  const updateFavicon = async (record, tab, urls) => {
    if (!tab.url || record.route !== "connected") return;
    const origin = iconOrigin(tab.url);
    if (!origin || siteIconStore.get(record.hostId, tab.url)?.mode === "custom") return;
    const generation = record.routeGeneration;
    for (const url of urls) {
      let dataUrl = null;
      try { dataUrl = await fetchPageIcon(record.pageSession, url); } catch {}
      if (!dataUrl) continue;
      if (record.route !== "connected" || record.routeGeneration !== generation || iconOrigin(tab.url) !== origin) return;
      siteIconStore.set(record.hostId, tab.url, { mode: "auto", dataUrl, glyph: "", color: "#247969" });
      notifySiteIcon(record);
      return;
    }
  };
  const activeView = (record) => record.tabs.get(record.activeTabId)?.view;
  const positionDownloadsView = (record) => {
    if (!record.downloadsView || record.win.isDestroyed()) return;
    const [width, height] = record.win.getContentSize();
    const downloads = downloadStore.list(record.hostId);
    const rowsHeight = Math.min(348, downloads.length * 66 + 8);
    const panelHeight = downloads.length
      ? 72 + rowsHeight + (downloads.some((item) => !["waiting", "progressing"].includes(item.status)) ? 38 : 0)
      : 230;
    record.downloadsView.setBounds({
      x: Math.max(0, width - DOWNLOAD_PANEL_WIDTH - 8), y: CHROME_HEIGHT,
      width: Math.min(DOWNLOAD_PANEL_WIDTH, width), height: Math.min(panelHeight, Math.max(1, height - CHROME_HEIGHT)),
    });
  };
  const closeDownloadsPanel = (record) => {
    if (!record.downloadsPanelOpen) return;
    record.downloadsPanelOpen = false;
    try { record.win.contentView.removeChildView(record.downloadsView); } catch {}
    send(record);
  };
  const setDownloadsPanel = async (record, open) => {
    if (!open) { closeDownloadsPanel(record); return; }
    if (!record.downloadsView) {
      const view = new WebContentsView({ webPreferences: {
        preload: path.join(__dirname, "downloadsPreload.cjs"),
        sandbox: true, contextIsolation: true, nodeIntegration: false,
      } });
      view.setBackgroundColor("#00000000");
      view.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
      view.webContents.on("will-navigate", (event) => event.preventDefault());
      record.downloadsView = view;
      byDownloadsId.set(view.webContents.id, record);
      await view.webContents.loadFile(path.join(__dirname, "downloads.html"));
    }
    record.downloadsPanelOpen = true;
    try { record.win.contentView.removeChildView(record.downloadsView); } catch {}
    record.win.contentView.addChildView(record.downloadsView);
    positionDownloadsView(record);
    record.downloadsView.webContents.send("netcatty:host-browser:theme", { theme: record.theme, themeTokens: record.themeTokens });
    notifyDownloads(record);
    send(record);
  };
  const resizeView = (record) => {
    const [width, height] = record.win.getContentSize();
    for (const tab of record.tabs.values()) {
      tab.view.setBounds({
        x: 0,
        y: CHROME_HEIGHT,
        width: Math.max(1, width - (record.panelOpen ? 360 : 0)),
        height: Math.max(1, height - CHROME_HEIGHT),
      });
    }
    positionDownloadsView(record);
  };
  const displayTab = (record) => {
    for (const tab of record.tabs.values()) {
      try { record.win.contentView.removeChildView(tab.view); } catch {}
    }
    const tab = record.tabs.get(record.activeTabId);
    if (tab && tab.url && record.route === "connected") {
      record.win.contentView.addChildView(tab.view);
      resizeView(record);
    }
    if (record.downloadsPanelOpen && record.downloadsView) {
      try { record.win.contentView.removeChildView(record.downloadsView); } catch {}
      record.win.contentView.addChildView(record.downloadsView);
    }
    send(record);
  };
  const refreshTab = (record, tab) => {
    const contents = tab.view.webContents;
    if (contents.isDestroyed()) return;
    tab.url = contents.getURL() || tab.url;
    tab.title = contents.getTitle() || tab.url || "New tab";
    tab.canGoBack = contents.navigationHistory?.canGoBack?.() || false;
    tab.canGoForward = contents.navigationHistory?.canGoForward?.() || false;
    send(record);
  };
  const addTab = (record, initialUrl = null) => {
    if (record.tabs.size >= MAX_TABS) throw new Error("Too many open tabs");
    const view = new WebContentsView({ webPreferences: {
      session: record.pageSession,
      sandbox: true,
      nodeIntegration: false,
      nodeIntegrationInSubFrames: false,
      nodeIntegrationInWorker: false,
      contextIsolation: true,
      webSecurity: true,
      devTools: false,
      navigateOnDragDrop: false,
    } });
    const tab = { id: randomUUID(), view, url: "", title: "New tab", loading: false, canGoBack: false, canGoForward: false, faviconUrls: [] };
    record.tabs.set(tab.id, tab);
    const contents = view.webContents;
    contents.on("before-input-event", (event, input) => {
      const modifier = process.platform === "darwin" ? input.meta : input.control;
      if (input.type !== "keyDown" || !modifier) return;
      const key = String(input.key || "").toLowerCase();
      const type = { t: "new-tab", w: "close-tab", r: "reload", l: "focus-address" }[key];
      if (!type) return;
      event.preventDefault();
      if (!record.win.isDestroyed()) record.win.webContents.send("netcatty:host-browser:shortcut", { type, tabId: tab.id });
    });
    contents.setWindowOpenHandler(({ url }) => {
      try { addTab(record, normalizeBrowserUrl(url)); } catch {}
      return { action: "deny" };
    });
    contents.on("will-attach-webview", (event) => event.preventDefault());
    contents.on("will-navigate", (event, url) => {
      try { normalizeBrowserUrl(url); } catch { event.preventDefault(); }
      if (record.route !== "connected") event.preventDefault();
    });
    contents.on("did-start-loading", () => { tab.loading = true; refreshTab(record, tab); displayTab(record); });
    contents.on("did-stop-loading", () => { tab.loading = false; refreshTab(record, tab); });
    contents.on("did-navigate", () => refreshTab(record, tab));
    contents.on("did-navigate-in-page", () => refreshTab(record, tab));
    contents.on("page-title-updated", () => refreshTab(record, tab));
    contents.on("page-favicon-updated", (_event, urls) => {
      tab.faviconUrls = urls;
      void updateFavicon(record, tab, urls);
    });
    contents.on("did-finish-load", () => {
      if (tab.url && !siteIconStore.get(record.hostId, tab.url)) {
        void updateFavicon(record, tab, [`${iconOrigin(tab.url)}/favicon.ico`]);
      }
    });
    contents.on("render-process-gone", () => { tab.loading = false; tab.title = "Page stopped"; send(record); });
    record.activeTabId = tab.id;
    displayTab(record);
    if (initialUrl && record.route === "connected") void contents.loadURL(initialUrl).catch(() => {});
    return tab;
  };
  const stopTunnel = (record) => {
    if (!record.tunnelId) return;
    const tunnelId = record.tunnelId;
    record.tunnelId = null;
    void portForwardingBridge.stopPortForward(null, { tunnelId }).catch(() => {});
  };
  const closeRecord = (record) => {
    if (windows.get(record.hostId) !== record) return;
    windows.delete(record.hostId);
    byChromeId.delete(record.chromeId);
    if (record.downloadsView) {
      byDownloadsId.delete(record.downloadsView.webContents.id);
      try { record.win.contentView.removeChildView(record.downloadsView); } catch {}
      try { record.downloadsView.webContents.close(); } catch {}
      record.downloadsView = null;
    }
    record.pageSession.off("will-download", record.downloadHandler);
    record.routeGeneration += 1;
    record.route = "disconnected";
    stopTunnel(record);
    for (const item of record.downloads.values()) { try { item.cancel(); } catch {} }
    record.downloads.clear();
    for (const tab of record.tabs.values()) {
      try { record.win.contentView.removeChildView(tab.view); } catch {}
      try { tab.view.webContents.close(); } catch {}
    }
    record.tabs.clear();
    void record.proxyQueue.then(async () => {
      await record.pageSession.setProxy({ mode: "fixed_servers", proxyRules: DEAD_PROXY, proxyBypassRules: "<-loopback>" });
      await record.pageSession.closeAllConnections();
    }).catch(() => {});
  };
  const setRouteProxy = (record, generation, proxyRules) => {
    const operation = record.proxyQueue.catch(() => {}).then(async () => {
      if (windows.get(record.hostId) !== record || record.routeGeneration !== generation) return false;
      await record.pageSession.setProxy({ mode: "fixed_servers", proxyRules, proxyBypassRules: "<-loopback>" });
      await record.pageSession.closeAllConnections();
      return record.routeGeneration === generation;
    });
    record.proxyQueue = operation;
    return operation;
  };
  const demote = async (record, error = "Connection to the host was lost") => {
    if (record.route === "disconnected") return;
    const generation = ++record.routeGeneration;
    record.route = "disconnected";
    record.error = error;
    displayTab(record);
    stopTunnel(record);
    for (const item of record.downloads.values()) { try { item.cancel(); } catch {} }
    try {
      await setRouteProxy(record, generation, DEAD_PROXY);
    } catch {}
    for (const tab of record.tabs.values()) tab.view.webContents.stop();
    send(record);
  };
  const configureProxy = async (record, generation, port) => {
    if (!Number.isSafeInteger(port) || port < 1 || port > 65535) throw new Error("Browser route is unavailable");
    if (!await setRouteProxy(record, generation, `socks5://127.0.0.1:${port}`)) return;
    record.route = "connected";
    record.error = null;
    displayTab(record);
  };
  const startRoute = async (record) => {
    const generation = ++record.routeGeneration;
    record.route = "connecting";
    displayTab(record);
    if (!await setRouteProxy(record, generation, DEAD_PROXY)) return;
    stopTunnel(record);
    const tunnelId = `host-browser-${randomUUID()}`;
    record.tunnelId = tunnelId;
    const sender = record.sourceWebContents && !record.sourceWebContents.isDestroyed()
      ? record.sourceWebContents : record.win.webContents;
    try {
      const result = await portForwardingBridge.startPortForward({ sender }, {
        ...record.connectionOptions,
        ruleId: undefined,
        tunnelId,
        type: "dynamic",
        localPort: 0,
        bindAddress: "127.0.0.1",
        reuseTransport: false,
      });
      if (windows.get(record.hostId) !== record || record.routeGeneration !== generation || record.win.isDestroyed()) {
        stopTunnel(record);
        return;
      }
      if (!result.success || !result.localPort) throw new Error(result.error || "Could not connect to host");
      await configureProxy(record, generation, result.localPort);
    } catch (error) {
      if (record.routeGeneration === generation) {
        await demote(record, error?.message || String(error));
        throw error;
      }
    }
  };
  const open = async (event, input) => {
    if (!BrowserWindow.fromWebContents(event.sender)) throw new Error("Browser opener is unavailable");
    const hostId = typeof input?.hostId === "string" ? input.hostId : "";
    const label = typeof input?.label === "string" ? input.label.slice(0, 120) : "";
    if (!hostId || hostId.length > 256 || !label || input?.connectionOptions?.hostId !== hostId
      || input.connectionOptions?.type !== "dynamic") throw new Error("Invalid host browser request");
    const existing = windows.get(hostId);
    if (existing) {
      existing.theme = input?.theme === "light" ? "light" : "dark";
      existing.themeTokens = validThemeTokens(input?.themeTokens);
      if (existing.downloadsView && !existing.downloadsView.webContents.isDestroyed()) {
        existing.downloadsView.webContents.send("netcatty:host-browser:theme", {
          theme: existing.theme, themeTokens: existing.themeTokens,
        });
      }
      send(existing);
      if (existing.route !== "connected") {
        existing.connectionOptions = input.connectionOptions;
        existing.sourceWebContents = event.sender;
        await startRoute(existing);
      }
      existing.win.show();
      existing.win.focus();
      return { reused: true };
    }
    const partition = `host-browser-${createHash("sha256").update(hostId).digest("hex")}`;
    const pageSession = session.fromPartition(partition, { cache: false });
    await pageSession.setProxy({ mode: "fixed_servers", proxyRules: DEAD_PROXY, proxyBypassRules: "<-loopback>" });
    pageSession.setPermissionCheckHandler?.(() => false);
    pageSession.setPermissionRequestHandler?.((_contents, _permission, callback) => callback(false));
    pageSession.setDevicePermissionHandler?.(() => false);
    const record = { hostId, label, theme: input?.theme === "light" ? "light" : "dark",
      themeTokens: validThemeTokens(input?.themeTokens),
      pageSession, route: "connecting", error: null, panelOpen: false,
      tunnelId: null, connectionOptions: input.connectionOptions, sourceWebContents: event.sender,
      routeGeneration: 0, proxyQueue: Promise.resolve(), tabs: new Map(), downloads: new Map(),
      downloadsView: null, downloadsPanelOpen: false, activeTabId: null, win: null };
    record.downloadHandler = (event, item, contents) => {
      const ownedPage = [...record.tabs.values()].some((tab) => tab.view.webContents === contents);
      if (record.route !== "connected" || !ownedPage) { event.preventDefault(); return; }
      const id = randomUUID();
      const filename = path.basename(String(item.getFilename() || "download").replace(/\\/g, "/")) || "download";
      item.setSaveDialogOptions({ defaultPath: path.join(app.getPath("downloads"), filename) });
      record.downloads.set(id, item);
      downloadStore.upsert({ id, hostId, filename, url: item.getURL(), savePath: "",
        status: "waiting", received: 0, total: item.getTotalBytes(), startedAt: Date.now() });
      notifyDownloads(record);
      let lastProgressAt = 0;
      item.on("updated", (_updateEvent, status) => {
        const now = Date.now();
        if (status === "progressing" && now - lastProgressAt < 200) return;
        lastProgressAt = now;
        const previous = downloadStore.get(hostId, id);
        if (!previous) return;
        const savePath = item.getSavePath() || previous.savePath;
        downloadStore.upsert({ ...previous, filename: savePath ? path.basename(savePath) : filename,
          savePath, status, received: item.getReceivedBytes(), total: item.getTotalBytes() });
        notifyDownloads(record);
      });
      item.once("done", (_doneEvent, status) => {
        record.downloads.delete(id);
        const previous = downloadStore.get(hostId, id);
        if (!previous) return;
        const savePath = item.getSavePath() || previous.savePath;
        downloadStore.upsert({ ...previous, filename: savePath ? path.basename(savePath) : filename,
          savePath, status, received: item.getReceivedBytes(), total: item.getTotalBytes(), endedAt: Date.now() });
        notifyDownloads(record);
      });
    };
    pageSession.on("will-download", record.downloadHandler);
    pageSession.webRequest.onBeforeRequest((details, callback) => {
      let allowed = false;
      try { allowed = record.route === "connected" && ALLOWED_PAGE_SCHEMES.has(new URL(details.url).protocol); } catch {}
      callback({ cancel: !allowed });
    });
    const win = new BrowserWindow({
      title: `Browser via ${label}`,
      width: 1100, height: 760, minWidth: 720, minHeight: 480,
      show: false, backgroundColor: input?.theme === "light" ? "#f1f4f8" : "#0f121a",
      frame: process.platform === "darwin",
      titleBarStyle: process.platform === "darwin" ? "hiddenInset" : undefined,
      trafficLightPosition: process.platform === "darwin" ? { x: 12, y: 12 } : undefined,
      ...windowsFramelessContentChromeOptions(),
      webPreferences: {
        preload: path.join(__dirname, "browserPreload.cjs"),
        sandbox: true, contextIsolation: true, nodeIntegration: false,
      },
    });
    record.win = win;
    record.chromeId = win.webContents.id;
    windows.set(hostId, record);
    byChromeId.set(record.chromeId, record);
    win.on("resize", () => resizeView(record));
    win.on("blur", () => closeDownloadsPanel(record));
    win.on("maximize", () => send(record));
    win.on("unmaximize", () => send(record));
    win.on("closed", () => closeRecord(record));
    win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    win.webContents.on("will-navigate", (navigationEvent) => navigationEvent.preventDefault());
    try {
      await win.loadFile(path.join(__dirname, "browser.html"));
      if (win.isDestroyed()) throw new Error("Browser was closed before it opened");
      addTab(record);
      win.show();
      try { await startRoute(record); } catch { /* Keep the browser open for an in-window retry. */ }
      return { reused: false };
    } catch (error) {
      closeRecord(record);
      if (!win.isDestroyed()) win.destroy();
      throw error;
    }
  };
  const focus = (_event, hostId) => {
    const record = windows.get(hostId);
    if (!record || record.win.isDestroyed()) return false;
    record.win.show();
    record.win.focus();
    return record.route === "connected";
  };
  const getOwned = (event) => {
    const record = byChromeId.get(event.sender.id);
    if (!record || record.win.webContents !== event.sender) throw new Error("Untrusted browser control");
    return record;
  };
  const getBrowserOwned = (event) => {
    const chrome = byChromeId.get(event.sender.id);
    if (chrome && chrome.win.webContents === event.sender) return chrome;
    const downloads = byDownloadsId.get(event.sender.id);
    if (downloads && downloads.downloadsView?.webContents === event.sender) return downloads;
    throw new Error("Untrusted browser download control");
  };
  ipcMain.handle("netcatty:host-browser:open", open);
  ipcMain.handle("netcatty:host-browser:focus", focus);
  ipcMain.handle("netcatty:host-browser:snapshot", (event) => snapshot(getOwned(event)));
  ipcMain.handle("netcatty:host-browser:downloads:list", (event) => {
    const record = getBrowserOwned(event);
    return downloadStore.list(record.hostId);
  });
  ipcMain.handle("netcatty:host-browser:downloads:theme", (event) => {
    const record = getBrowserOwned(event);
    return { theme: record.theme, themeTokens: record.themeTokens };
  });
  ipcMain.handle("netcatty:host-browser:downloads:command", async (event, input) => {
    const record = getBrowserOwned(event);
    const item = downloadStore.get(record.hostId, input?.id);
    switch (input?.type) {
      case "close": closeDownloadsPanel(record); return true;
      case "open-folder": {
        const error = await (shell || require("electron").shell).openPath(app.getPath("downloads"));
        if (error) throw new Error(error);
        return true;
      }
      case "clear": downloadStore.clearFinished(record.hostId); notifyDownloads(record); return true;
      case "cancel":
        if (!item || !record.downloads.has(item.id)) throw new Error("Download is no longer active");
        record.downloads.get(item.id).cancel();
        return true;
      case "remove":
        if (!item || !downloadStore.remove(record.hostId, item.id)) return false;
        notifyDownloads(record);
        return true;
      case "open":
      case "reveal": {
        if (!item || item.status !== "completed" || !item.savePath || !fs.existsSync(item.savePath)) {
          throw new Error("File moved or deleted");
        }
        if (input.type === "reveal") (shell || require("electron").shell).showItemInFolder(item.savePath);
        else {
          const error = await (shell || require("electron").shell).openPath(item.savePath);
          if (error) throw new Error(error);
        }
        return true;
      }
      default: throw new Error("Unknown download action");
    }
  });
  ipcMain.handle("netcatty:host-browser:bookmarks:list", (event) => {
    const record = getOwned(event);
    return bookmarkStore.list().filter((item) => item.scope === "all-hosts" || item.hostId === record.hostId)
      .map((item) => {
        const siteIcon = siteIconStore.get(record.hostId, item.url);
        return { ...item, siteIconDataUrl: siteIcon?.dataUrl || null,
          siteIconGlyph: siteIcon?.glyph || null, siteIconColor: siteIcon?.color || null };
      });
  });
  ipcMain.handle("netcatty:host-browser:bookmarks:upsert", (event, input) => {
    const record = getOwned(event);
    if (input?.id) {
      const previous = bookmarkStore.list().find((item) => item.id === input.id);
      if (previous && previous.scope === "host" && previous.hostId !== record.hostId) throw new Error("Bookmark belongs to another host");
    }
    return bookmarkStore.upsert({ ...input, hostId: input?.scope === "all-hosts" ? null : record.hostId });
  });
  ipcMain.handle("netcatty:host-browser:bookmarks:remove", (event, id) => {
    const record = getOwned(event);
    const previous = bookmarkStore.list().find((item) => item.id === id);
    if (!previous || (previous.scope === "host" && previous.hostId !== record.hostId)) return false;
    bookmarkStore.remove(id);
    return true;
  });
  ipcMain.handle("netcatty:host-browser:bookmarks:get-all", (event) => {
    if (!BrowserWindow.fromWebContents(event.sender) || byChromeId.has(event.sender.id)) throw new Error("Untrusted bookmark reader");
    return bookmarkStore.list();
  });
  ipcMain.handle("netcatty:host-browser:bookmarks:apply", (event, items) => {
    if (!BrowserWindow.fromWebContents(event.sender) || byChromeId.has(event.sender.id)) throw new Error("Untrusted bookmark writer");
    bookmarkStore.apply(items);
    return true;
  });
  ipcMain.handle("netcatty:host-browser:command", async (event, command) => {
    const record = getOwned(event);
    if (command?.type === "window-close") { record.win.close(); return null; }
    const tab = record.tabs.get(command?.tabId || record.activeTabId);
    switch (command?.type) {
      case "window-minimize": record.win.minimize(); break;
      case "window-maximize":
        if (record.win.isMaximized()) record.win.unmaximize();
        else record.win.maximize();
        break;
      case "set-icon":
        if (!tab?.url) throw new Error("Open a page before changing its icon");
        siteIconStore.set(record.hostId, tab.url, {
          mode: "custom", dataUrl: command.dataUrl, glyph: command.glyph, color: command.color,
        });
        notifySiteIcon(record);
        break;
      case "reset-icon":
        if (!tab?.url) throw new Error("Open a page before changing its icon");
        siteIconStore.reset(record.hostId, tab.url);
        notifySiteIcon(record);
        void updateFavicon(record, tab, tab.faviconUrls.length ? tab.faviconUrls : [`${iconOrigin(tab.url)}/favicon.ico`]);
        break;
      case "set-panel": record.panelOpen = command.open === true; resizeView(record); break;
      case "set-download-panel": await setDownloadsPanel(record, command.open === true); break;
      case "retry": if (record.route === "disconnected") await startRoute(record); break;
      case "new-tab": addTab(record, command.url ? normalizeBrowserUrl(command.url) : null); break;
      case "reorder": {
        const ids = [...record.tabs.keys()];
        const from = ids.indexOf(command.tabId);
        const to = ids.indexOf(command.beforeTabId);
        if (from >= 0 && to >= 0 && from !== to) {
          ids.splice(from, 1);
          ids.splice(ids.indexOf(command.beforeTabId), 0, command.tabId);
          record.tabs = new Map(ids.map((id) => [id, record.tabs.get(id)]));
          send(record);
        }
        break;
      }
      case "activate": if (tab) { record.activeTabId = tab.id; displayTab(record); } break;
      case "close-tab":
        if (tab) {
          const tabs = [...record.tabs.values()];
          const next = tabs[tabs.indexOf(tab) + 1] || tabs[tabs.indexOf(tab) - 1];
          record.win.contentView.removeChildView(tab.view);
          record.tabs.delete(tab.id);
          tab.view.webContents.close();
          if (record.activeTabId === tab.id) record.activeTabId = next?.id || null;
          if (!record.tabs.size) addTab(record);
          else displayTab(record);
        }
        break;
      case "navigate":
        if (record.route !== "connected") throw new Error("Reconnect to the host before opening a page");
        if (tab) {
          tab.url = normalizeBrowserUrl(command.url);
          displayTab(record);
          await tab.view.webContents.loadURL(tab.url);
        }
        break;
      case "back": if (tab && record.route === "connected") tab.view.webContents.navigationHistory?.goBack(); break;
      case "forward": if (tab && record.route === "connected") tab.view.webContents.navigationHistory?.goForward(); break;
      case "reload": if (tab && record.route === "connected") tab.view.webContents.reload(); break;
      case "stop": tab?.view.webContents.stop(); break;
      default: throw new Error("Unknown browser command");
    }
    return snapshot(record);
  });
  const unsubscribeTunnelStatus = portForwardingBridge.onTunnelStatus((event) => {
    for (const record of windows.values()) {
      if (record.tunnelId === event.tunnelId && ["inactive", "error"].includes(event.status)) {
        void demote(record, event.error || undefined);
      }
    }
  });
  return { focus, open, closeAll: () => {
    unsubscribeTunnelStatus();
    for (const record of [...windows.values()]) { closeRecord(record); if (!record.win.isDestroyed()) record.win.destroy(); }
  } };
}

module.exports = { createHostBrowserManager, normalizeBrowserUrl };
