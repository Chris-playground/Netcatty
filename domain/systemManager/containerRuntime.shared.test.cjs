"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildContainerExecShellCommand,
  buildContainerLogsCommand,
  buildKubectlDeletePodCommand,
  buildKubectlDescribeCommand,
  buildKubectlExecShellCommand,
  buildKubectlLogsCommand,
  buildKubectlNamespacesCommand,
  buildKubectlPodsCommand,
  buildRuntimeCommand,
  firstContainerRuntime,
  formatPodAge,
  isRuntimeSocketPermissionError,
  parseKubeconfigContexts,
  parseKubectlPodList,
  parseNamespaceList,
  parseRuntimeProbe,
  pickContainerSource,
  sourcesFromCapabilities,
  isKubectlForbiddenError,
} = require("./containerRuntime.shared.cjs");

test("parseRuntimeProbe reads line-anchored command -v markers", () => {
  const probe = parseRuntimeProbe([
    "command -v docker >/dev/null && printf __NC_DOCKER__=1",
    "__NC_OS__=Linux",
    "__NC_DOCKER__=1",
    "__NC_PODMAN__=1",
    "echo __NC_NERDCTL__=1 trailing",
    "__NC_KUBECTL__=1",
  ].join("\n"));

  assert.deepEqual(probe, {
    docker: true,
    podman: true,
    nerdctl: false,
    kubernetes: true,
  });
  assert.deepEqual(sourcesFromCapabilities(probe), ["docker", "podman", "kubernetes"]);
});

test("sourcesFromCapabilities keeps a stable runtime order and ignores a docker-only host's missing peers", () => {
  assert.deepEqual(sourcesFromCapabilities({ hasDocker: true }), ["docker"]);
  assert.deepEqual(
    sourcesFromCapabilities({ hasNerdctl: true, hasKubectl: true, hasPodman: true }),
    ["podman", "nerdctl", "kubernetes"],
  );
  assert.deepEqual(sourcesFromCapabilities(undefined), []);
});

test("pickContainerSource remembers the last choice per host and falls back when it disappears", () => {
  assert.equal(
    pickContainerSource(["docker", "podman", "kubernetes"], null, "podman"),
    "podman",
  );
  assert.equal(
    pickContainerSource(["docker", "podman"], "kubernetes", "podman"),
    "podman",
  );
  assert.equal(
    pickContainerSource(["docker", "podman", "kubernetes"], "kubernetes", "docker"),
    "kubernetes",
  );
  assert.equal(pickContainerSource(["nerdctl"], null, "docker"), "nerdctl");
  assert.equal(firstContainerRuntime(["kubernetes", "podman"]), "podman");
  assert.equal(firstContainerRuntime(["kubernetes"]), null);
});

test("buildRuntimeCommand uses the detected CLI and defaults unknown runtimes to docker", () => {
  assert.equal(buildRuntimeCommand("docker", "ps -a --format '{{json .}}'"), "docker ps -a --format '{{json .}}'");
  assert.equal(buildRuntimeCommand("podman", "start abc123"), "podman start abc123");
  assert.equal(buildRuntimeCommand("nerdctl", "logs -f --tail 200 abc123"), "nerdctl logs -f --tail 200 abc123");
  assert.equal(buildRuntimeCommand("kubernetes", "ps"), "docker ps");
  assert.equal(buildRuntimeCommand(undefined, "inspect abc"), "docker inspect abc");
});

test("interactive container commands keep the docker sudo probe and swap the binary", () => {
  const dockerShell = buildContainerExecShellCommand("docker", "587abcdef123");
  assert.match(dockerShell, /^sh -c /);
  assert.match(dockerShell, /docker inspect 587abcdef123/);
  assert.match(dockerShell, /exec docker exec -it 587abcdef123/);
  assert.match(dockerShell, /exec sudo docker exec -it 587abcdef123/);
  assert.match(dockerShell, /permission\\ denied.*docker\.sock.*docker\.sock.*permission\\ denied/);
  assert.equal(dockerShell.includes("\n"), false);
  assert.doesNotMatch(dockerShell, /sudo -S/);

  const podmanLogs = buildContainerLogsCommand("podman", "587abcdef123");
  assert.match(podmanLogs, /podman inspect 587abcdef123/);
  assert.match(podmanLogs, /exec podman logs -f --tail 200 587abcdef123/);
  assert.match(podmanLogs, /exec sudo podman logs -f --tail 200 587abcdef123/);
  assert.match(podmanLogs, /podman\.sock/);
  assert.doesNotMatch(podmanLogs, /docker/);

  const nerdctlShell = buildContainerExecShellCommand("nerdctl", "abc");
  assert.match(nerdctlShell, /exec nerdctl exec -it abc/);
  assert.match(nerdctlShell, /exec sudo nerdctl exec -it abc/);
  assert.match(nerdctlShell, /containerd\.sock/);
});

