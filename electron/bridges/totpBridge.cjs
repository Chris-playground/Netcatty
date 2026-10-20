"use strict";

const jsQR = require("jsqr");
const {
  previewTotpText,
  selectTotpFromQrPayloads,
  bgraToRgba,
  currentTotp,
} = require("../../domain/totp.shared.cjs");

const MAX_INPUT_LENGTH = 4096;

function screenCaptureStatus(electron) {
  try {
    return electron?.systemPreferences?.getMediaAccessStatus?.("screen") || "unknown";
  } catch {
    return "unknown";
  }
}

function isScreenPermissionError(error) {
  const message = String(error?.message || error || "");
  return /denied|permission|not authorized|not permitted/i.test(message);
}

async function captureScreenBitmaps(electron) {
  const desktopCapturer = electron?.desktopCapturer;
  const screen = electron?.screen;
  if (!desktopCapturer?.getSources || !screen?.getAllDisplays) {
    throw new Error("unavailable");
  }
  const displays = screen.getAllDisplays();
  const targets = displays.length > 0 ? displays : [null];
  const images = [];
  for (const display of targets) {
    const scale = Number(display?.scaleFactor) || 1;
    const width = Math.max(1, Math.round((display?.size?.width || display?.bounds?.width || 1920) * scale));
    const height = Math.max(1, Math.round((display?.size?.height || display?.bounds?.height || 1080) * scale));
    const sources = await desktopCapturer.getSources({
      types: ["screen"],
      thumbnailSize: { width, height },
      fetchWindowIcons: false,
    });
    const match = display
      ? sources.find((source) => String(source.display_id) === String(display.id))
      : sources[0];
    const image = (match || sources[0])?.thumbnail;
    if (!image?.getSize || typeof image.toBitmap !== "function") continue;
    const size = image.getSize();
    if (!size?.width || !size?.height) continue;
    images.push({ width: size.width, height: size.height, bitmap: image.toBitmap() });
  }
  return images;
}

function decodeBitmaps(images, decode) {
  const payloads = [];
  for (const image of images) {
    const rgba = bgraToRgba(image.bitmap, image.width, image.height);
    const result = decode(rgba, image.width, image.height);
    if (result?.data) payloads.push(result.data);
  }
  return payloads;
}

function publicPreviewFromParsed(parsed, timestamp) {
  const current = currentTotp(parsed, timestamp);
  return {
    ok: true,
    uri: parsed.uri,
    code: current.code,
    secondsRemaining: current.secondsRemaining,
    period: parsed.period,
    algorithm: parsed.algorithm,
    digits: parsed.digits,
    issuer: parsed.issuer,
    label: parsed.label,
  };
}

function previewTotpInput(payload, now = Date.now()) {
  const text = typeof payload?.text === "string" ? payload.text : payload?.uri;
  if (typeof text !== "string" || text.length > MAX_INPUT_LENGTH) {
    return { ok: false, error: "invalid" };
  }
  return previewTotpText(text, now);
}

async function scanScreensForTotp(deps = {}) {
  const electron = deps.electron;
  const status = screenCaptureStatus(electron);
  if (status === "denied" || status === "restricted") {
    return { ok: false, error: "screen-permission-denied" };
  }
  let images;
  try {
    images = await (deps.capture || captureScreenBitmaps)(electron);
  } catch (error) {
    if (isScreenPermissionError(error)) return { ok: false, error: "screen-permission-denied" };
    return { ok: false, error: "unavailable" };
  }
  if (!images?.length) {
    const platform = deps.platform || process.platform;
    if (platform === "darwin" && status !== "granted") {
      return { ok: false, error: "screen-permission-denied" };
    }
    return { ok: false, error: "not-found" };
  }
  const decode = deps.decode || ((data, width, height) => jsQR(data, width, height));
  let payloads;
  try {
    payloads = decodeBitmaps(images, decode);
  } catch {
    return { ok: false, error: "not-found" };
  }
  const selected = selectTotpFromQrPayloads(payloads);
  if (!selected.ok) return { ok: false, error: selected.error };
  return publicPreviewFromParsed(selected.parsed, deps.now?.() ?? Date.now());
}

function registerTotpHandlers(ipcMain, electronModule) {
  ipcMain.handle("netcatty:totp:preview", (_event, payload) => previewTotpInput(payload));
  ipcMain.handle("netcatty:totp:scan-screen", () => scanScreensForTotp({ electron: electronModule }));
}

module.exports = {
  registerTotpHandlers,
  scanScreensForTotp,
  previewTotpInput,
  captureScreenBitmaps,
};
