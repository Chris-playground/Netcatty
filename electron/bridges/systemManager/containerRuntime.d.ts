export type ContainerRuntimeId = "docker" | "podman" | "nerdctl";
export type ContainerSourceId = ContainerRuntimeId | "kubernetes";

export interface RuntimeProbeFlags {
  docker: boolean;
  podman: boolean;
  nerdctl: boolean;
  kubernetes: boolean;
}

export interface KubeContextInfo {
  name: string;
  namespace: string;
  current: boolean;
}

export interface KubectlPodInfo {
  name: string;
  namespace: string;
  status: string;
  restarts: number;
  age: string;
  containers: string[];
}

export function normalizeContainerRuntime(runtime: unknown): ContainerRuntimeId;
export function isContainerSource(value: unknown): value is ContainerSourceId;
export function runtimeBinary(runtime: unknown): string;
export function buildRuntimeCommand(runtime: unknown, args: string): string;
export function parseRuntimeProbe(stdout: string): RuntimeProbeFlags;
export function sourcesFromCapabilities(capabilities: {
  hasDocker?: boolean;
  hasPodman?: boolean;
  hasNerdctl?: boolean;
  hasKubectl?: boolean;
  docker?: boolean;
  podman?: boolean;
  nerdctl?: boolean;
  kubernetes?: boolean;
} | null | undefined): ContainerSourceId[];
export function pickContainerSource(
  detected: readonly ContainerSourceId[] | null | undefined,
  current: ContainerSourceId | null | undefined,
  remembered: ContainerSourceId | null | undefined,
): ContainerSourceId | null;
export function firstContainerRuntime(
  detected: readonly ContainerSourceId[] | null | undefined,
): ContainerRuntimeId | null;
export function isRuntimeSocketPermissionError(
  runtime: unknown,
  result: { stderr?: string; stdout?: string; error?: string } | null | undefined,
): boolean;
export function sanitizeContainerId(id: string): string;
export function buildContainerExecShellCommand(runtime: unknown, containerId: string): string;
export function buildContainerLogsCommand(runtime: unknown, containerId: string): string;
export function buildKubectlContextsCommand(): string;
export function buildKubectlNamespacesCommand(context: string): string | null;
export function buildKubectlPodsCommand(context: string, namespace: string): string | null;
export function buildKubectlDeletePodCommand(context: string, namespace: string, pod: string): string | null;
export function buildKubectlExecShellCommand(
  context: string,
  namespace: string,
  pod: string,
  container?: string,
): string;
export function buildKubectlLogsCommand(
  context: string,
  namespace: string,
  pod: string,
  container?: string,
): string;
export function buildKubectlDescribeCommand(context: string, namespace: string, pod: string): string;
export function parseKubeconfigContexts(jsonText: string): { contexts: KubeContextInfo[]; current: string };
export function parseNamespaceList(jsonText: string): string[];
export function parseKubectlPodList(jsonText: string, now?: number): KubectlPodInfo[];
export function formatPodAge(iso: string, now?: number): string;