test("socket permission fallback is specific to each runtime", () => {
  assert.equal(
    isRuntimeSocketPermissionError("docker", { stderr: "dial unix /var/run/docker.sock: connect: permission denied" }),
    true,
  );
  assert.equal(
    isRuntimeSocketPermissionError("docker", { stderr: "permission denied" }),
    false,
  );
  assert.equal(
    isRuntimeSocketPermissionError("podman", { stderr: "dial unix /run/podman/podman.sock: connect: permission denied" }),
    true,
  );
  assert.equal(
    isRuntimeSocketPermissionError("nerdctl", { stderr: "dial unix /run/containerd/containerd.sock: connect: permission denied" }),
    true,
  );
  assert.equal(
    isRuntimeSocketPermissionError("podman", { stderr: "dial unix /var/run/docker.sock: connect: permission denied" }),
    false,
  );
});

test("parseKubeconfigContexts returns names and namespaces without user material", () => {
  const parsed = parseKubeconfigContexts(JSON.stringify({
    "current-context": "kind-kind",
    contexts: [
      {
        name: "kind-kind",
        context: { cluster: "kind-kind", user: "kind-kind", namespace: "app" },
      },
      {
        name: "arn:aws:eks:us-west-2:123:cluster/prod",
        context: { cluster: "prod", user: "admin" },
      },
    ],
    users: [{ name: "admin", user: { token: "secret-token" } }],
  }));

  assert.equal(parsed.current, "kind-kind");
  assert.deepEqual(parsed.contexts, [
    { name: "kind-kind", namespace: "app", current: true },
    { name: "arn:aws:eks:us-west-2:123:cluster/prod", namespace: "default", current: false },
  ]);
  assert.equal(JSON.stringify(parsed).includes("secret-token"), false);
});

test("parseNamespaceList skips a bracketed banner before the JSON object", () => {
  const names = parseNamespaceList([
    "[WARN] connection is using an insecure certificate",
    '{"items":[{"metadata":{"name":"default"}}]}',
  ].join("\n"));
  assert.deepEqual(names, ["default"]);
});

test("parseNamespaceList reads metadata names and ignores kubectl warnings before the JSON", () => {
  const stdout = "Warning: old client\n" + JSON.stringify({
    items: [
      { metadata: { name: "default" } },
      { metadata: { name: "kube-system" } },
      { metadata: {} },
    ],
  });
  assert.deepEqual(parseNamespaceList(stdout), ["default", "kube-system"]);
});

test("parseKubectlPodList reports status, restarts, age, and containers", () => {
  const now = Date.parse("2026-10-20T00:10:00Z");
  const pods = parseKubectlPodList(JSON.stringify({
    items: [
      {
        metadata: {
          name: "api",
          namespace: "default",
          creationTimestamp: "2026-10-20T00:08:30Z",
        },
        spec: {
          containers: [{ name: "app" }, { name: "sidecar" }],
          initContainers: [{ name: "init" }],
        },
        status: {
          phase: "Running",
          initContainerStatuses: [
            { name: "init", restartCount: 0, state: { terminated: { reason: "Completed" } } },
          ],
          containerStatuses: [
            { name: "app", restartCount: 4, state: { waiting: { reason: "CrashLoopBackOff" } } },
            { name: "sidecar", restartCount: 1, state: { running: {} } },
          ],
        },
      },
      {
        metadata: {
          name: "batch",
          namespace: "jobs",
          creationTimestamp: "2026-10-18T00:10:00Z",
        },
        spec: { containers: [{ name: "worker" }] },
        status: {
          phase: "Succeeded",
          containerStatuses: [
            { name: "worker", restartCount: 0, state: { terminated: { reason: "Completed" } } },
          ],
        },
      },
    ],
  }), now);

  assert.deepEqual(pods, [
    {
      name: "api",
      namespace: "default",
      status: "CrashLoopBackOff",
      restarts: 5,
      age: "1m",
      containers: ["app", "sidecar", "init"],
      shellContainers: ["sidecar"],
    },
    {
      name: "batch",
      namespace: "jobs",
      status: "Completed",
      restarts: 0,
      age: "2d",
      containers: ["worker"],
      shellContainers: [],
    },
  ]);
  assert.equal(formatPodAge("2026-10-20T00:09:10Z", now), "50s");
  assert.equal(formatPodAge("2026-10-20T00:07:00Z", now), "3m");
  assert.equal(formatPodAge("2026-10-19T22:10:00Z", now), "2h");
});

