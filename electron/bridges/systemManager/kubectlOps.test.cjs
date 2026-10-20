"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createKubectlOpsApi } = require("./kubectlOps.cjs");

test("background kubectl quotes for the executor, not the interactive cmd shell", async () => {
  const commands = [];
  const api = createKubectlOpsApi({
    execOnSession: async (_event, _sessionId, command) => {
      commands.push(command);
      return { success: true, stdout: '{"items":[]}', stderr: "", code: 0 };
    },
    isLocalSession: () => true,
    process: { platform: "win32" },
  });

  const result = await api.run(null, {
    sessionId: "local-cmd",
    op: "namespaces",
    context: "prod-$east",
    shell: "cmd",
  });

  assert.equal(result.success, true);
  assert.match(commands[0], /--context 'prod-\$east'/);
  assert.doesNotMatch(commands[0], /"/);

  await api.run(null, {
    sessionId: "local-cmd",
    op: "delete",
    context: "prod-$east",
    namespace: "kube-system",
    pod: "coredns-$east",
    shell: "cmd",
  });
  assert.match(commands[1], /--context 'prod-\$east'/);
  assert.match(commands[1], /-n 'kube-system'/);
  assert.match(commands[1], /delete pod 'coredns-\$east'/);
  assert.doesNotMatch(commands[1], /"/);
});

test("background kubectl on a remote session stays POSIX even when the payload asks for cmd", async () => {
  let command = "";
  const api = createKubectlOpsApi({
    execOnSession: async (_event, _sessionId, next) => {
      command = next;
      return { success: true, stdout: '{"items":[]}', stderr: "", code: 0 };
    },
    isLocalSession: () => false,
    process: { platform: "win32" },
  });

  await api.run(null, {
    sessionId: "ssh",
    op: "pods",
    context: "o'brien",
    namespace: "default",
    shell: "cmd",
  });

  assert.match(command, /--context 'o'"'"'brien'/);
  assert.doesNotMatch(command, /--context "o'brien"/);
});
