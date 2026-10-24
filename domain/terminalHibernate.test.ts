import assert from "node:assert/strict";
import test from "node:test";

import {
  canHibernateTerminalRuntimeSession,
  canHibernateTerminalRuntimeStatus,
  capHibernateBuffer,
  capHibernateBufferByLines,
  decideHiddenTabKeepCountAction,
  isTerminalFileTransferActive,
  normalizeHibernateHiddenTabsDelaySec,
  resolveTerminalHibernateDelayMs,
  resolveTerminalHibernateEnabled,
  resolveTerminalHibernateEnabledForProtocol,
  shouldKeepTerminalBackgroundWorkActive,
  TERMINAL_HIBERNATE_BUFFER_MAX_CHARS,
  TERMINAL_HIBERNATE_DELAY_SEC_DEFAULT,
  TERMINAL_HIBERNATE_DELAY_SEC_MAX,
  TERMINAL_HIBERNATE_DELAY_SEC_MIN,
} from "./terminalHibernate.ts";

test("connected and ended terminals can release hidden runtimes", () => {
  assert.equal(canHibernateTerminalRuntimeStatus("connected"), true);
  assert.equal(canHibernateTerminalRuntimeStatus("disconnected"), true);
  assert.equal(canHibernateTerminalRuntimeStatus("connecting"), false);
});

test("ended terminals do not need a live backend session to release their runtime", () => {
  assert.equal(canHibernateTerminalRuntimeSession("disconnected", null), true);
  assert.equal(canHibernateTerminalRuntimeSession("connected", "backend-1"), true);
  assert.equal(canHibernateTerminalRuntimeSession("connected", null), false);
  assert.equal(canHibernateTerminalRuntimeSession("connecting", "backend-1"), false);
});

test("capHibernateBuffer trims from the front when over the char limit", () => {
  const input = "a".repeat(TERMINAL_HIBERNATE_BUFFER_MAX_CHARS + 10);
  const capped = capHibernateBuffer(input);
  assert.equal(capped.length, TERMINAL_HIBERNATE_BUFFER_MAX_CHARS);
  assert.equal(capped, "a".repeat(TERMINAL_HIBERNATE_BUFFER_MAX_CHARS));
});

test("capHibernateBufferByLines keeps the most recent lines", () => {
  const input = ["line-1", "line-2", "line-3", "line-4"].join("\n");
  assert.equal(capHibernateBufferByLines(input, 2), "line-3\nline-4");
});

test("resolveTerminalHibernateEnabled defaults to disabled", () => {
  assert.equal(resolveTerminalHibernateEnabled(), false);
  assert.equal(resolveTerminalHibernateEnabled({ hibernateHiddenTabs: true }), true);
  assert.equal(resolveTerminalHibernateEnabled({ hibernateHiddenTabs: false }), false);
});

test("local terminals never hibernate even when hidden-tab hibernation is enabled", () => {
  const settings = { hibernateHiddenTabs: true };

  assert.equal(resolveTerminalHibernateEnabledForProtocol(settings, "local"), false);
  assert.equal(resolveTerminalHibernateEnabledForProtocol(settings, "ssh"), true);
});

test("background work only stops for hidden remote terminals when hibernation is enabled", () => {
  const enabled = { hibernateHiddenTabs: true };
  const disabled = { hibernateHiddenTabs: false };

  assert.equal(shouldKeepTerminalBackgroundWorkActive(enabled, "ssh", false), false);
  assert.equal(shouldKeepTerminalBackgroundWorkActive(enabled, "ssh", true), true);
  assert.equal(shouldKeepTerminalBackgroundWorkActive(enabled, "local", false), true);
  assert.equal(shouldKeepTerminalBackgroundWorkActive(disabled, "ssh", false), true);
});

test("isTerminalFileTransferActive is true when any transfer signal is active", () => {
  assert.equal(
    isTerminalFileTransferActive({ zmodemActive: false, ymodemInProgress: false, isDraggingOver: false }),
    false,
  );
  assert.equal(
    isTerminalFileTransferActive({ zmodemActive: true, ymodemInProgress: false, isDraggingOver: false }),
    true,
  );
  assert.equal(
    isTerminalFileTransferActive({ zmodemActive: false, ymodemInProgress: true, isDraggingOver: false }),
    true,
  );
  assert.equal(
    isTerminalFileTransferActive({ zmodemActive: false, ymodemInProgress: false, isDraggingOver: true }),
    true,
  );
});

