import type { HostTerminalTarget } from '@netcatty/plugin-contract';
import { netcattyBridge } from '../services/netcattyBridge';

export type LiveTerminalSelectionTarget = HostTerminalTarget & { sessionId: string; rendererId: string; label: string };
export type TerminalSelectionSource = {
  target(): LiveTerminalSelectionTarget | null;
  read(): string;
};
const sources = new Map<string, TerminalSelectionSource>();
const MAX_BYTES = 4096;

// App renderer only. There is no plugin route to this registry or the terminal.
export function publishTerminalSelectionTarget() {
  const targets = [...sources.values()].map((source) => source.target()).filter((target) => target !== null);
  const target = targets.length === 1 ? targets[0] : { sessionId: null };
  const bridge = netcattyBridge.get();
  const diagnostics = import.meta.env?.VITE_NETCATTY_TERMINAL_TARGET_DIAGNOSTICS === '1';
  if (diagnostics) console.info('[Plugins:TerminalTarget] ' + JSON.stringify({ stage: 'renderer-publication', sourceCount: sources.size,
    eligibleCount: targets.length, apiAvailable: typeof bridge?.setPluginTerminalTarget === 'function', hasTarget: target.sessionId !== null }));
  void bridge?.setPluginTerminalTarget?.(target).then((accepted) => {
    if (diagnostics) console.info('[Plugins:TerminalTarget] ' + JSON.stringify({ stage: 'renderer-ack', accepted: accepted === true }));
  }).catch(() => {
    if (diagnostics) console.info('[Plugins:TerminalTarget] ' + JSON.stringify({ stage: 'renderer-ack', accepted: false }));
  });
}

export function registerTerminalSelectionSource(key: string, source: TerminalSelectionSource) {
  sources.set(key, source);
  publishTerminalSelectionTarget();
  return () => {
    if (sources.get(key) === source) sources.delete(key);
    publishTerminalSelectionTarget();
  };
}

export function readPluginTerminalSelection(sessionId: string, rendererId: string): string {
  const matches = [...sources.values()].filter((source) => {
    const target = source.target();
    return target?.sessionId === sessionId && target.rendererId === rendererId;
  });
  if (matches.length !== 1) throw new Error('The selected terminal is no longer visible and connected');
  const text = matches[0].read();
  if (typeof text !== 'string' || text.length === 0 || text.includes('\0') || new TextEncoder().encode(text).length > MAX_BYTES) {
    throw new Error('Select between 1 and 4096 bytes of terminal text');
  }
  return text;
}
