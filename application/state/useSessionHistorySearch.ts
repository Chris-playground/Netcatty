import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { SessionHistorySearchTarget } from '../../domain/sessionHistorySearch';
import {
  createSessionHistorySearch,
  type SessionHistorySearchScan,
} from './sessionHistorySearch';

/** Search outside rendering, yielding between bounded slices for input/paint. */
export function useSessionHistorySearch<T extends SessionHistorySearchTarget>(
  sessions: readonly T[],
  query: string,
  untitledLabel: string,
): { filteredSessions: readonly T[]; isSearching: boolean } {
  const search = useMemo(() => createSessionHistorySearch(), []);
  const latest = useRef({ sessions, query, untitledLabel });
  const work = useRef<{
    query: string;
    untitledLabel: string;
    scan: SessionHistorySearchScan<T>;
  } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [result, setResult] = useState<{
    sessions: readonly T[];
    query: string;
    untitledLabel: string;
    filteredSessions: T[];
  } | null>(null);

  useLayoutEffect(() => {
    latest.current = { sessions, query, untitledLabel };
  }, [sessions, query, untitledLabel]);

  useEffect(() => {
    const cancel = () => {
      if (timer.current !== null) clearTimeout(timer.current);
      timer.current = null;
      work.current?.scan.dispose();
      work.current = null;
    };
    if (!query.trim()) {
      cancel();
      setResult(null);
      // Release deleted/replaced sessions without indexing any message bodies.
      search.filterSessionHistory(sessions, '');
      return;
    }
    if (work.current?.query !== query || work.current.untitledLabel !== untitledLabel) {
      cancel();
      work.current = { query, untitledLabel, scan: search.createScan<T>(query, { untitledLabel }) };
    }
    if (timer.current !== null) return;
    const job = work.current;
    const run = () => {
      timer.current = null;
      const current = latest.current;
      if (work.current !== job || current.query !== job.query || current.untitledLabel !== job.untitledLabel) return;
      const filteredSessions = job.scan.step(current.sessions);
      if (filteredSessions === null) {
        timer.current = setTimeout(run, 0);
      } else {
        setResult({ ...current, filteredSessions });
      }
    };
    // Even the first slice runs after the input's render/commit has returned.
    // Session updates reuse the in-flight query's match decisions, so one
    // streaming session cannot restart and starve a large history search.
    timer.current = setTimeout(run, 0);
  }, [sessions, query, untitledLabel, search]);

  useEffect(() => () => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
    work.current?.scan.dispose();
    work.current = null;
    search.clearSessionHistorySearchCache();
  }, [search]);

  if (!query.trim()) return { filteredSessions: sessions, isSearching: false };
  const sameQuery = result?.query === query && result.untitledLabel === untitledLabel;
  return {
    filteredSessions: sameQuery ? result.filteredSessions : [],
    isSearching: !sameQuery || result.sessions !== sessions,
  };
}
