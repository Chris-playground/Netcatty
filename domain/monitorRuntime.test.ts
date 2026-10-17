import assert from "node:assert/strict";
import test from "node:test";
import { monitorStateSince, type MonitorHostState } from "./monitorRuntime";

const state: MonitorHostState = {
  status: "live", at: 2000, stats: {
    cpu: 50, cpuCores: 4, cpuPerCore: [], memTotal: 100, memUsed: 25,
    memFree: 75, memBuffers: 0, memCached: 0, swapTotal: 0, swapUsed: 0,
    topProcesses: [], diskPercent: 30, diskUsed: 30, diskTotal: 100, disks: [],
    netRxSpeed: 10, netTxSpeed: 20, latencyMs: 1, netInterfaces: [],
  },
  points: [1000, 2000].map((at) => ({ at, cpu: 50, memory: 25, disk: 30, rx: 10, tx: 20 })),
};
test("starting or changing cadence clears all old readings and chart fields", () => {
  const cleared = monitorStateSince(state, 2000)!;
  assert.deepEqual(cleared.points, []);
  assert.equal(cleared.stats, null);
  assert.equal(cleared.at, 0);
  assert.equal(cleared.status, "queued");
  assert.equal(monitorStateSince(state, undefined), undefined);
});
test("only current-run readings are visible without mutating shared history", () => {
  const fresh = monitorStateSince(state, 1500)!;
  assert.deepEqual(fresh.points.map((p) => p.at), [2000]);
  assert.equal(fresh.stats, state.stats);
  assert.equal(fresh.status, "live");
  assert.equal(monitorStateSince({ ...state, status: "unsupported" }, 2000)?.status, "unsupported");
  assert.equal(monitorStateSince(state, 0)?.points.length, 2);
  assert.equal(state.points.length, 2);
});
