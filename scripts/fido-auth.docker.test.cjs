"use strict";

// An independent Docker sshd verifies signatures made through the production
// Netcatty -> ssh-agent -> ssh-sk-helper -> software authenticator path.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { execFileSync, spawnSync } = require("node:child_process");
const { Client } = require("ssh2");
const { generateFidoSshKeyPair } = require("../electron/bridges/fidoSshKeygen.cjs");
const { enhanceAuthOptionsForFido, prepareSystemSshAgentForAuth } = require("../electron/bridges/sshAuthHelper.cjs");
const { shutdownFidoAgentSubsystem } = require("../electron/bridges/fidoAgentManager.cjs");
const prompts = require("../electron/bridges/fidoPromptHandler.cjs");
const askpass = require("../electron/bridges/fidoAskpass.cjs");
const tempDirBridge = require("../electron/bridges/tempDirBridge.cjs");

async function until(check, description) {
  const deadline = Date.now() + 5000;
  while (!check()) {
    if (Date.now() > deadline) throw new Error(`Timed out: ${description}`);
    await new Promise(resolve => setTimeout(resolve, 10));
  }
}

function exec(client, command) {
  return new Promise((resolve, reject) => client.exec(command, (error, channel) => {
    if (error) return reject(error);
    let output = "";
    channel.on("data", chunk => { output += chunk; });
    channel.on("error", reject);
    channel.on("close", code => code === 0 ? resolve(output) : reject(new Error(`exec exit ${code}`)));
  }));
}

