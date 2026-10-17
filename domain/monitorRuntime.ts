import type { MonitorPanel } from "./monitorPanels";
export type MonitorStats = NonNullable<
  Awaited<ReturnType<NonNullable<NetcattyBridge["getServerStats"]>>>["stats"]
> & { networkReady?: boolean };
export type MonitorPoint = {
  at: number;
  cpu: number | null;
  memory: number | null;
  disk: number | null;
  rx: number | null;
  tx: number | null;
};
export type MonitorHostState = {
  status:
    | "queued"
    | "connecting"
    | "live"
    | "login"
    | "error"
    | "unsupported"
    | "disconnected"
    | "limit";
  at: number;
  stats: MonitorStats | null;
  points: MonitorPoint[];
};
export type MonitorSnapshot = {
  historyMode: "replace" | "append";
  running: string[];
  count: number;
  hostCount: number;
  epoch: number;
  runtimeId: string;
  takenAt: number;
  activeSessions: string[];
  startedAt: Record<string, number>;
  unavailable?: boolean;
  hosts: Record<string, MonitorHostState>;
};

export type MonitorHistoryCursor = {
  runtimeId: string;
  epoch: number;
  after: Record<string, number>;
};

/** Incremental transport keeps the full bounded history in the renderer. */
export function mergeMonitorSnapshotHistory(previous: MonitorSnapshot, next: MonitorSnapshot): MonitorSnapshot {
  if (previous.runtimeId !== next.runtimeId) {
    // An old worker reply can still be in transit after its replacement starts.
    if (previous.runtimeId && next.runtimeId && next.takenAt <= previous.takenAt) return previous;
    return next;
  }
  if (next.epoch < previous.epoch) return previous;
  if (next.epoch > previous.epoch) return next;
  if (next.takenAt < previous.takenAt) return previous;
  if (next.historyMode === "replace") return next;
  return {
    ...next,
    hosts: Object.fromEntries(Object.entries(next.hosts).map(([id, host]) => {
      const retained = previous.hosts[id]?.points ?? [];
      const last = retained.at(-1)?.at ?? 0;
      return [id, { ...host, points: [...retained, ...host.points.filter((point) => point.at > last)]
        .filter((point) => next.takenAt - point.at <= 30 * 60000).slice(-1800) }];
    })),
  };
}

/** A panel only displays samples collected during its current cadence/run. */
export function monitorStateSince(state: MonitorHostState | undefined, startedAt: number | undefined): MonitorHostState | undefined {
  if (!state || typeof startedAt !== "number") return undefined;
  const fresh = state.at > startedAt;
  return {
    ...state,
    at: fresh ? state.at : 0,
    stats: fresh ? state.stats : null,
    status: !fresh && state.status === "live" ? "queued" : state.status,
    points: state.points.filter((point) => point.at > startedAt),
  };
}
export type MonitorPanelDemand = {
  id: string;
  runId: string;
  interval: MonitorPanel["interval"];
  hosts: {
    id: string;
    options?: NetcattySSHOptions;
    status?: "login" | "error";
  }[];
};
