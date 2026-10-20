import { Box, Layers } from 'lucide-react';
import React, { memo, useEffect, useRef, useState } from 'react';
import { useI18n } from '../../application/i18n/I18nProvider';
import {
  readContainerRuntimePreference,
  writeContainerRuntimePreference,
} from '../../application/state/systemManager/containerRuntimePreference';
import { useStableTranslate } from '../../application/state/useSystemManager';
import type { useSystemManagerBackend } from '../../application/state/useSystemManagerBackend';
import type {
  ContainerRuntimeId,
  ContainerSourceId,
  KubeContextInfo,
} from '../../domain/systemManager/containerRuntime';
import {
  firstContainerRuntime,
  isKubectlForbiddenError,
  pickContainerSource,
  sourcesFromCapabilities,
} from '../../domain/systemManager/containerRuntime';
import type { SessionCapabilities } from '../../domain/systemManager/types';
import type { TerminalSession } from '../../types';
import { cn } from '../../lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { DockerContainersPanel } from './DockerContainersPanel';
import { DockerImagesPanel } from './DockerImagesPanel';
import { KubernetesPodsPanel } from './KubernetesPodsPanel';
import { SystemPanelShell } from './SystemPanelUi';

type Backend = ReturnType<typeof useSystemManagerBackend>;
type DockerSubTab = 'containers' | 'images';

const RUNTIME_LABEL: Record<ContainerSourceId, string> = {
  docker: 'systemManager.runtime.docker',
  podman: 'systemManager.runtime.podman',
  nerdctl: 'systemManager.runtime.nerdctl',
  kubernetes: 'systemManager.runtime.kubernetes',
};

interface DockerManagerTabProps {
  sessionId: string;
  parentSession: TerminalSession;
  capabilities?: SessionCapabilities;
  isVisible: boolean;
  warmupEnabled?: boolean;
  backend: Backend;
  listRefreshIntervalSec: number;
  statsRefreshIntervalSec: number;
}