test("normalizeHibernateHiddenTabsDelaySec clamps to the allowed range", () => {
  assert.equal(normalizeHibernateHiddenTabsDelaySec(undefined), TERMINAL_HIBERNATE_DELAY_SEC_DEFAULT);
  assert.equal(normalizeHibernateHiddenTabsDelaySec(45), 45);
  assert.equal(normalizeHibernateHiddenTabsDelaySec(1), TERMINAL_HIBERNATE_DELAY_SEC_MIN);
  assert.equal(normalizeHibernateHiddenTabsDelaySec(9999), TERMINAL_HIBERNATE_DELAY_SEC_MAX);
});

test("a full keep-count soft-hides the tab that just left only after an eviction succeeds", () => {
  const underLimitEvictions: string[] = [];
  assert.deepEqual(decideHiddenTabKeepCountAction({
    keepCount: 2,
    softHiddenCount: 1,
    sessionId: "leaving",
    candidatesOldestFirst: ["older"],
    evict: (sessionId) => {
      underLimitEvictions.push(sessionId);
      return true;
    },
  }), { action: "soft-hide", evictSessionId: null });
  assert.deepEqual(underLimitEvictions, []);

  const evicted: string[] = [];
  assert.deepEqual(decideHiddenTabKeepCountAction({
    keepCount: 2,
    softHiddenCount: 2,
    sessionId: "leaving",
    candidatesOldestFirst: ["oldest", "newer"],
    evict: (sessionId) => {
      evicted.push(sessionId);
      return sessionId === "oldest";
    },
  }), { action: "soft-hide", evictSessionId: "oldest" });
  assert.deepEqual(evicted, ["oldest"]);

  assert.deepEqual(decideHiddenTabKeepCountAction({
    keepCount: 2,
    softHiddenCount: 3,
    sessionId: "leaving",
    candidatesOldestFirst: ["oldest"],
    evict: () => true,
  }), { action: "soft-hide", evictSessionId: "oldest" });
});

test("a refused eviction tries the next candidate, then full-hibernates", () => {
  const attempts: string[] = [];
  assert.deepEqual(decideHiddenTabKeepCountAction({
    keepCount: 2,
    softHiddenCount: 2,
    sessionId: "leaving",
    candidatesOldestFirst: ["images", "plain"],
    evict: (sessionId) => {
      attempts.push(sessionId);
      return sessionId === "plain";
    },
  }), { action: "soft-hide", evictSessionId: "plain" });
  assert.deepEqual(attempts, ["images", "plain"]);

  const blocked: string[] = [];
  assert.deepEqual(decideHiddenTabKeepCountAction({
    keepCount: 2,
    softHiddenCount: 2,
    sessionId: "leaving",
    candidatesOldestFirst: ["images", "also-images"],
    evict: (sessionId) => {
      blocked.push(sessionId);
      return false;
    },
  }), { action: "full-hibernate", evictSessionId: null });
  assert.deepEqual(blocked, ["images", "also-images"]);
});

test("keep-count zero still full-hibernates and does not evict", () => {
  const evicted: string[] = [];
  assert.deepEqual(decideHiddenTabKeepCountAction({
    keepCount: 0,
    softHiddenCount: 4,
    sessionId: "leaving",
    candidatesOldestFirst: ["oldest"],
    evict: (sessionId) => {
      evicted.push(sessionId);
      return true;
    },
  }), { action: "full-hibernate", evictSessionId: null });
  assert.deepEqual(evicted, []);
});

test("a full keep-count does not evict the session that is deciding", () => {
  const evicted: string[] = [];
  assert.deepEqual(decideHiddenTabKeepCountAction({
    keepCount: 2,
    softHiddenCount: 2,
    sessionId: "leaving",
    candidatesOldestFirst: ["leaving", "other"],
    evict: (sessionId) => {
      evicted.push(sessionId);
      return false;
    },
  }), { action: "full-hibernate", evictSessionId: null });
  assert.deepEqual(evicted, ["other"]);
});

test("resolveTerminalHibernateDelayMs converts seconds to milliseconds", () => {
  assert.equal(resolveTerminalHibernateDelayMs(), TERMINAL_HIBERNATE_DELAY_SEC_DEFAULT * 1000);
  assert.equal(resolveTerminalHibernateDelayMs({ hibernateHiddenTabsDelaySec: 10 }), 10_000);
});
