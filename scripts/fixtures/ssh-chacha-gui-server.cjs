// Disposable GUI smoke fixture. No OS account or command execution is used.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { createRequire } = require("node:module");

const [appCheckout, credentialsPath] = process.argv.slice(2);
if (!appCheckout || !credentialsPath) {
  throw new Error("Usage: node ssh-chacha-gui-server.cjs APP_CHECKOUT CREDENTIALS_JSON");
}
const credentials = JSON.parse(fs.readFileSync(credentialsPath, "utf8"));
if (typeof credentials.username !== "string" || !credentials.username
    || typeof credentials.password !== "string" || !credentials.password) {
  throw new Error("The local fixture credentials file needs non-empty username and password fields");
}
const fromApp = createRequire(path.join(path.resolve(appCheckout), "package.json"));
const { Server } = fromApp("ssh2");
const CHACHA = "chacha20-poly1305@openssh.com";
const MARKER = "NETCATTY_CHACHA_SMOKE";
const { privateKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
const clients = new Set();
let nextConnectionId = 0;
const log = (event) => console.log(JSON.stringify(event));

const server = new Server({
  hostKeys: [privateKey.export({ type: "pkcs1", format: "pem" })],
  algorithms: { cipher: [CHACHA] },
  debug(line) {
    const offer = /Handshake: \(remote\) (C->S|S->C) cipher: (.*)/.exec(line);
    if (offer) log({ event: "client-offer", direction: offer[1], ciphers: offer[2].split(",") });
  },
}, (client) => {
  const connectionId = ++nextConnectionId;
  clients.add(client);
  client.on("close", () => clients.delete(client));
  client.on("error", () => log({ event: "transport-error", connectionId }));
  client.on("handshake", (info) => log({
    event: "negotiated", connectionId,
    clientToServer: info.cs.cipher, serverToClient: info.sc.cipher,
  }));
  client.on("authentication", (ctx) => {
    if (ctx.method === "password" && ctx.username === credentials.username
        && ctx.password === credentials.password) {
      log({ event: "authenticated", connectionId, method: "password" });
      ctx.accept();
    } else {
      ctx.reject(["password"]);
    }
  });
  client.on("ready", () => {
    client.on("session", (accept) => {
      const session = accept();
      session.on("pty", (acceptPty) => acceptPty?.());
      session.on("env", (acceptEnv) => acceptEnv?.());
      session.on("exec", (_acceptExec, rejectExec) => rejectExec());
      session.on("shell", (acceptShell) => {
        const stream = acceptShell();
        let tail = "";
        let markerSeen = false;
        log({ event: "shell-open", connectionId });
        stream.write("SYNTHETIC CHACHA20 SMOKE READY\r\n");
        stream.on("data", (data) => {
          stream.write(data);
          const text = tail + data.toString("utf8");
          if (!markerSeen && text.includes(MARKER)) {
            markerSeen = true;
            log({ event: "echo-check", connectionId, marker: MARKER, matched: true });
          }
          tail = text.slice(-(MARKER.length - 1));
        });
      });
    });
  });
});

server.listen(0, "127.0.0.1", () => log({
  event: "listening", address: "127.0.0.1", port: server.address().port,
  serverCiphers: [CHACHA],
}));
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => {
  for (const client of clients) client.end();
  server.close(() => process.exit(0));
});
