/**
 * App-wide default proxy profile. Settings publish the saved id here so
 * `applyGroupDefaults` can apply it for every connection path, including
 * callers that pass empty group defaults.
 */
let activeId: string | undefined;
const listeners = new Set<() => void>();
let persistSetter: ((id: string | undefined) => void) | null = null;

export const normalizeGlobalDefaultProxyProfileId = (
  value: unknown,
): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
};

export const getActiveGlobalDefaultProxyProfileId = (): string | undefined => activeId;

export const publishActiveGlobalDefaultProxyProfileId = (value: unknown): void => {
  const next = normalizeGlobalDefaultProxyProfileId(value);
  if (next === activeId) return;
  activeId = next;
  for (const listener of listeners) listener();
};

export const subscribeActiveGlobalDefaultProxyProfileId = (
  listener: () => void,
): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const registerGlobalDefaultProxyProfileSetter = (
  setter: ((id: string | undefined) => void) | null,
): void => {
  persistSetter = setter;
};

/** Clear the saved global default and persist that choice when settings are mounted. */
export const clearActiveGlobalDefaultProxyProfile = (): void => {
  if (persistSetter) {
    persistSetter(undefined);
    return;
  }
  publishActiveGlobalDefaultProxyProfileId(undefined);
};
