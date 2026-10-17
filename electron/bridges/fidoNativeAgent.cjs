"use strict";

// Native OpenSSH clients must sign through the same caller-bound agent wrapper
// as ssh2. A raw singleton socket cannot attribute a request to its window.
const fs = require("node:fs");
const path = require("node:path");
const net = require("node:net");
const { randomUUID } = require("node:crypto");
const { AgentProtocol } = require("ssh2/lib/agent.js");

async function createNativeFidoAgent(agent) {
  const base = require("./tempDirBridge.cjs").getTempDir();
  const dir = await fs.promises.mkdtemp(path.join(base, "fn-"));
  const socketPath = process.platform === "win32"
    ? `\\\\.\\pipe\\netcatty-fido-native-${randomUUID()}`
    : path.join(dir, "agent.sock");
  const sockets = new Set();
  let closed = false;
  const server = net.createServer(socket => {
    sockets.add(socket);
    socket.on("error", () => {});
    socket.once("close", () => sockets.delete(socket));
    const protocol = new AgentProtocol(false);
    protocol.on("error", () => socket.destroy());
    const respond = operation => {
      if (!closed && !socket.destroyed && !protocol.destroyed) {
        try { operation(); } catch { socket.destroy(); }
      }
    };
    protocol.on("identities", request => {
      agent.getIdentities((error, keys) => respond(() => error
        ? protocol.failureReply(request) : protocol.getIdentitiesReply(request, keys)));
    });
    protocol.on("sign", (request, key, data, flags) => {
      // Enforce the selected identities for direct native signing requests too.
      agent.getIdentities((error, keys) => {
        if (closed || socket.destroyed) return;
        if (error || !Array.isArray(keys)
            || !keys.some(candidate => candidate.getPublicSSH().equals(key.getPublicSSH()))) {
          respond(() => protocol.failureReply(request));
          return;
        }
        agent.sign(key, data, flags, (signError, signature) => respond(() => signError
          ? protocol.failureReply(request) : protocol.signReply(request, signature)));
      });
    });
    socket.pipe(protocol).pipe(socket);
  });
  function close() {
    if (closed) return;
    closed = true;
    for (const socket of sockets) socket.destroy();
    server.close(() => fs.promises.rm(dir, { recursive: true, force: true }).catch(() => {}));
  }
  try {
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(socketPath, () => { server.removeListener("error", reject); resolve(); });
    });
    if (process.platform !== "win32") await fs.promises.chmod(socketPath, 0o600);
    server.on("error", close);
    return { socketPath, close };
  } catch (error) {
    close();
    await fs.promises.rm(dir, { recursive: true, force: true }).catch(() => {});
    throw error;
  }
}

module.exports = { createNativeFidoAgent };
