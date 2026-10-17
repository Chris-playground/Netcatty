"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { generateKeyPairSync } = require("node:crypto");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const net = require("node:net");
const { once } = require("node:events");
const { utils } = require("ssh2");
const { createAgent } = require("ssh2/lib/agent.js");
const { createNativeFidoAgent } = require("./fidoNativeAgent.cjs");
const askpass = require("./fidoAskpass.cjs");
const prompts = require("./fidoPromptHandler.cjs");
const run = promisify(execFile);

function key() {
  const pair = generateKeyPairSync("rsa", { modulusLength: 2048,
    privateKeyEncoding: { type: "pkcs1", format: "pem" },
    publicKeyEncoding: { type: "spki", format: "pem" } });
  return utils.parseKey(pair.privateKey);
}

function sign(agent, key, data) {
  return new Promise((resolve, reject) => agent.sign(key, data, { hash: "sha256" },
    (error, signature) => error ? reject(error) : resolve(signature)));
}

test("native agent sockets attribute concurrent helper subprocess prompts to their signing windows", async () => {
  const selected = key();
  const seen = [];
  const proxies = [];
  const envs = [];
  try {
    for (const id of [2823, 2824]) {
      const sender = { id, isDestroyed: () => false, send(channel, request) {
        if (channel !== "netcatty:fido-prompt-request") return;
        seen.push(id);
        queueMicrotask(() => prompts.handleResponse({ sender }, {
          requestId: request.requestId, response: `test-pin-${id}`, cancelled: false,
        }));
      } };
      const env = askpass.buildFidoAskpassEnv({ resolveWebContents: () => sender });
      envs.push(env);
      const wrapped = {
        getIdentities: callback => callback(null, [selected]),
        sign(publicKey, data, flags, callback) {
          askpass.runWithFidoSigningLease(env.NETCATTY_FIDO_ASKPASS_LEASE, finish => {
            const { NETCATTY_FIDO_ASKPASS_LEASE: _lease, ...helperEnv } = env;
            // Real generated helper subprocess, with the shared agent's
            // leaseless environment, as OpenSSH's ssh-sk-helper would use it.
            run(process.execPath, [askpass.ensureFidoAskpass().scriptPath, "Enter PIN for authenticator:"], {
              env: { ...process.env, ...helperEnv }, timeout: 10000,
            }).then(result => {
              assert.equal(result.stdout.trim(), `test-pin-${id}`);
              finish();
              callback(null, selected.sign(data, flags.hash));
            }, error => { finish(); callback(error); });
          });
        },
      };
      proxies.push(await createNativeFidoAgent(wrapped));
    }
    const data = Buffer.from("native SSH signing request");
    const signatures = await Promise.all(proxies.map(proxy => sign(createAgent(proxy.socketPath), selected, data)));
    assert.deepEqual(seen, [2823, 2824]);
    for (const signature of signatures) assert.equal(selected.verify(data, signature, "sha256"), true);
  } finally {
    for (const proxy of proxies) proxy.close();
    for (const env of envs) askpass.releaseFidoAskpassLease(env.NETCATTY_FIDO_ASKPASS_LEASE);
    askpass.shutdownFidoAskpass();
  }
});

test("native agent rejects signing identities outside the session selection and closes on release", async () => {
  const selected = key();
  const unrelated = key();
  let signCalls = 0;
  const proxy = await createNativeFidoAgent({
    getIdentities: callback => callback(null, [selected]),
    sign: () => { signCalls += 1; },
  });
  try {
    const client = createAgent(proxy.socketPath);
    await assert.rejects(sign(client, unrelated, Buffer.from("unauthorized")), /failure/);
    assert.equal(signCalls, 0);
  } finally { proxy.close(); }
  await assert.rejects(new Promise((resolve, reject) => createAgent(proxy.socketPath).getIdentities(
    error => error ? reject(error) : resolve())), /Failed to connect to agent/);
});

test("unsupported OpenSSH extensions do not corrupt the following identity request", { timeout: 5000 }, async () => {
  const selected = key();
  const proxy = await createNativeFidoAgent({ getIdentities: callback => callback(null, [selected]) });
  const socket = net.createConnection(proxy.socketPath);
  function frame(type, payload = Buffer.alloc(0)) {
    const buffer = Buffer.alloc(5 + payload.length);
    buffer.writeUInt32BE(1 + payload.length);
    buffer[4] = type;
    payload.copy(buffer, 5);
    return buffer;
  }
  try {
    await once(socket, "connect");
    const responses = new Promise((resolve, reject) => {
      let buffered = Buffer.alloc(0);
      const types = [];
      socket.on("error", reject);
      socket.on("data", chunk => {
        buffered = Buffer.concat([buffered, chunk]);
        while (buffered.length >= 5 && buffered.length >= 4 + buffered.readUInt32BE()) {
          types.push(buffered[4]);
          buffered = buffered.subarray(4 + buffered.readUInt32BE());
        }
        if (types.length >= 2) resolve(types);
      });
    });
    // Send an unknown extension with a payload, immediately followed by a
    // valid identities query on the same native-agent connection.
    socket.write(Buffer.concat([frame(27, Buffer.from("unsupported-extension-payload")), frame(11)]));
    assert.deepEqual(await responses, [5, 12]);
  } finally { socket.destroy(); proxy.close(); }
});
