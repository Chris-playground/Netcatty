"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createDockerOpsApi } = require("./dockerOps.cjs");

test("listContainers uses plain docker first even when a saved session password exists", async () => {
  const calls = [];
  const dockerOps = createDockerOpsApi({
    getSession: () => ({ systemManagerSudoPassword: "host-secret" }),
    execOnSession: async (_event, sessionId, command, timeoutMs, execOptions) => {
      calls.push({ sessionId, command, timeoutMs, execOptions });
      return {
        success: true,
        stdout: '{"ID":"abc123","Names":"web","Image":"nginx","State":"running"}\n',
        stderr: "",
        code: 0,
      };
    },
  });

  const result = await dockerOps.listContainers(null, "s1");

  assert.equal(result.success, true);
  assert.equal(result.containers.length, 1);
  assert.equal(calls.length, 1);
  assert.equal(
    calls[0].command,
    "docker ps -a --format '{{json .}}'",
  );
  assert.equal(calls[0].execOptions, undefined);
});

test("listContainers falls back to sudo when plain docker hits socket permission denial", async () => {
  const calls = [];
  const dockerOps = createDockerOpsApi({
    getSession: () => ({ systemManagerSudoPassword: "host-secret" }),
    execOnSession: async (_event, sessionId, command, timeoutMs, execOptions) => {
      calls.push({ sessionId, command, timeoutMs, execOptions });
      if (calls.length === 1) {
        return {
          success: true,
          stdout: "",
          stderr: "permission denied while trying to connect to the Docker daemon socket",
          code: 1,
        };
      }
      if (calls.length === 2) {
        return {
          success: true,
          stdout: "",
          stderr: "sudo: a password is required",
          code: 1,
        };
      }
      return {
        success: true,
        stdout: '{"ID":"abc123","Names":"web","Image":"nginx","State":"running"}\n',
        stderr: "",
        code: 0,
      };
    },
  });

  const result = await dockerOps.listContainers(null, "s1");

  assert.equal(result.success, true);
  assert.equal(result.containers.length, 1);
  assert.equal(calls.length, 3);
  assert.equal(calls[0].command, "docker ps -a --format '{{json .}}'");
  assert.equal(calls[0].execOptions, undefined);
  assert.equal(
    calls[1].command,
    "sudo docker ps -a --format '{{json .}}'",
  );
  assert.equal(calls[1].execOptions, undefined);
  assert.equal(
    calls[2].command,
    "sudo -S -p '' docker ps -a --format '{{json .}}'",
  );
  assert.deepEqual(calls[2].execOptions, { stdin: "host-secret\n" });
});

test("listContainers falls back to passwordless sudo when no saved password exists", async () => {
  const calls = [];
  const dockerOps = createDockerOpsApi({
    getSession: () => ({}),
    execOnSession: async (_event, sessionId, command, timeoutMs, execOptions) => {
      calls.push({ sessionId, command, timeoutMs, execOptions });
      if (calls.length === 1) {
        return {
          success: true,
          stdout: "",
          stderr: "Got permission denied while trying to connect to the Docker daemon socket",
          code: 1,
        };
      }
      return {
        success: true,
        stdout: '{"ID":"abc123","Names":"web","Image":"nginx","State":"running"}\n',
        stderr: "",
        code: 0,
      };
    },
  });

  const result = await dockerOps.listContainers(null, "s1");

  assert.equal(result.success, true);
  assert.equal(result.containers.length, 1);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].command, "docker ps -a --format '{{json .}}'");
  assert.equal(
    calls[1].command,
    "sudo docker ps -a --format '{{json .}}'",
  );
  assert.equal(calls[1].execOptions, undefined);
});

