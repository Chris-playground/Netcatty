import type { TerminalSession, TerminalSettings } from "./models/terminal";

/** Compile-time kill switch for terminal hibernate (Settings > Terminal still controls user default). */
export const TERMINAL_HIBERNATE_ENABLED = true;

/** Default delay before hibernating a hidden tab (seconds). */
export const TERMINAL_HIBERNATE_DELAY_SEC_DEFAULT = 5;

export const TERMINAL_HIBERNATE_DELAY_SEC_MIN = 5;

export const TERMINAL_HIBERNATE_DELAY_SEC_MAX = 600;

/** Default delay in milliseconds (legacy constant for tests). */
export const TERMINAL_HIBERNATE_DELAY_MS = TERMINAL_HIBERNATE_DELAY_SEC_DEFAULT * 1000;

export function normalizeHibernateHiddenTabsDelaySec(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return TERMINAL_HIBERNATE_DELAY_SEC_DEFAULT;
  }
  return Math.min(
    TERMINAL_HIBERNATE_DELAY_SEC_MAX,
    Math.max(TERMINAL_HIBERNATE_DELAY_SEC_MIN, Math.round(value)),
  );
}

export function resolveTerminalHibernateDelayMs(
  settings?: Pick<TerminalSettings, "hibernateHiddenTabsDelaySec"> | null,
): number {
  return normalizeHibernateHiddenTabsDelaySec(settings?.hibernateHiddenTabsDelaySec) * 1000;
}

export function resolveTerminalHibernateEnabled(
  settings?: Pick<TerminalSettings, "hibernateHiddenTabs"> | null,
): boolean {
  if (!TERMINAL_HIBERNATE_ENABLED) return false;
  return settings?.hibernateHiddenTabs === true;
}

export function resolveTerminalHibernateEnabledForProtocol(
  settings: Pick<TerminalSettings, "hibernateHiddenTabs"> | null | undefined,
  protocol: string | null | undefined,
): boolean {
  return protocol !== "local" && resolveTerminalHibernateEnabled(settings);
}

/** Hidden connected and ended remote terminals can both release their xterm runtime. */
export function canHibernateTerminalRuntimeStatus(
  status: TerminalSession["status"],
): boolean {
  return status === "connected" || status === "disconnected";
}

export function canHibernateTerminalRuntimeSession(
  status: TerminalSession["status"],
  backendSessionId: string | null | undefined,
): boolean {
  if (!canHibernateTerminalRuntimeStatus(status)) return false;
  return status === "disconnected" || Boolean(backendSessionId);
}

export function shouldKeepTerminalBackgroundWorkActive(
  settings: Pick<TerminalSettings, "hibernateHiddenTabs"> | null | undefined,
  protocol: string | null | undefined,
  isVisible: boolean,
): boolean {
  return isVisible || !resolveTerminalHibernateEnabledForProtocol(settings, protocol);
}

/** Block hibernate while a file transfer or drag-drop session is in progress. */
export function isTerminalFileTransferActive(options: {
  zmodemActive: boolean;
  ymodemInProgress: boolean;
  isDraggingOver: boolean;
}): boolean {
  return options.zmodemActive || options.ymodemInProgress || options.isDraggingOver;
}

/** Lines kept when snapshotting xterm scrollback before hibernate. */
export const TERMINAL_HIBERNATE_SNAPSHOT_MAX_LINES = 3_000;

/** Default chunk size for replaying hibernate snapshots without blocking the main thread. */
export const TERMINAL_HIBERNATE_REPLAY_CHUNK_BYTES_DEFAULT = 16 * 1024;

export const TERMINAL_HIBERNATE_REPLAY_CHUNK_BYTES_MIN = 4 * 1024;

export const TERMINAL_HIBERNATE_REPLAY_CHUNK_BYTES_MAX = 64 * 1024;

/** Hidden tabs whose xterm runtime is kept alive (WebGL suspended) before full hibernate. */
export const TERMINAL_HIBERNATE_KEEP_RENDERER_COUNT_DEFAULT = 2;

export const TERMINAL_HIBERNATE_KEEP_RENDERER_COUNT_MIN = 0;

export const TERMINAL_HIBERNATE_KEEP_RENDERER_COUNT_MAX = 12;

/** Max chars buffered in renderer while xterm is hibernated (post-snapshot output). */
export const TERMINAL_HIBERNATE_BUFFER_MAX_CHARS = 512 * 1024;

export function capHibernateBuffer(buffer: string, maxChars = TERMINAL_HIBERNATE_BUFFER_MAX_CHARS): string {
  if (buffer.length <= maxChars) return buffer;
  return buffer.slice(buffer.length - maxChars);
}

