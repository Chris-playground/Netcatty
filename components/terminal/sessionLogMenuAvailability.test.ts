import assert from "node:assert/strict";
import test from "node:test";

import { canOfferSessionLogMenu, resolveRetainedSessionLog } from "./sessionLogMenuAvailability.ts";

const connected = {
  automaticLogging: false,
  manualLogging: false,
  previousStatus: "connected" as const,
  status: "connected" as const,
};

test("a stopped manual log stays available while the same connection remains", () => {
  assert.equal(resolveRetainedSessionLog(true, connected), true);
  assert.equal(canOfferSessionLogMenu(true, connected), true);
});

test("a successful reconnect without automatic logging retires the stopped manual log", () => {
  const reconnect = { ...connected, previousStatus: "connecting" as const };
  assert.equal(resolveRetainedSessionLog(true, reconnect), false);
  assert.equal(canOfferSessionLogMenu(true, reconnect), false);
});

test("automatic logging and an active manual log stay available across reconnect", () => {
  const reconnect = { ...connected, previousStatus: "disconnected" as const };
  assert.equal(canOfferSessionLogMenu(false, { ...reconnect, automaticLogging: true }), true);
  assert.equal(canOfferSessionLogMenu(false, { ...reconnect, manualLogging: true }), true);
  assert.equal(resolveRetainedSessionLog(true, { ...reconnect, manualLogging: true }), true);
});

test("a failed reconnect keeps the stopped manual log", () => {
  const failed = { ...connected, previousStatus: "connecting" as const, status: "disconnected" as const };
  assert.equal(resolveRetainedSessionLog(true, failed), true);
  assert.equal(canOfferSessionLogMenu(true, failed), true);
});