test("Docker OpenSSH accepts only completed FIDO PIN/presence authentication", {
  skip: process.env.NETCATTY_FIDO_DOCKER !== "1", timeout: 180000,
}, async t => {
  const dir = fs.mkdtempSync(path.join(tempDirBridge.getTempDir(), "fd-"));
  const fixtures = path.join(dir, "server");
  fs.mkdirSync(fixtures, { mode: 0o755 });
  const authorized = path.join(fixtures, "authorized_keys");
  fs.writeFileSync(authorized, "", { mode: 0o644 });
  const control = path.join(dir, "control");
  const provider = path.join(dir, "provider.so");
  const wrapper = path.join(dir, "ssh-agent");
  const name = `netcatty-fido-${randomUUID().slice(0, 8)}`;
  const envKeys = ["SSH_SK_PROVIDER", "NETCATTY_SSH_AGENT_PATH", "NETCATTY_FIDO_SIM_CONTROL"];
  const oldEnv = Object.fromEntries(envKeys.map(key => [key, process.env[key]]));
  const docker = (...args) => {
    const result = spawnSync("docker", args, { encoding: "utf8", timeout: 120000 });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`docker ${args[0]}: ${result.stderr}`);
    // docker logs preserves the container's stdout/stderr streams.
    return result.stdout + (args[0] === "logs" ? result.stderr : "");
  };
  let started = false;
  let answer = "123456";
  let cancelPin = false;
  const seen = [];
  const dismissed = new Set();
  const sender = {
    id: 2823, isDestroyed: () => false,
    send(channel, request) {
      if (channel === "netcatty:fido-prompt-cancelled") dismissed.add(request.requestId);
      if (channel !== "netcatty:fido-prompt-request") return;
      seen.push(request);
      // Device notifications deliberately get NO renderer response.
      if (request.notificationOnly) return;
      queueMicrotask(() => prompts.handleResponse({ sender }, {
        requestId: request.requestId, response: answer, cancelled: cancelPin,
      }));
    },
  };
  try {
    docker("info", "--format", "{{.ServerVersion}}");
    docker("build", "--quiet", "-t", "netcatty-fido-test", path.join(__dirname, "fixtures/fido/docker"));
    docker("run", "--rm", "-d", "--name", name, "--publish", "127.0.0.1::2222",
      "--mount", `type=bind,source=${fixtures},target=/fixtures,readonly`, "netcatty-fido-test");
    started = true;
    const port = Number(JSON.parse(docker("inspect", name))[0].NetworkSettings.Ports["2222/tcp"][0].HostPort);
    await until(() => docker("logs", name).includes("Server listening"), "Docker sshd listening");
    execFileSync("cc", ["-shared", "-fPIC", "-DHAVE_STDINT_H",
      path.join(__dirname, "fixtures/fido/provider.c"), "-lcrypto", "-o", provider]);
    fs.writeFileSync(wrapper, `#!/bin/sh\nexec /usr/bin/ssh-agent -P '${provider}' "$@"\n`, { mode: 0o700 });
    Object.assign(process.env, {
      SSH_SK_PROVIDER: provider, NETCATTY_SSH_AGENT_PATH: wrapper, NETCATTY_FIDO_SIM_CONTROL: control,
    });

    for (const type of ["ED25519-SK", "ECDSA-SK"]) {
      for (const verifyRequired of [false, true]) {
        const label = `${type} / ${verifyRequired ? "PIN + touch" : "touch only"}`;
        const generated = await generateFidoSshKeyPair({ type, verifyRequired, resolveWebContents: () => sender });
        assert.equal(generated.success, true, generated.error);
        fs.writeFileSync(authorized, `${verifyRequired ? "verify-required " : ""}${generated.publicKey}\n`);
        const options = await enhanceAuthOptionsForFido({
          hostname: "127.0.0.1", port, username: "netcatty", privateKey: generated.privateKey,
          useSshAgent: false, identitiesOnly: true,
        }, sender);
        const agent = await prepareSystemSshAgentForAuth(options, "[DockerFido]");
        assert.ok(agent);
        async function attempt(action, { shouldPass = false, touchLater = false } = {}) {
          fs.rmSync(`${control}.waiting`, { force: true });
          fs.writeFileSync(control, action);
          const before = seen.length;
          const client = new Client();
          let ready = false;
          client.once("ready", () => { ready = true; });
          // Attach both outcomes before connecting: denied authentication is expected.
          const outcome = new Promise(resolve => {
            client.once("ready", () => resolve({ ready: true }));
            client.once("error", error => resolve({ error }));
          });
          try {
            client.connect({ host: "127.0.0.1", port, username: "netcatty", agent, readyTimeout: 12000 });
            if (touchLater) {
              await until(() => fs.existsSync(`${control}.waiting`), "authenticator waiting for touch");
              // A valid PIN or a notification is not sufficient to log in.
              await new Promise(resolve => setTimeout(resolve, 200));
              assert.equal(ready, false, "must wait for physical presence");
              await until(() => seen.slice(before).some(p => p.notificationOnly), "touch waiting notification");
              fs.writeFileSync(control, "touch");
            }
            const result = await outcome;
            if (shouldPass) {
              assert.equal(result.ready, true, result.error?.message);
              assert.equal(await exec(client, "printf docker-fido-ok"), "docker-fido-ok");
              const sftp = await new Promise((resolve, reject) => client.sftp((error, value) => error ? reject(error) : resolve(value)));
              const stat = await new Promise((resolve, reject) => sftp.stat("/fixtures/authorized_keys", (error, value) => error ? reject(error) : resolve(value)));
              assert.ok(stat.size > 0);
              sftp.end();
            } else {
              assert.equal(ready, false, "invalid authentication must not become ready");
              assert.match(result.error?.message || "", /authentication methods failed|agent|sign/i);
            }
            const current = seen.slice(before);
            assert.equal(current.filter(p => p.kind === "pin").length, verifyRequired ? 1 : 0);
            const notifications = current.filter(p => p.kind === "touch");
            assert.ok(notifications.every(p => p.notificationOnly === true));
            await until(() => notifications.every(p => dismissed.has(p.requestId)), "automatic notification dismissal");
          } finally {
            client.end();
            await until(() => prompts.getRequests().size === 0, "no stale prompt");
          }
        }
        try {
          await t.test(`${label}: gated login, automatic continuation, exec and SFTP`, () =>
            attempt("wait", { shouldPass: true, touchLater: true }));
          await t.test(`${label}: no touch is denied`, () => attempt("wait"));
          await t.test(`${label}: unplugged token is denied`, () => attempt("unplugged"));
          await t.test(`${label}: server rejects signature without presence flag`, () => attempt("no-up"));
          if (verifyRequired) {
            await t.test(`${label}: wrong PIN is denied`, async () => {
              answer = "000000";
              try { await attempt("touch"); } finally { answer = "123456"; }
            });
            await t.test(`${label}: cancelled PIN is denied`, async () => {
              cancelPin = true;
              try { await attempt("touch"); } finally { cancelPin = false; }
            });
            await t.test(`${label}: server rejects signature without verification flag`, () => attempt("no-uv"));
          }
          await t.test(`${label}: a fresh login still succeeds after failures`, () => attempt("touch", { shouldPass: true }));
        } finally { agent._releaseNetcattyFidoAgent?.(); }
      }
    }
    const logs = docker("logs", name);
    assert.match(logs, /Accepted publickey/);
    // These messages prove server-side UP/UV enforcement, independently of UI.
    assert.match(logs, /user presence.*requirement not met/);
    assert.match(logs, /user verification.*requirement not met/);
  } catch (error) {
    if (started) error.message += `\nDocker sshd log:\n${docker("logs", name)}`;
    throw error;
  } finally {
    shutdownFidoAgentSubsystem();
    askpass.shutdownFidoAskpass();
    if (started) docker("rm", "-f", name);
    for (const [key, value] of Object.entries(oldEnv)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
