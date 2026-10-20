"use strict";

const fs = require("node:fs");
const net = require("node:net");

const { getCliDiscoveryFilePath } = require("./discoveryPath.cjs");
const { CAPABILITY_SURFACES } = require("../capabilities/constants.cjs");
const { createNdjsonRpcClient } = require("../capabilities/rpcTransport.cjs");

function createError(code, message) {
  const err = new Error(message);
  err.code = code;
  return err;
}

function loadDiscovery() {
  const discoveryPath = getCliDiscoveryFilePath();
  let raw;
  try {
    raw = fs.readFileSync(discoveryPath, "utf8");
  } catch (err) {
    throw createError(
      "APP_NOT_RUNNING",
      `Netcatty discovery file is missing at ${discoveryPath}. `
      + "Either Netcatty is not running, or the discovery file was removed while Netcatty is still up; "
      + "Netcatty recreates it automatically within a few seconds — retry shortly, "
      + "or toggle the AI permission mode / restart Netcatty to regenerate it immediately. "
      + "Session data is not affected.",
    );
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw createError(
      "DISCOVERY_INVALID",
      `Netcatty discovery file at ${discoveryPath} is invalid JSON.`,
    );
  }

  if (!parsed?.port || !parsed?.token) {
    throw createError(
      "DISCOVERY_INVALID",
      `Netcatty discovery file at ${discoveryPath} is missing required port/token fields.`,
    );
  }

  return parsed;
}

// Restart-window race (#3443): the TCP bridge listens on an ephemeral port
// (`server.listen(0, "127.0.0.1")` in electron/bridges/mcpServerBridge.cjs)
// and rewrites the discovery file on every app launch. A CLI that reads the
// discovery file while the app is restarting can connect to a port that is
// already dead, or to a reused port whose token is stale, and fail until the
// chat is reopened.
//
// Retry a bounded number of times by re-reading the discovery file. Identity
// is port + token + pid (the same triple `isCliDiscoveryFileCurrent` uses),
// because the OS may hand the new bridge the same ephemeral port. A missing,
// unreadable, or unparseable file in this window is transient: the old host
// removes it before the new one writes it, so keep the remaining delays.
// Unchanged identity stops immediately instead of hammering the same bridge.
// At most two extra attempts (300ms + 900ms, ~1.2s). When every attempt
// fails, the original error is surfaced unchanged.
const CONNECT_RETRY_DELAYS_MS = [300, 900];

function discoveryIdentity(record) {
  return {
    port: record?.port,
    token: record?.token,
    pid: record?.pid,
  };
}

function sameDiscoveryIdentity(left, right) {
  return left?.port === right?.port
    && left?.token === right?.token
    && left?.pid === right?.pid;
}

// Stale token: the bridge returns `{ ok: false }` (AUTH_FAILED) or, in the
// live host, RPC -32001 "Authentication required. Send auth/verify with valid
// token first." Other RPC failures mean this bridge is current.
function isRetryableConnectError(err) {
  if (err?.code === "CONNECT_FAILED" || err?.code === "AUTH_FAILED") return true;
  return err?.code === "RPC_ERROR"
    && typeof err.message === "string"
    && err.message.includes("Authentication required");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function establishConnection(discovery) {
  const socket = await new Promise((resolve, reject) => {
    const sock = net.createConnection({ host: "127.0.0.1", port: discovery.port }, () => resolve(sock));
    sock.setEncoding("utf8");
    sock.once("error", (err) => {
      reject(createError("CONNECT_FAILED", `Failed to connect to Netcatty TCP bridge: ${err?.message || err}`));
    });
  });

  const client = createNdjsonRpcClient({
    socket,
    surface: CAPABILITY_SURFACES.BUILTIN,
    createError,
    messages: {
      connectionClosed: "Connection to Netcatty TCP bridge closed.",
      connectionClosedWhileCall: "Connection to Netcatty TCP bridge is closed.",
      connectionError: (error) => `Connection to Netcatty TCP bridge failed: ${error?.message || error}`,
      rpcTimeout: (method, timeoutMs) => (
        `Timed out waiting for Netcatty RPC response to "${method}" after ${timeoutMs}ms.`
      ),
      writeFailed: (method, error) => (
        `Failed to send Netcatty RPC "${method}": ${error?.message || error}`
      ),
    },
  });

  try {
    const authResult = await client.call("auth/verify", { token: discovery.token });
    if (!authResult?.ok) {
      throw createError("AUTH_FAILED", "Failed to authenticate to Netcatty TCP bridge.");
    }

    try {
      const statusResult = await client.call("netcatty/getStatus", {});
      client.ingestBridgeStatus(statusResult);
    } catch {
      // Keep the default RPC timeout when bridge status cannot be fetched.
    }

    return {
      discovery,
      async call(method, params) {
        return await client.call(method, params);
      },
      close() {
        client.close();
      },
    };
  } catch (err) {
    client.close();
    throw err;
  }
}

async function connectClient() {
  const discoveryPath = getCliDiscoveryFilePath();
  let discovery = loadDiscovery();
  let lastError = null;
  let attemptedIdentity = null;

  // Bounded retry: at most CONNECT_RETRY_DELAYS_MS.length extra attempts
  // (adds at most ~1.2s of latency in the worst case).
  for (let attempt = 0; attempt <= CONNECT_RETRY_DELAYS_MS.length; attempt += 1) {
    if (attempt > 0) {
      if (!discoveryPath) break;
      await sleep(CONNECT_RETRY_DELAYS_MS[attempt - 1]);
      let refreshed = null;
      try {
        refreshed = loadDiscovery();
      } catch {
        // Old host removed discovery.json, or the new one has not finished
        // writing a parseable file yet. Use the next bounded delay.
        continue;
      }
      if (sameDiscoveryIdentity(refreshed, attemptedIdentity)) break;
      discovery = refreshed;
    }

    attemptedIdentity = discoveryIdentity(discovery);
    try {
      return await establishConnection(discovery);
    } catch (err) {
      lastError = err;
      if (!isRetryableConnectError(err)) break;
    }
  }

  throw lastError;
}

module.exports = {
  connectClient,
  createError,
};
