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
