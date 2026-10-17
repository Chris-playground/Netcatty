import type { MonitorPoint } from "./monitorRuntime";

export type MonitorTrendField = "cpu" | "memory" | "rx" | "tx";

/** Hit actual samples within cursor tolerance, never an interpolated reading. */
export function findMonitorChartPoint(
  points: MonitorPoint[],
  field: MonitorTrendField,
  at: number,
  tolerance: number,
): MonitorPoint | null {
  let closest: MonitorPoint | null = null;
  let distance = tolerance;
  for (const point of points) {
    const value = point[field];
    if (value == null || !Number.isFinite(value)) continue;
    const delta = Math.abs(point.at - at);
    if (delta <= distance) {
      closest = point;
      distance = delta;
    }
  }
  return closest;
}