test("listContainers does not retry with transport auth passwords that were not saved for sudo autofill", async () => {
  const calls = [];
  const dockerOps = createDockerOpsApi({
    getSession: () => ({
      moshStatsAuth: { password: "interactive-mosh-password" },
      etStatsAuth: { password: "interactive-et-password" },
    }),
    execOnSession: async (_event, sessionId, command, timeoutMs, execOptions) => {
      calls.push({ sessionId, command, timeoutMs, execOptions });
      return {
        success: true,
        stdout: "",
        stderr: "permission denied while trying to connect to the Docker daemon socket",
        code: 1,
      };
    },
  });

  const result = await dockerOps.listContainers(null, "s1");

  assert.equal(result.success, false);
  assert.match(result.error, /permission denied/i);
  assert.equal(calls.length, 2);
  assert.equal(
    calls[1].command,
    "sudo docker ps -a --format '{{json .}}'",
  );
  assert.equal(calls[1].execOptions, undefined);
});

test("listContainers retries with explicit sudo autofill password on mosh or et sessions", async () => {
  const calls = [];
  const dockerOps = createDockerOpsApi({
    getSession: () => ({
      systemManagerSudoPassword: "saved-secret",
      moshStatsAuth: { password: "transport-secret" },
    }),
    execOnSession: async (_event, sessionId, command, timeoutMs, execOptions) => {
      calls.push({ sessionId, command, timeoutMs, execOptions });
      if (calls.length === 1) {
        return {
          success: true,
          stdout: "",
          stderr: "dial unix /var/run/docker.sock: connect: permission denied",
          code: 1,
        };
      }
      if (calls.length === 2) {
        return {
          success: true,
          stdout: "",
          stderr: "sudo: a password is required",
          code: 1,
        };
      }
      return {
        success: true,
        stdout: '{"ID":"abc123","Names":"web","Image":"nginx","State":"running"}\n',
        stderr: "",
        code: 0,
      };
    },
  });

  const result = await dockerOps.listContainers(null, "s1");

  assert.equal(result.success, true);
  assert.equal(calls.length, 3);
  assert.equal(
    calls[2].command,
    "sudo -S -p '' docker ps -a --format '{{json .}}'",
  );
  assert.deepEqual(calls[2].execOptions, { stdin: "saved-secret\n" });
});

test("docker image actions retry with sudo and send saved passwords through stdin", async () => {
  const calls = [];
  const dockerOps = createDockerOpsApi({
    getSession: () => ({ systemManagerSudoPassword: "pa'ss" }),
    execOnSession: async (_event, sessionId, command, timeoutMs, execOptions) => {
      calls.push({ sessionId, command, timeoutMs, execOptions });
      if (calls.length === 1) {
        return {
          success: true,
          stdout: "",
          stderr: "dial unix /var/run/docker.sock: connect: permission denied",
          code: 1,
        };
      }
      if (calls.length === 2) {
        return {
          success: true,
          stdout: "",
          stderr: "sudo: a password is required",
          code: 1,
        };
      }
      return { success: true, stdout: "deleted\n", stderr: "", code: 0 };
    },
  });

  const result = await dockerOps.imageAction(null, {
    sessionId: "s1",
    action: "rm",
    imageId: "sha256:abc123",
  });

  assert.equal(result.success, true);
  assert.equal(calls.length, 3);
  assert.equal(
    calls[2].command,
    "sudo -S -p '' docker rmi sha256abc123",
  );
  assert.deepEqual(calls[2].execOptions, { stdin: "pa'ss\n" });
});

test("listContainers runs podman and retries sudo only for the podman socket", async () => {
  const calls = [];
  const dockerOps = createDockerOpsApi({
    getSession: () => ({ systemManagerSudoPassword: "host-secret" }),
    execOnSession: async (_event, sessionId, command) => {
      calls.push({ sessionId, command });
      if (calls.length === 1) {
        return {
          success: true,
          stdout: "",
          stderr: "dial unix /run/podman/podman.sock: connect: permission denied",
          code: 1,
        };
      }
      return {
        success: true,
        stdout: '{"ID":"abc123","Names":["web"],"Image":"nginx","State":"running"}\n',
        stderr: "",
        code: 0,
      };
    },
  });

  const result = await dockerOps.listContainers(null, "s1", "podman");

  assert.equal(result.success, true);
  assert.equal(result.containers[0].name, "web");
  assert.equal(calls[0].command, "podman ps -a --format '{{json .}}'");
  assert.equal(calls[1].command, "sudo podman ps -a --format '{{json .}}'");
});

