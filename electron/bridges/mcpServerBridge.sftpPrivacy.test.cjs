"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { createSftpHandlerApi } = require("./mcpServerBridge/sftpHandlers.cjs");
const { createAiPrivacyService } = require("../shared/aiPrivacyService.cjs");

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

const operations = [
  ["handleSftpList", {}],
  ["handleSftpRead", { path: "/synthetic" }],
  ["handleSftpWrite", { path: "/synthetic", content: "synthetic" }],
  ["handleSftpDownload", { remotePath: "/synthetic", localPath: "/synthetic-local" }],
  ["handleSftpUpload", { remotePath: "/synthetic", localPath: "/synthetic-local" }],
  ["handleSftpMkdir", { path: "/synthetic" }],
  ["handleSftpDelete", { path: "/synthetic" }],
  ["handleSftpRename", { oldPath: "/synthetic", newPath: "/synthetic-new" }],
  ["handleSftpStat", { path: "/synthetic" }],
  ["handleSftpChmod", { path: "/synthetic", mode: "600" }],
  ["handleSftpHome", {}],
];

for (const worker of [false, true]) {
  for (const [method, args] of operations) {
    test(`${method} blocks a policy change during ${worker ? "worker" : "main"} SFTP open`, async () => {
      const privacy = createAiPrivacyService();
      privacy.configure({ enabled: true });
      privacy.checkSession("chat");
      const entered = deferred();
      const release = deferred();
      const effects = [];
      const closed = [];
      const open = async () => {
        entered.resolve();
        await release.promise;
        return { sftpId: "synthetic-handle" };
      };
      const bridge = new Proxy({
        openSftpForSession: open,
        closeSftp: async (_event, payload) => { closed.push(payload); },
      }, {
        get: (target, key) => target[key] || (async (_event, payload) => { effects.push({ key, payload }); }),
      });
      const api = createSftpHandlerApi({
        sessions: new Map(worker ? [] : [["ssh", {}]]),
        terminalWorkerManager: worker ? {
          request: async (channel, payload) => {
            if (channel === "netcatty:sftp:openForSession") return open();
            if (channel === "netcatty:sftp:close") { closed.push(payload); return; }
            effects.push({ channel, payload });
          },
        } : null,
        sftpBridge: bridge,
        transferBridge: null,
        commandTimeoutMs: 1000,
        registerSftpOp: () => () => {},
        createTransferId: () => "synthetic-transfer",
        reportTransferEvent() {},
      });
      const pending = api[method]({ sessionId: "ssh", chatSessionId: "chat", ...args }, {
        beforeExecute: () => privacy.restore("chat", []),
      });
      const rejected = assert.rejects(pending, /start a new chat/);
      await entered.promise;
      privacy.configure({ enabled: false });
      release.resolve();
      await rejected;
      assert.deepEqual(effects, []);
      assert.equal(closed.length, 1, "the opened handle must still be released");
    });
  }
}

for (const method of ["handleSftpDownload", "handleSftpUpload"]) {
  for (const changePolicy of [false, true]) {
    test(`${method} ${changePolicy ? "blocks changed" : "preserves unchanged"} privacy after main transfer admission`, async () => {
      const privacy = createAiPrivacyService();
      privacy.configure({ enabled: true });
      privacy.checkSession("chat");
      const entered = deferred();
      const release = deferred();
      const effects = [];
      const opens = [];
      const closed = [];
      const admitted = [];
      const transferBridge = {
        getGlobalTransferConcurrency: () => 1,
        async runAdmittedTransfer(event, payload, _progress, runner) {
          admitted.push(payload);
          entered.resolve();
          await release.promise;
          return runner
            ? runner()
            : transferBridge.startTransfer(event, { ...payload, skipAdmission: true });
        },
        startTransfer(event, payload) {
          if (payload.skipAdmission !== true) {
            return transferBridge.runAdmittedTransfer(event, payload);
          }
          effects.push(payload);
          return Promise.resolve({ transferId: payload.transferId });
        },
      };
      const api = createSftpHandlerApi({
        sessions: new Map([["ssh", { hostId: "synthetic-host" }]]),
        terminalWorkerManager: null,
        sftpBridge: {
          openSftpForSession: async (_event, payload) => {
            opens.push(payload);
            return { sftpId: "synthetic-handle" };
          },
          closeSftp: async (_event, payload) => { closed.push(payload); },
        },
        transferBridge,
        commandTimeoutMs: 1000,
        registerSftpOp: () => () => {},
        createTransferId: () => "synthetic-transfer",
        reportTransferEvent() {},
      });
      const pending = api[method]({
        sessionId: "ssh", chatSessionId: "chat",
        remotePath: "/synthetic-remote", localPath: "/synthetic-local",
      }, { beforeExecute: () => privacy.restore("chat", []) });
      const rejected = changePolicy ? assert.rejects(pending, /start a new chat/) : null;
      await entered.promise;
      if (changePolicy) privacy.configure({ enabled: false });
      release.resolve();
      if (rejected) await rejected;
      else assert.equal((await pending).ok, true);
      assert.equal(admitted.length, 1, "the transfer must acquire only one admission slot");
      const hostField = method === "handleSftpDownload" ? "sourceHostId" : "targetHostId";
      assert.equal(admitted[0][hostField], "synthetic-host");
      assert.equal(admitted[0].globalConcurrency, 1);
      assert.equal(effects.length, changePolicy ? 0 : 1);
      assert.equal(opens.length, changePolicy ? 0 : 1);
      assert.equal(closed.length, opens.length);
      if (!changePolicy) assert.equal(effects[0].skipAdmission, true);
    });
  }
}
