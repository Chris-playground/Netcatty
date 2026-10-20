const test = require("node:test");
const assert = require("node:assert/strict");

const { scanScreensForTotp, previewTotpInput } = require("./totpBridge.cjs");
const { encodeBase32 } = require("../../domain/totp.shared.cjs");

const SECRET = Buffer.from("12345678901234567890", "ascii");
const TOTP_URI = `otpauth://totp/Example:alice?secret=${encodeBase32(SECRET)}&algorithm=SHA1&digits=8&period=30`;

test("previewTotpInput returns the current code without echoing a separate secret field", () => {
  const preview = previewTotpInput({ text: TOTP_URI }, 59_000);
  assert.equal(preview.ok, true);
  assert.equal(preview.code, "94287082");
  assert.equal(preview.algorithm, "SHA1");
  assert.equal(preview.digits, 8);
  assert.equal("secret" in preview, false);
  assert.equal(previewTotpInput({ text: "otpauth://hotp/A?secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ&counter=1" }).error, "hotp");
  assert.equal(previewTotpInput({ text: "otpauth-migration://offline?data=abc" }).error, "migration");
});

test("screen scan returns a permission error when macOS screen recording is denied", async () => {
  const result = await scanScreensForTotp({
    electron: { systemPreferences: { getMediaAccessStatus: () => "denied" } },
    capture: async () => {
      throw new Error("capture should not run");
    },
  });
  assert.deepEqual(result, { ok: false, error: "screen-permission-denied" });
});

test("screen scan takes the first otpauth totp URI and ignores a leading HOTP code", async () => {
  const result = await scanScreensForTotp({
    electron: { systemPreferences: { getMediaAccessStatus: () => "granted" } },
    capture: async () => [{ width: 1, height: 1, bitmap: Buffer.from([0, 0, 0, 255]) }],
    decode: () => ({ data: TOTP_URI }),
    now: () => 59_000,
  });
  assert.equal(result.ok, true);
  assert.equal(result.code, "94287082");
  assert.match(result.uri, /^otpauth:\/\/totp\//);
  assert.equal("secret" in result, false);
});

test("an empty macOS capture without screen-recording permission is a clear denial", async () => {
  const result = await scanScreensForTotp({
    platform: "darwin",
    electron: { systemPreferences: { getMediaAccessStatus: () => "not-determined" } },
    capture: async () => [],
  });
  assert.equal(result.error, "screen-permission-denied");
});

test("screen scan reports HOTP and a friendly miss", async () => {
  const hotp = await scanScreensForTotp({
    electron: { systemPreferences: { getMediaAccessStatus: () => "granted" } },
    capture: async () => [{ width: 1, height: 1, bitmap: Buffer.from([0, 0, 0, 255]) }],
    decode: () => ({ data: "otpauth://hotp/A?secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ&counter=1" }),
  });
  assert.equal(hotp.error, "hotp");
  const missed = await scanScreensForTotp({
    electron: { systemPreferences: { getMediaAccessStatus: () => "granted" } },
    capture: async () => [{ width: 1, height: 1, bitmap: Buffer.from([0, 0, 0, 255]) }],
    decode: () => null,
  });
  assert.equal(missed.error, "not-found");
});
