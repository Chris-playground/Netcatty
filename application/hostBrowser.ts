import type { Host, Identity, KnownHost, SSHKey, TerminalSettings } from '../domain/models';
import { netcattyBridge } from '../infrastructure/services/netcattyBridge';
import { startPortForward } from '../infrastructure/services/portForwardingService';
import { isValidHslToken } from './state/settingsStateDefaults';

interface OpenHostBrowserOptions {
  host: Host;
  hosts: Host[];
  keys: SSHKey[];
  identities: Identity[];
  knownHosts?: KnownHost[];
  terminalSettings?: Pick<TerminalSettings, 'verifyHostKeys' | 'keepaliveInterval' | 'keepaliveCountMax'>;
}

const pendingOpens = new Map<string, Promise<void>>();
const browserThemeTokens = ['background', 'foreground', 'secondary', 'muted', 'muted-foreground', 'border', 'primary', 'primary-foreground'] as const;

function currentBrowserThemeTokens(): Record<string, string> {
  const style = getComputedStyle(document.documentElement);
  return Object.fromEntries(browserThemeTokens.flatMap((token) => {
    const value = style.getPropertyValue(`--${token}`).trim();
    return isValidHslToken(value) ? [[token, value]] : [];
  }));
}

export function openHostBrowser(options: OpenHostBrowserOptions): Promise<void> {
  const { host, hosts, keys, identities, knownHosts, terminalSettings } = options;
  const existing = pendingOpens.get(host.id);
  if (existing) return existing;
  const opening = (async () => {
    const bridge = netcattyBridge.get();
    if (!bridge?.focusHostBrowser || !bridge.openHostBrowser || !bridge.startPortForward) {
      throw new Error('The host browser is unavailable in this build');
    }
    if (await bridge.focusHostBrowser(host.id)) return;
    const result = await startPortForward({
        id: `host-browser-${crypto.randomUUID()}`,
        label: `Browser via ${host.label || host.hostname}`,
        type: 'dynamic',
        hostId: host.id,
        localPort: 0,
        bindAddress: '127.0.0.1',
        status: 'inactive',
        createdAt: Date.now(),
    }, host, hosts, keys, identities, () => {}, false, terminalSettings,
    knownHosts, { dedicatedTransport: true, prepareOnly: true });
    if (!result.success || !result.connectionOptions) {
      throw new Error(result.error || 'Could not prepare the browser connection');
    }
    await bridge.openHostBrowser({
      hostId: host.id,
      label: host.label || host.hostname,
      theme: document.documentElement.classList.contains('dark') ? 'dark' : 'light',
      themeTokens: currentBrowserThemeTokens(),
      connectionOptions: result.connectionOptions,
    });
  })();
  pendingOpens.set(host.id, opening);
  void opening.finally(() => {
    if (pendingOpens.get(host.id) === opening) pendingOpens.delete(host.id);
  }).catch(() => {});
  return opening;
}
