"use strict";

const http = require("node:http");
const net = require("node:net");
const { describe, it, afterEach } = require("node:test");
const assert = require("node:assert/strict");

const { Client } = require("@modelcontextprotocol/sdk/client/index.js");
const { StreamableHTTPClientTransport } = require("@modelcontextprotocol/sdk/client/streamableHttp.js");

const { createExternalMcpHttpServer } = require("./httpServer.cjs");
const { EXTERNAL_MCP_CHAT_SESSION_ID } = require("../../cli/externalMcpDiscoveryPath.cjs");

const TOKEN = "test-bearer-token";

function postJson(url, { token, host, origin, body }) {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const payload = JSON.stringify(body);
    const headers = {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      "Content-Length": Buffer.byteLength(payload),
    };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (host) headers.Host = host;
    if (origin) headers.Origin = origin;
    const req = http.request({
      hostname: target.hostname,
      port: target.port,
      path: target.pathname,
      method: "POST",
      headers,
    }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        resolve({
          status: res.statusCode,
          body: Buffer.concat(chunks).toString("utf8"),
        });
      });
    });
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

async function startServer(overrides = {}) {
  const calls = [];
  const server = createExternalMcpHttpServer({
    getToken: () => TOKEN,
    isEnabled: () => true,
    dispatchRpc: async (method, params, context) => {
      calls.push({ method, params, context });
      if (method === "netcatty/exec") {
        return { ok: true, stdout: "from-handler", stderr: "", exitCode: 0 };
      }
      if (method === "netcatty/getContext") {
        return { hosts: [] };
      }
      return { ok: true };
    },
    ...overrides,
  });
  const state = await server.start({ host: "127.0.0.1", port: 0 });
  return {
    server,
    calls,
    url: `http://127.0.0.1:${state.port}/mcp`,
    port: state.port,
  };
}

describe("external MCP streamable HTTP server", () => {
  let active = null;

  afterEach(async () => {
    if (active) {
      await active.server.stop();
      active = null;
    }
  });

  it("rejects missing and wrong bearer tokens with the same status", async () => {
    active = await startServer();
    const body = { jsonrpc: "2.0", id: 1, method: "initialize", params: {} };
    const missing = await postJson(active.url, { body });
    const wrong = await postJson(active.url, { token: "nope", body });
    assert.equal(missing.status, 401);
    assert.equal(wrong.status, 401);
    assert.equal(missing.body, wrong.body);
    assert.equal(active.calls.length, 0);
  });

  it("rejects a rebinding Host and a foreign Origin before any tool dispatch", async () => {
    active = await startServer();
    const body = { jsonrpc: "2.0", id: 1, method: "initialize", params: {} };
    const host = await postJson(active.url, {
      token: TOKEN,
      host: `evil.example:${active.port}`,
      body,
    });
    const origin = await postJson(active.url, {
      token: TOKEN,
      origin: "https://evil.example",
      body,
    });
    assert.equal(host.status, 421);
    assert.equal(origin.status, 403);
    assert.equal(active.calls.length, 0);
  });

  it("lists tools and dispatches terminal_execute through the shared RPC handler", async () => {
    active = await startServer();
    const client = new Client({ name: "netcatty-http-test", version: "1.0.0" });
    const transport = new StreamableHTTPClientTransport(new URL(active.url), {
      requestInit: { headers: { Authorization: `Bearer ${TOKEN}` } },
    });
    try {
      await client.connect(transport);
      const tools = await client.listTools();
      assert.ok(tools.tools.some((tool) => tool.name === "terminal_execute"));
      const result = await client.callTool({
        name: "terminal_execute",
        arguments: { sessionId: "sess-1", command: "pwd" },
      });
      assert.match(JSON.stringify(result), /from-handler/);
      const execCall = active.calls.find((call) => call.method === "netcatty/exec");
      assert.ok(execCall, "terminal_execute did not reach dispatchRpc");
      assert.equal(execCall.params.chatSessionId, EXTERNAL_MCP_CHAT_SESSION_ID);
      assert.equal(execCall.params.sessionId, "sess-1");
      assert.equal(execCall.params.command, "pwd");
      assert.ok(execCall.context.externalClient);
    } finally {
      await client.close();
    }
  });

  it("is not listening after stop", async () => {
    active = await startServer();
    const port = active.port;
    await active.server.stop();
    await assert.rejects(
      postJson(`http://127.0.0.1:${port}/mcp`, {
        token: TOKEN,
        body: { jsonrpc: "2.0", id: 1, method: "initialize", params: {} },
      }),
      (error) => error.code === "ECONNREFUSED",
    );
    assert.equal(active.server.getState().listening, false);
    active = null;
  });

  it("returns 413 before closing an oversized request", async () => {
    active = await startServer();
    const payload = Buffer.alloc((4 * 1024 * 1024) + 64, 0x61);
    const result = await new Promise((resolve, reject) => {
      const target = new URL(active.url);
      const req = http.request({
        hostname: target.hostname,
        port: target.port,
        path: target.pathname,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
          "Content-Length": payload.length,
          Authorization: `Bearer ${TOKEN}`,
        },
      }, (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          resolve({
            status: res.statusCode,
            body: Buffer.concat(chunks).toString("utf8"),
          });
        });
      });
      req.on("error", reject);
      req.end(payload);
    });
    assert.equal(result.status, 413);
    assert.match(result.body, /Payload too large/);
  });

  it("stop finishes while a client holds an incomplete request", async () => {
    active = await startServer();
    const socket = net.connect(active.port, "127.0.0.1");
    await new Promise((resolve, reject) => {
      socket.once("connect", resolve);
      socket.once("error", reject);
    });
    socket.write(`POST /mcp HTTP/1.1\r\nHost: 127.0.0.1:${active.port}\r\nContent-Length: 100\r\n\r\n`);
    let hung = false;
    const timer = setTimeout(() => {
      hung = true;
    }, 2000);
    await active.server.stop();
    clearTimeout(timer);
    socket.destroy();
    assert.equal(hung, false);
    assert.equal(active.server.getState().listening, false);
    active = null;
  });

  it("reports port in use instead of switching ports", async () => {
    const blocker = http.createServer((_req, res) => res.end("busy"));
    await new Promise((resolve) => blocker.listen(0, "127.0.0.1", resolve));
    const port = blocker.address().port;
    const server = createExternalMcpHttpServer({ getToken: () => TOKEN });
    active = { server, calls: [], url: "", port };
    await assert.rejects(
      server.start({ host: "127.0.0.1", port }),
      (error) => error.code === "EADDRINUSE",
    );
    assert.equal(server.getState().listening, false);
    await new Promise((resolve) => blocker.close(() => resolve()));
  });
});
