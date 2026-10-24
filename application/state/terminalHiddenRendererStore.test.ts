import assert from "node:assert/strict";
import test from "node:test";

import { terminalHiddenRendererStore } from "./terminalHiddenRendererStore.ts";

test("terminalHiddenRendererStore evicts oldest soft-hidden session", () => {
  terminalHiddenRendererStore.clearSoftHidden("a");
  terminalHiddenRendererStore.clearSoftHidden("b");
  terminalHiddenRendererStore.markSoftHidden("a");
  terminalHiddenRendererStore.markSoftHidden("b");
  assert.equal(terminalHiddenRendererStore.pickEvictionCandidate(2), "a");
  assert.deepEqual(terminalHiddenRendererStore.listSoftHiddenOldestFirst(), ["a", "b"]);
  terminalHiddenRendererStore.clearSoftHidden("a");
  terminalHiddenRendererStore.clearSoftHidden("b");
});

test("evictSoftHidden reports refusal and drops an unconsumed request", async () => {
  const sessions = ["images", "plain", "other"];
  for (const sessionId of sessions) terminalHiddenRendererStore.clearSoftHidden(sessionId);
  terminalHiddenRendererStore.markSoftHidden("images");
  terminalHiddenRendererStore.markSoftHidden("plain");

  const unsubscribe = terminalHiddenRendererStore.subscribe(() => {
    if (terminalHiddenRendererStore.consumeEvictionRequest("images")) return;
    if (terminalHiddenRendererStore.consumeEvictionRequest("plain")) {
      terminalHiddenRendererStore.clearSoftHidden("plain");
      terminalHiddenRendererStore.settleEviction("plain", true);
    }
  });

  try {
    assert.equal(await terminalHiddenRendererStore.evictSoftHidden("images"), false);
    assert.equal(terminalHiddenRendererStore.isSoftHidden("images"), true);
    assert.equal(await terminalHiddenRendererStore.evictSoftHidden("plain"), true);
    assert.equal(terminalHiddenRendererStore.isSoftHidden("plain"), false);
  } finally {
    unsubscribe();
    for (const sessionId of sessions) terminalHiddenRendererStore.clearSoftHidden(sessionId);
  }

  terminalHiddenRendererStore.markSoftHidden("images");
  assert.equal(await terminalHiddenRendererStore.evictSoftHidden("images"), false);
  const delivered: string[] = [];
  const later = terminalHiddenRendererStore.subscribe(() => {
    if (terminalHiddenRendererStore.consumeEvictionRequest("images")) delivered.push("images");
  });
  try {
    terminalHiddenRendererStore.markSoftHidden("other");
    assert.deepEqual(delivered, []);
    assert.equal(terminalHiddenRendererStore.isSoftHidden("images"), true);
  } finally {
    later();
    for (const sessionId of sessions) terminalHiddenRendererStore.clearSoftHidden(sessionId);
  }
});

test("evictSoftHidden waits for hibernate after the marker is cleared", async () => {
  terminalHiddenRendererStore.clearSoftHidden("victim");
  terminalHiddenRendererStore.markSoftHidden("victim");
  let markerClearedBeforeSettle = false;
  const unsubscribe = terminalHiddenRendererStore.subscribe(() => {
    if (!terminalHiddenRendererStore.consumeEvictionRequest("victim")) return;
    terminalHiddenRendererStore.clearSoftHidden("victim");
    markerClearedBeforeSettle = !terminalHiddenRendererStore.isSoftHidden("victim");
    queueMicrotask(() => {
      terminalHiddenRendererStore.markSoftHidden("victim");
      terminalHiddenRendererStore.settleEviction("victim", false);
    });
  });

  try {
    const completed = await terminalHiddenRendererStore.evictSoftHidden("victim");
    assert.equal(markerClearedBeforeSettle, true);
    assert.equal(completed, false);
    assert.equal(terminalHiddenRendererStore.isSoftHidden("victim"), true);
  } finally {
    unsubscribe();
    terminalHiddenRendererStore.clearSoftHidden("victim");
  }
});
