type Listener = () => void;

const softHiddenSessions = new Map<string, number>();
const listeners = new Set<Listener>();
let evictionRequestSessionId: string | null = null;

type EvictionWaiter = {
  promise: Promise<boolean>;
  resolve: (completed: boolean) => void;
  settled: boolean;
};

const evictionWaiters = new Map<string, EvictionWaiter>();

function finishEviction(sessionId: string, completed: boolean): void {
  const waiter = evictionWaiters.get(sessionId);
  if (!waiter || waiter.settled) return;
  waiter.settled = true;
  evictionWaiters.delete(sessionId);
  if (evictionRequestSessionId === sessionId) evictionRequestSessionId = null;
  waiter.resolve(completed);
}

function emit(): void {
  listeners.forEach((listener) => listener());
}

function listSoftHiddenOldestFirst(): string[] {
  return [...softHiddenSessions.entries()]
    .sort((left, right) => left[1] - right[1])
    .map(([sessionId]) => sessionId);
}

export const terminalHiddenRendererStore = {
  getSoftHiddenCount: () => softHiddenSessions.size,

  isSoftHidden: (sessionId: string) => softHiddenSessions.has(sessionId),

  markSoftHidden: (sessionId: string) => {
    softHiddenSessions.set(sessionId, Date.now());
    emit();
  },

  clearSoftHidden: (sessionId: string) => {
    if (!softHiddenSessions.delete(sessionId)) return;
    emit();
  },

  listSoftHiddenOldestFirst: (): string[] => listSoftHiddenOldestFirst(),

  /** Returns the oldest soft-hidden session id when over the keep limit. */
  pickEvictionCandidate: (keepCount: number): string | null => {
    if (softHiddenSessions.size < keepCount) return null;
    return listSoftHiddenOldestFirst()[0] ?? null;
  },

  requestEviction: (sessionId: string) => {
    evictionRequestSessionId = sessionId;
    emit();
  },

  /** True while this session's hibernate has been requested and not settled. */
  hasPendingEviction: (sessionId: string): boolean => {
    const waiter = evictionWaiters.get(sessionId);
    return waiter != null && !waiter.settled;
  },

  /**
   * Ask one soft-hidden session to upgrade. Resolves true only when
   * settleEviction reports that hibernation finished. Clearing the marker
   * during wake is not success: drain, snapshot, or alternate-screen failure
   * can still restore that renderer. A synchronous refusal (marker still
   * present, including inline images) resolves false and drops an unconsumed
   * request so a later emit cannot upgrade it.
   */
  evictSoftHidden: (sessionId: string): Promise<boolean> => {
    const existing = evictionWaiters.get(sessionId);
    if (existing) return existing.promise;
    if (!softHiddenSessions.has(sessionId)) return Promise.resolve(false);

    let resolvePromise!: (completed: boolean) => void;
    const promise = new Promise<boolean>((resolve) => {
      resolvePromise = resolve;
    });
    const waiter: EvictionWaiter = { promise, resolve: resolvePromise, settled: false };
    evictionWaiters.set(sessionId, waiter);
    evictionRequestSessionId = sessionId;
    emit();
    if (!waiter.settled && softHiddenSessions.has(sessionId)) {
      finishEviction(sessionId, false);
    }
    return promise;
  },

  /** Record whether the in-flight eviction's hibernate actually completed. */
  settleEviction: (sessionId: string, completed: boolean) => {
    finishEviction(sessionId, completed);
  },

  consumeEvictionRequest: (sessionId: string): boolean => {
    if (evictionRequestSessionId !== sessionId) return false;
    evictionRequestSessionId = null;
    return true;
  },

  subscribe: (listener: Listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};
