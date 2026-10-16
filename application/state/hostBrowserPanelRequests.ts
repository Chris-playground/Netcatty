import type { Host } from '../../domain/models';

export type HostBrowserPanelRequest = { host: Host; sessionId?: string };
type Listener = (request: HostBrowserPanelRequest) => void;
const listeners = new Set<Listener>();
let pending: HostBrowserPanelRequest | null = null;

export function requestHostBrowserPanel(request: HostBrowserPanelRequest): void {
  if (!listeners.size) { pending = request; return; }
  for (const listener of listeners) listener(request);
}

export function subscribeHostBrowserPanelRequests(listener: Listener): () => void {
  listeners.add(listener);
  if (pending) {
    const request = pending;
    pending = null;
    listener(request);
  }
  return () => { listeners.delete(listener); };
}