export function capHibernateBufferByLines(text: string, maxLines: number): string {
  if (maxLines <= 0 || text.length === 0) return text;
  const lines = text.split("\n");
  if (lines.length <= maxLines) return text;
  return lines.slice(lines.length - maxLines).join("\n");
}

export function normalizeHibernateReplayChunkBytes(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return TERMINAL_HIBERNATE_REPLAY_CHUNK_BYTES_DEFAULT;
  }
  return Math.min(
    TERMINAL_HIBERNATE_REPLAY_CHUNK_BYTES_MAX,
    Math.max(TERMINAL_HIBERNATE_REPLAY_CHUNK_BYTES_MIN, Math.round(value)),
  );
}

export function normalizeHibernateKeepRendererCount(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return TERMINAL_HIBERNATE_KEEP_RENDERER_COUNT_DEFAULT;
  }
  return Math.min(
    TERMINAL_HIBERNATE_KEEP_RENDERER_COUNT_MAX,
    Math.max(TERMINAL_HIBERNATE_KEEP_RENDERER_COUNT_MIN, Math.round(value)),
  );
}

export function resolveTerminalHibernateReplayChunkBytes(
  settings?: Pick<TerminalSettings, "hibernateReplayChunkBytes"> | null,
): number {
  return normalizeHibernateReplayChunkBytes(settings?.hibernateReplayChunkBytes);
}

export function resolveHibernateKeepRendererCount(
  settings?: Pick<TerminalSettings, "hibernateKeepRendererCount"> | null,
): number {
  return normalizeHibernateKeepRendererCount(settings?.hibernateKeepRendererCount);
}

export function resolveHibernateSkipAltScreen(
  settings?: Pick<TerminalSettings, "hibernateSkipAltScreen"> | null,
): boolean {
  return settings?.hibernateSkipAltScreen !== false;
}

export function resolveHibernatePreferWasmSerialize(
  settings?: Pick<TerminalSettings, "hibernatePreferWasmSerialize"> | null,
): boolean {
  return settings?.hibernatePreferWasmSerialize === true;
}

export function shouldSkipHibernateForAltScreen(
  alternateScreen: boolean,
  settings?: Pick<TerminalSettings, "hibernateSkipAltScreen"> | null,
): boolean {
  return alternateScreen && resolveHibernateSkipAltScreen(settings);
}

export type HiddenTabKeepCountDecision = {
  /**
   * Soft-hide the session that just left only when the keep set has room, or
   * when one older session was actually evicted. Otherwise full-hibernate.
   */
  action: "soft-hide" | "full-hibernate";
  /** Soft-hidden session whose eviction succeeded, when the keep set was full. */
  evictSessionId: string | null;
};

/**
 * Keep-count policy for a hidden session that is not already soft-hidden.
 * Callers still handle alternate screen, inline images, and a soft-hidden
 * session that later disconnects before asking. keepCount 0 (disconnected, or
 * the setting) full-hibernates. When the soft-hide set is full, walk
 * candidates oldest-first and soft-hide the leaving session only after
 * `evict` reports success. A refusal (inline images stay soft-hidden) tries
 * the next candidate. If none can leave, the leaving session is fully
 * hibernated so protected renderers cannot grow the set without bound.
 * Wake replay order stays in resolveHibernateWakeHistory (#2762). Atlas
 * clear on a soft wake stays in wakeSoftHiddenRuntime (#1063).
 */
export function decideHiddenTabKeepCountAction(input: {
  keepCount: number;
  softHiddenCount: number;
  sessionId: string;
  /** Oldest soft-hidden session first. Snapshot this before evict mutates it. */
  candidatesOldestFirst: readonly string[];
  /** True only when that session actually left the soft-hidden set. */
  evict: (sessionId: string) => boolean;
}): HiddenTabKeepCountDecision {
  if (!(input.keepCount > 0)) {
    return { action: "full-hibernate", evictSessionId: null };
  }
  if (input.softHiddenCount < input.keepCount) {
    return { action: "soft-hide", evictSessionId: null };
  }
  for (const candidate of input.candidatesOldestFirst) {
    if (!candidate || candidate === input.sessionId) continue;
    if (input.evict(candidate)) {
      return { action: "soft-hide", evictSessionId: candidate };
    }
  }
  return { action: "full-hibernate", evictSessionId: null };
}

/** Snapshot + buffered output to replay when recreating xterm after hibernate. */
export type TerminalHibernateWakePayload = {
  /** Full serialized terminal state -- preferred wake history (coherent ANSI). */
  snapshot: string;
  /** Visible viewport rows; used with scrollback only when snapshot is empty. */
  viewportSnapshot?: string;
  /** Older scrollback rows; used with viewport only when snapshot is empty. */
  scrollbackSnapshot?: string;
  pendingBuffer: string;
  /** True when the pane was hibernated while a full-screen app owned the alt buffer. */
  alternateScreen: boolean;
};
