type Listener = () => void;

const softHiddenSessions = new Map<string, number>();
const listeners = new Set<Listener>();
let evictionRequestSessionId: string | null = null;

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

  /**
   * Ask one soft-hidden session to upgrade. True only when it left the set
   * during the synchronous listener pass. A refusal, or a session with no
   * listener, leaves it soft-hidden and drops the request so a later emit
   * cannot upgrade it after the caller has moved on.
   */
  evictSoftHidden: (sessionId: string): boolean => {
    if (!softHiddenSessions.has(sessionId)) return false;
    evictionRequestSessionId = sessionId;
    emit();
    if (!softHiddenSessions.has(sessionId)) return true;
    if (evictionRequestSessionId === sessionId) evictionRequestSessionId = null;
    return false;
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
