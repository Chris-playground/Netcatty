import React from "react";
import type { MonitorStats } from "../../domain/monitorRuntime";
import { ResourceBar } from "../systemManager/ResourceBar";

/** Keep every reported mount visible in both host views, including healthy disks. */
export function MonitorDiskUsage({
  stats,
}: {
  stats?: Pick<MonitorStats, "disks" | "diskPercent"> | null;
}) {
  const disks = stats?.disks.length
    ? stats.disks
    : [{ mountPoint: "/", percent: stats?.diskPercent ?? null }];
  return (
    <div className="space-y-1.5">
      {disks.map((disk, index) => (
        <div key={`${disk.mountPoint}-${index}`} className="flex min-w-0 items-center gap-2">
          <span
            className="w-24 shrink-0 truncate text-[10px] text-muted-foreground"
            title={disk.mountPoint}
          >
            {disk.mountPoint}
          </span>
          <ResourceBar label="" value={disk.percent} className="flex-1" />
        </div>
      ))}
    </div>
  );
}