test("listImages reads Podman's JSON array and Docker's JSON lines", async () => {
  const podman = createDockerOpsApi({
    execOnSession: async () => ({
      success: true,
      stdout: `[
        {
          "Id": "abc123",
          "Names": ["docker.io/library/alpine:3.20"],
          "Size": 7340032,
          "Created": 1700000000,
          "Digest": "sha256:deadbeef"
        }
      ]`,
      stderr: "",
      code: 0,
    }),
  });
  const podmanResult = await podman.listImages(null, "s1", "podman");
  assert.equal(podmanResult.success, true);
  assert.equal(podmanResult.images.length, 1);
  assert.equal(podmanResult.images[0].repository, "docker.io/library/alpine");
  assert.equal(podmanResult.images[0].tag, "3.20");
  assert.equal(podmanResult.images[0].name, "docker.io/library/alpine:3.20");
  assert.equal(podmanResult.images[0].size, "7MB");
  assert.equal(podmanResult.images[0].digest, "sha256:deadbeef");

  const docker = createDockerOpsApi({
    execOnSession: async () => ({
      success: true,
      stdout: '{"ID":"fff","Repository":"nginx","Tag":"latest","Size":"10MB","CreatedAt":"2026-01-01"}\n',
      stderr: "",
      code: 0,
    }),
  });
  const dockerResult = await docker.listImages(null, "s1", "docker");
  assert.equal(dockerResult.images.length, 1);
  assert.equal(dockerResult.images[0].name, "nginx:latest");
  assert.equal(dockerResult.images[0].size, "10MB");
});

test("getStats reads Podman's JSON array and Docker's JSON lines", async () => {
  const podman = createDockerOpsApi({
    execOnSession: async () => ({
      success: true,
      stdout: JSON.stringify([{
        id: "abc123def456",
        name: "web",
        cpu_percent: "1.50%",
        mem_usage: "2MB / 1GB",
        mem_percent: "0.20%",
        net_io: "1kB / 2kB",
        block_io: "3kB / 4kB",
        pids: "4",
      }]),
      stderr: "",
      code: 0,
    }),
  });
  const podmanResult = await podman.getStats(null, { sessionId: "s1", ids: ["abc123def456"], runtime: "podman" });
  assert.equal(podmanResult.success, true);
  assert.equal(podmanResult.stats.length, 1);
  assert.equal(podmanResult.stats[0].id, "abc123def456");
  assert.equal(podmanResult.stats[0].name, "web");
  assert.equal(podmanResult.stats[0].cpuPercent, 1.5);
  assert.equal(podmanResult.stats[0].memUsage, "2MB / 1GB");
  assert.equal(podmanResult.stats[0].pids, 4);

  const docker = createDockerOpsApi({
    execOnSession: async () => ({
      success: true,
      stdout: '{"ID":"fff111","Name":"db","CPUPerc":"0.25%","MemUsage":"1MiB / 2GiB","MemPerc":"0.01%","NetIO":"0B / 0B","BlockIO":"0B / 0B","PIDs":"2"}\n',
      stderr: "",
      code: 0,
    }),
  });
  const dockerResult = await docker.getStats(null, { sessionId: "s1", runtime: "docker" });
  assert.equal(dockerResult.stats[0].id, "fff111");
  assert.equal(dockerResult.stats[0].cpuPercent, 0.25);
  assert.equal(dockerResult.stats[0].memUsage, "1MiB / 2GiB");
});
