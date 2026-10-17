import React from "react";
import type { MonitorStats } from "../../domain/monitorRuntime";
import { ResourceBar } from "../systemManager/ResourceBar";

/** Cards show the largest capacities; the list keeps every reported mount. */
export function MonitorDiskUsage({
  stats,
  limit,
}: {
  stats?: Pick<MonitorStats, "disks" | "diskPercent"> | null;
  limit?: number;
}) {
  const reported = stats?.disks.length
    ? stats.disks
    : [{ mountPoint: "/", percent: stats?.diskPercent ?? null }];
  const disks = limit == null
    ? reported
    : [...reported].sort((a, b) =>
        ("total" in b ? b.total : 0) - ("total" in a ? a.total : 0),
      ).slice(0, limit);
  return (
    <div className={limit === 2 ? "min-h-[38px] space-y-1.5" : "space-y-1.5"}>
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
