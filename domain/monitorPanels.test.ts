import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeMonitorPanels,
  rebaseMonitorPanel,
  type MonitorPanel,
} from "./monitorPanels";
import { mergeSyncPayloads } from "./syncMerge";
import type { SyncPayload } from "./sync";
import {
  applyLegacySyncPayload,
  createConvergentSyncState,
  materializeSyncPayloadFromConvergentState,
  mergeConvergentSyncStates,
} from "./convergentSync";
const panel: MonitorPanel = {
  id: "p1",
  name: "Production",
  description: "",
  hostIds: ["h2", "h1"],
  view: "charts",
  interval: 10,
  range: 15,
  sort: "manual",
  attentionOnly: false,
};
const payload = (panels?: MonitorPanel[]): SyncPayload => ({
  hosts: [],
  keys: [],
  snippets: [],
  customGroups: [],
  syncedAt: 1,
  ...(panels === undefined ? {} : { monitorPanels: panels }),
});
test("portable panel sanitizer strips all runtime data and preserves ordered references", () => {
  const clean = normalizeMonitorPanels([
    {
      ...panel,
      hostIds: ["h2", "h1", "h2"],
      stats: { cpu: 42 },
      points: [1],
      running: true,
      error: "secret",
    },
  ]);
  assert.deepEqual(clean, [panel]);
  assert.equal(JSON.stringify(clean).includes("secret"), false);
});
test("concurrent local edits preserve unrelated fields and deletion does not resurrect", () => {
  const renamed = { ...panel, name: "New name" };
  const changed = { ...panel, view: "list" as const, hostIds: ["h3", "h2"] };
  assert.deepEqual(rebaseMonitorPanel([renamed], panel, changed), [
    { ...renamed, ...changed, name: renamed.name },
  ]);
  assert.throws(() => rebaseMonitorPanel([], panel, changed), /deleted/);
  assert.throws(
    () => rebaseMonitorPanel([panel], null, { ...panel, id: "p2" }),
    /duplicateName/,
  );
});
test("three-way sync merges panel fields, preserves legacy omission and propagates deletion", () => {
  const base = payload([panel]);
  const local = payload([{ ...panel, name: "Renamed" }]);
  const remote = payload([{ ...panel, hostIds: ["h3"], view: "list" }]);
  assert.deepEqual(
    mergeSyncPayloads(base, local, remote).payload.monitorPanels,
    [{ ...panel, name: "Renamed", hostIds: ["h3"], view: "list" }],
  );
  assert.deepEqual(
    mergeSyncPayloads(base, base, payload()).payload.monitorPanels,
    [panel],
  );
  assert.deepEqual(
    mergeSyncPayloads(base, base, payload([])).payload.monitorPanels,
    [],
  );
});
test("convergent replica carries panel creation, edits and deletion", () => {
  const empty = payload([]),
    initial = payload([panel]);
  const state = applyLegacySyncPayload(
    createConvergentSyncState(),
    empty,
    initial,
    "a",
    1,
  );
  const left = applyLegacySyncPayload(
    state,
    initial,
    payload([{ ...panel, name: "A" }]),
    "a",
    2,
  );
  const right = applyLegacySyncPayload(
    state,
    initial,
    payload([{ ...panel, hostIds: ["h3"], view: "list" }]),
    "b",
    3,
  );
  const joined = mergeConvergentSyncStates(left, right);
  assert.deepEqual(
    materializeSyncPayloadFromConvergentState(joined, { syncedAt: 3 })
      .monitorPanels,
    [{ ...panel, name: "A", hostIds: ["h3"], view: "list" }],
  );
  const removed = applyLegacySyncPayload(
    joined,
    materializeSyncPayloadFromConvergentState(joined, { syncedAt: 3 }),
    empty,
    "a",
    4,
  );
  assert.deepEqual(
    materializeSyncPayloadFromConvergentState(
      mergeConvergentSyncStates(removed, right),
      { syncedAt: 4 },
    ).monitorPanels,
    [],
  );
});
