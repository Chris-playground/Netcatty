// Runs in a separate Node/Electron process so ssh2 detects its actual crypto
// capabilities at module load. The parent owns the disposable loopback server.
const os = require("node:os");
const crypto = require("node:crypto");

async function main(config) {
  os.homedir = () => config.homeDir;
  delete process.env.SSH_AUTH_SOCK;
  delete process.env.SSH_AGENT_PID;
  if (config.withoutNativeChacha) {
    const getCiphers = crypto.getCiphers;
    crypto.getCiphers = () => getCiphers().filter((name) => name !== "chacha20");
    for (const name of ["createCipheriv", "createDecipheriv"]) {
      const original = crypto[name];
      crypto[name] = (algorithm, ...args) => {
        if (algorithm === "chacha20") throw new Error("Standalone ChaCha20 unavailable");
        return original(algorithm, ...args);
      };
    }
  }
  const bridge = require("../../electron/bridges/sshBridge.cjs");
  const sessions = new Map();
  let output = "";
  let resolveOutput;
  const echoed = new Promise((resolve) => { resolveOutput = resolve; });
  bridge.init({
    sessions,
    electronModule: {},
    terminalOutputChannel: {
      openSession() {},
      send(_sessionId, data) {
        output += data;
        if (output.length >= config.input.length) resolveOutput();
        return true;
      },
    },
  });
  const handlers = new Map();
  bridge.registerHandlers({ handle: (name, handler) => handlers.set(name, handler), on() {} });
  const sender = new (require("node:events").EventEmitter)();
  Object.assign(sender, { id: 1, isDestroyed: () => false, send() {} });
  try {
    const result = await handlers.get(config.entrypoint)({ sender }, {
      sessionId: "synthetic-chacha-test",
      hostname: "127.0.0.1",
      port: config.port,
      username: "synthetic",
      authMethod: "password",
      useSshAgent: false,
      verifyHostKeys: false,
      skipShellDiscovery: true,
      algorithmOverrides: config.algorithmOverrides,
    });
    if (config.entrypoint === "netcatty:start") {
      sessions.get(result.sessionId).stream.write(config.input);
      await echoed;
    }
    return {
      connected: true,
      echoed: output === config.input,
      electron: process.versions.electron,
      nativeChacha: crypto.getCiphers().includes("chacha20"),
    };
  } finally {
    for (const session of sessions.values()) session.conn?.destroy();
    bridge.stopAllMonitoring();
  }
}

let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (data) => { input += data; });
process.stdin.on("end", async () => {
  const config = JSON.parse(input);
  const timeout = setTimeout(() => process.exit(2), 10000);
  let result;
  try { result = await main(config); }
  catch (error) { result = { connected: false, error: error.message }; }
  clearTimeout(timeout);
  // Only public algorithm/runtime information leaves the synthetic client.
  console.log(`NETCATTY_TRANSPORT_RESULT=${JSON.stringify(result)}`);
});