test("kubectl commands quote remote arguments and reject control characters", () => {
  assert.equal(
    buildKubectlPodsCommand("kind-kind", "default"),
    "kubectl --context 'kind-kind' -n 'default' get pods -o json",
  );
  assert.equal(
    buildKubectlNamespacesCommand("arn:aws:eks:us-west-2:123:cluster/prod"),
    "kubectl --context 'arn:aws:eks:us-west-2:123:cluster/prod' get namespaces -o json",
  );
  assert.equal(
    buildKubectlDeletePodCommand("ctx", "kube-system", "coredns-a"),
    "kubectl --context 'ctx' -n 'kube-system' delete pod 'coredns-a' --wait=false",
  );
  assert.equal(buildKubectlDeletePodCommand("ctx", "default", "bad\nname"), null);
  assert.equal(buildKubectlPodsCommand("ok", "bad\nns"), null);
  assert.equal(
    buildKubectlNamespacesCommand("o'brien", "powershell"),
    "kubectl --context 'o''brien' get namespaces -o json",
  );
  assert.equal(
    buildKubectlPodsCommand("o'brien", "default", "powershell"),
    "kubectl --context 'o''brien' -n 'default' get pods -o json",
  );
  assert.match(
    buildKubectlDeletePodCommand("o'brien", "default", "web", "cmd"),
    /--context "o'brien"/,
  );

  const quoted = buildKubectlDeletePodCommand("o'brien", "default", "web");
  assert.match(quoted, /--context 'o'"'"'brien'/);
  assert.doesNotMatch(quoted, /--context 'o'brien'/);

  const shell = buildKubectlExecShellCommand("kind-kind", "default", "api", "sidecar");
  assert.match(shell, /^sh -c /);
  assert.match(shell, /kubectl/);
  assert.match(shell, /--context/);
  assert.match(shell, /kind-kind/);
  assert.match(shell, /-n/);
  assert.match(shell, /default/);
  assert.match(shell, /exec -it/);
  assert.match(shell, /api/);
  assert.match(shell, /-c/);
  assert.match(shell, /sidecar/);
  assert.match(shell, /command -v bash/);
  assert.equal(shell.includes("\n"), false);

  const logs = buildKubectlLogsCommand("kind-kind", "default", "api", "app");
  assert.match(logs, /kubectl/);
  assert.match(logs, /logs -f --tail 200/);
  assert.match(logs, /kind-kind/);
  assert.match(logs, /app/);

  const described = buildKubectlDescribeCommand("kind-kind", "default", "api");
  assert.match(described, /kubectl/);
  assert.match(described, /describe pod/);
  assert.match(described, /kind-kind/);
  assert.match(described, /api/);
  assert.equal(buildKubectlExecShellCommand("kind-kind", "default", "bad\npod"), 'echo "Invalid pod name"');
});

test("kubectl popup commands skip the POSIX wrapper on Windows shells", () => {
  for (const shell of ["powershell", "cmd"]) {
    const exec = buildKubectlExecShellCommand("kind-kind", "default", "api", "sidecar", shell);
    const logs = buildKubectlLogsCommand("kind-kind", "default", "api", "app", shell);
    const described = buildKubectlDescribeCommand("kind-kind", "default", "api", shell);
    assert.equal(exec.startsWith("kubectl "), true, shell);
    assert.equal(logs.startsWith("kubectl "), true, shell);
    assert.equal(described.startsWith("kubectl "), true, shell);
    assert.equal(exec.startsWith("sh -c "), false, shell);
    assert.match(exec, /exec -it/);
    assert.match(exec, /sidecar/);
    assert.match(logs, /logs -f --tail 200/);
    assert.match(described, /describe pod/);
  }
  assert.match(
    buildKubectlExecShellCommand("kind-kind", "default", "api", "sidecar", "powershell"),
    /--context 'kind-kind'/,
  );
  assert.match(
    buildKubectlDescribeCommand("kind-kind", "default", "api", "cmd"),
    /--context "kind-kind"/,
  );
  assert.equal(
    buildKubectlDescribeCommand("prod-%USERNAME%", "default", "api", "cmd"),
    'echo "Invalid context"',
  );
  assert.match(
    buildKubectlDescribeCommand("prod-%USERNAME%", "default", "api", "powershell"),
    /--context 'prod-%USERNAME%'/,
  );
  assert.equal(
    buildKubectlNamespacesCommand("prod-%USERNAME%", "powershell"),
    "kubectl --context 'prod-%USERNAME%' get namespaces -o json",
  );
});

test("container popup commands inspect in the host shell on Windows", () => {
  const powershellLogs = buildContainerLogsCommand("podman", "abc123", "powershell");
  assert.equal(powershellLogs.startsWith("sh -c "), false);
  assert.match(powershellLogs, /^podman inspect abc123 >\$null;/);
  assert.match(powershellLogs, /podman logs -f --tail 200 abc123/);

  const cmdShell = buildContainerExecShellCommand("nerdctl", "abc123", "cmd");
  assert.equal(cmdShell.startsWith("sh -c "), false);
  assert.match(cmdShell, /^nerdctl inspect abc123 >nul && nerdctl exec -it abc123/);
  assert.match(cmdShell, /sh -c "command -v bash/);
});

test("isKubectlForbiddenError matches namespace list denial", () => {
  assert.equal(
    isKubectlForbiddenError('Error from server (Forbidden): namespaces is forbidden: User "view" cannot list resource "namespaces"'),
    true,
  );
  assert.equal(isKubectlForbiddenError("Unable to connect to the server"), false);
});
