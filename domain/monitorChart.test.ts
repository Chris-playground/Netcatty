import test from "node:test";
import assert from "node:assert/strict";
import { findMonitorChartPoint } from "./monitorChart";
import type { MonitorPoint } from "./monitorRuntime";

const points: MonitorPoint[] = [
  { at: 1000, cpu: 12.5, memory: 40.123, disk: null, rx: null, tx: null },
  { at: 2000, cpu: null, memory: 50, disk: null, rx: null, tx: null },
  { at: 3000, cpu: 80, memory: null, disk: null, rx: null, tx: null },
];
test("chart hit testing returns the exact sampled value and timestamp", () => {
  assert.equal(findMonitorChartPoint(points, "cpu", 2900, 300), points[2]);
  assert.equal(findMonitorChartPoint(points, "memory", 1100, 300), points[0]);
});
test("chart hit testing does not fabricate readings in missing or distant history", () => {
  assert.equal(findMonitorChartPoint(points, "cpu", 2000, 300), null);
  assert.equal(findMonitorChartPoint(points, "cpu", -5000, 300), null);
  assert.equal(findMonitorChartPoint([], "cpu", 1000, 300), null);
});