function CompactSelect({
  value,
  options,
  ariaLabel,
  section,
  onChange,
}: {
  value: string;
  options: { id: string; label: string }[];
  ariaLabel: string;
  section: string;
  onChange: (value: string) => void;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger
        aria-label={ariaLabel}
        data-section={section}
        className="h-6 w-auto max-w-[9.5rem] gap-1 rounded border-border/40 bg-transparent px-2 py-0 text-[11px] shadow-none"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.id} value={option.id} className="text-xs">
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export const DockerManagerTab = memo(function DockerManagerTab({
  sessionId,
  parentSession,
  capabilities,
  isVisible,
  warmupEnabled = false,
  backend,
  listRefreshIntervalSec,
  statsRefreshIntervalSec,
}: DockerManagerTabProps) {
  const { t } = useI18n();
  const stableT = useStableTranslate();
  const [subTab, setSubTab] = useState<DockerSubTab>('containers');
  const hostKey = parentSession.hostId || sessionId;
  const detected = sourcesFromCapabilities(capabilities);
  const detectedKey = detected.join('|');
  const [source, setSource] = useState<ContainerSourceId | null>(() => {
    const remembered = readContainerRuntimePreference(hostKey);
    return pickContainerSource(detected, null, remembered?.source ?? null);
  });
  const [contextName, setContextName] = useState<string | null>(() => (
    readContainerRuntimePreference(hostKey)?.context ?? null
  ));
  const [namespaceName, setNamespaceName] = useState<string | null>(() => (
    readContainerRuntimePreference(hostKey)?.namespace ?? null
  ));
  const [contexts, setContexts] = useState<KubeContextInfo[]>([]);
  const [namespaces, setNamespaces] = useState<string[]>([]);
  const [scopeError, setScopeError] = useState<string | null>(null);
  const [scopeNonce, setScopeNonce] = useState(0);
  const skipPersist = useRef(true);
  const namespaceNameRef = useRef(namespaceName);
  namespaceNameRef.current = namespaceName;

  useEffect(() => {
    skipPersist.current = true;
    const remembered = readContainerRuntimePreference(hostKey);
    setSource(pickContainerSource(detected, null, remembered?.source ?? null));
    setContextName(remembered?.context ?? null);
    setNamespaceName(remembered?.namespace ?? null);
    setContexts([]);
    setNamespaces([]);
    setScopeError(null);
    // Detection is reconciled by the next effect so a host switch does not
    // keep the previous host's in-memory selection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hostKey]);

  useEffect(() => {
    setSource((current) => pickContainerSource(
      sourcesFromCapabilities(capabilities),
      current,
      readContainerRuntimePreference(hostKey)?.source ?? null,
    ));
  }, [capabilities, detectedKey, hostKey]);

  useEffect(() => {
    if (skipPersist.current) {
      skipPersist.current = false;
      return;
    }
    if (!source) return;
    const remembered = readContainerRuntimePreference(hostKey);
    const available = sourcesFromCapabilities(capabilities);
    const engine = source === 'kubernetes'
      ? (remembered?.engine ?? firstContainerRuntime(available) ?? undefined)
      : source;
    writeContainerRuntimePreference(hostKey, {
      source,
      engine,
      context: contextName || undefined,
      namespace: namespaceName || undefined,
    });
  }, [capabilities, contextName, hostKey, namespaceName, source]);

  useEffect(() => {
    if (source !== 'kubernetes') return undefined;
    let cancelled = false;
    void backend.kubectl({ sessionId, op: 'contexts' }).then((result) => {
      if (cancelled) return;
      if (!result.success || !result.contexts) {
        setContexts([]);
        setScopeError(result.error || stableT('systemManager.errors.loadKubernetes'));
        return;
      }
      setScopeError(null);
      const available = result.contexts;
      const kept = contextName && available.some((item) => item.name === contextName)
        ? contextName
        : null;
      const next = kept
        ?? available.find((item) => item.current)?.name
        ?? available[0]?.name
        ?? null;
      setContexts(available);
      setContextName(next);
      if (!kept) {
        const configured = available.find((item) => item.name === next)?.namespace || 'default';
        setNamespaceName(next ? configured : null);
        setNamespaces([]);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [backend, contextName, sessionId, source, scopeNonce, stableT]);

  useEffect(() => {
    if (source !== 'kubernetes' || !contextName) return undefined;
    let cancelled = false;
    void backend.kubectl({ sessionId, op: 'namespaces', context: contextName }).then((result) => {
      if (cancelled) return;
      if (!result.success || !result.namespaces) {
        const message = result.error || stableT('systemManager.errors.loadKubernetes');
        if (isKubectlForbiddenError(message)) {
          const configured = contexts.find((item) => item.name === contextName)?.namespace || 'default';
          const fallback = namespaceNameRef.current || configured;
          setScopeError(null);
          setNamespaceName((current) => current || fallback);
          setNamespaces([fallback]);
          return;
        }
        setScopeError(message);
        return;
      }
      setNamespaces(result.namespaces);
      setNamespaceName((current) => {
        if (current && result.namespaces?.includes(current)) return current;
        const configured = contexts.find((item) => item.name === contextName)?.namespace;
        if (configured && result.namespaces?.includes(configured)) return configured;
        if (result.namespaces?.includes('default')) return 'default';
        return result.namespaces?.[0] ?? null;
      });
    });
    return () => {
      cancelled = true;
    };
  }, [backend, contextName, contexts, sessionId, source, scopeNonce, stableT]);

  const tabs: { id: DockerSubTab; icon: typeof Box; label: string }[] = [
    { id: 'containers', icon: Box, label: t('systemManager.docker.subTabs.containers') },
    { id: 'images', icon: Layers, label: t('systemManager.docker.subTabs.images') },
  ];
  const runtime: ContainerRuntimeId = source && source !== 'kubernetes' ? source : 'docker';
  const showRuntimeSwitcher = source !== 'kubernetes' && detected.length > 1;
  const rememberedEngine = readContainerRuntimePreference(hostKey)?.engine;
  const backEngine = source === 'kubernetes'
    ? (rememberedEngine && detected.includes(rememberedEngine)
      ? rememberedEngine
      : firstContainerRuntime(detected))
    : null;

  return (
    <SystemPanelShell section="system-manager-docker">
      <div className="shrink-0 flex items-center gap-0.5 px-2 py-1 border-b border-border/30">
        {source !== 'kubernetes' && tabs.map(({ id, icon: Icon, label }) => (
          <button
            key={id}
            type="button"
            className={cn(
              'flex items-center gap-1.5 px-2 py-1 rounded text-[11px] transition-colors',
              subTab === id
                ? 'bg-muted text-foreground font-medium'
                : 'text-muted-foreground hover:text-foreground',
            )}
            onClick={() => setSubTab(id)}
          >
            <Icon size={12} />
            {label}
          </button>
        ))}
        {source === 'kubernetes' && backEngine && (
          <button
            type="button"
            data-section="container-runtime-back"
            className="flex items-center gap-1.5 px-2 py-1 rounded text-[11px] text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => setSource(backEngine)}
          >
            <Box size={12} />
            {t('systemManager.docker.subTabs.containers')}
          </button>
        )}
        <div className="flex-1" />
        {showRuntimeSwitcher && source && detected.includes(source) && (
          <CompactSelect
            value={source}
            ariaLabel={t('systemManager.runtime.switch')}
            section="container-runtime-switcher"
            options={detected.map((id) => ({ id, label: t(RUNTIME_LABEL[id]) }))}
            onChange={(value) => {
              if (value === 'docker' || value === 'podman' || value === 'nerdctl' || value === 'kubernetes') {
                setSource(value);
              }
            }}
          />
        )}
        {source === 'kubernetes' && (
          <div className="flex items-center gap-1" data-section="k8s-scope-selectors">
            {contextName && contexts.some((item) => item.name === contextName) && (
              <CompactSelect
                value={contextName}
                ariaLabel={t('systemManager.k8s.context')}
                section="k8s-context-select"
                options={contexts.map((item) => ({ id: item.name, label: item.name }))}
                onChange={(value) => {
                  setContextName(value);
                  const configured = contexts.find((item) => item.name === value)?.namespace ?? null;
                  setNamespaceName(configured);
                }}
              />
            )}
            {namespaceName && namespaces.includes(namespaceName) && (
              <CompactSelect
                value={namespaceName}
                ariaLabel={t('systemManager.k8s.namespace')}
                section="k8s-namespace-select"
                options={namespaces.map((name) => ({ id: name, label: name }))}
                onChange={setNamespaceName}
              />
            )}
          </div>
        )}
      </div>

      <div className="flex-1 min-h-0 flex flex-col">
        {source && source !== 'kubernetes' && (
          <>
            <div className={cn('flex-1 min-h-0 flex flex-col', subTab !== 'containers' && 'hidden')}>
              <DockerContainersPanel
                sessionId={sessionId}
                parentSession={parentSession}
                runtime={runtime}
                isVisible={isVisible && subTab === 'containers'}
                warmupEnabled={warmupEnabled || (isVisible && subTab !== 'containers')}
                backend={backend}
                listRefreshIntervalSec={listRefreshIntervalSec}
                statsRefreshIntervalSec={statsRefreshIntervalSec}
              />
            </div>
            <div className={cn('flex-1 min-h-0 flex flex-col', subTab !== 'images' && 'hidden')}>
              <DockerImagesPanel
                sessionId={sessionId}
                runtime={runtime}
                isVisible={isVisible && subTab === 'images'}
                warmupEnabled={warmupEnabled || (isVisible && subTab !== 'images')}
                backend={backend}
                listRefreshIntervalSec={listRefreshIntervalSec}
              />
            </div>
          </>
        )}
        {source === 'kubernetes' && (
          <KubernetesPodsPanel
            sessionId={sessionId}
            parentSession={parentSession}
            contextName={contextName}
            namespaceName={namespaceName}
            scopeError={scopeError}
            isVisible={isVisible}
            warmupEnabled={warmupEnabled}
            backend={backend}
            listRefreshIntervalSec={listRefreshIntervalSec}
            onReloadScopes={() => setScopeNonce((value) => value + 1)}
          />
        )}
      </div>
    </SystemPanelShell>
  );
});
