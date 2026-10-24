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

test("evictSoftHidden reports refusal and drops an unconsumed request", () => {
  const sessions = ["images", "plain", "other"];
  for (const sessionId of sessions) terminalHiddenRendererStore.clearSoftHidden(sessionId);
  terminalHiddenRendererStore.markSoftHidden("images");
  terminalHiddenRendererStore.markSoftHidden("plain");

  const unsubscribe = terminalHiddenRendererStore.subscribe(() => {
    if (terminalHiddenRendererStore.consumeEvictionRequest("images")) return;
    if (terminalHiddenRendererStore.consumeEvictionRequest("plain")) {
      terminalHiddenRendererStore.clearSoftHidden("plain");
    }
  });

  try {
    assert.equal(terminalHiddenRendererStore.evictSoftHidden("images"), false);
    assert.equal(terminalHiddenRendererStore.isSoftHidden("images"), true);
    assert.equal(terminalHiddenRendererStore.evictSoftHidden("plain"), true);
    assert.equal(terminalHiddenRendererStore.isSoftHidden("plain"), false);
  } finally {
    unsubscribe();
    for (const sessionId of sessions) terminalHiddenRendererStore.clearSoftHidden(sessionId);
  }

  terminalHiddenRendererStore.markSoftHidden("images");
  assert.equal(terminalHiddenRendererStore.evictSoftHidden("images"), false);
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
