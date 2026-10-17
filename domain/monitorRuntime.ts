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
  unavailable?: boolean;
  hosts: Record<string, MonitorHostState>;
};
export type MonitorPanelDemand = {
  id: string;
  interval: MonitorPanel["interval"];
  hosts: {
    id: string;
    options?: NetcattySSHOptions;
    status?: "login" | "error";
  }[];
};
