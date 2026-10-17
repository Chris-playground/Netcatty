"use strict";
// One in-memory sampler per physical authenticated transport. No persistence/logging.
const { buildEndpointKey } = require("../sshConnectionPool.cjs");
let states = new WeakMap();
const identities = new Map();
const MAX_SAMPLERS = 512;
function prune() {
  const now = Date.now();
  for (const [key, state] of identities) {
    state.points = state.points.filter((p) => now - p.at <= 30 * 60000);
    if (!state.pending && now - state.at > 30 * 60000) identities.delete(key);
  }
}
const cleanupTimer = setInterval(prune, 60000);
cleanupTimer.unref?.();
function stateFor(conn, endpoint) {
  const key = endpoint ? buildEndpointKey(endpoint) : null;
  let state = (key ? identities.get(key) : null) || states.get(conn);
  if (!state) {
    state = {
      context: { conn },
      pending: null,
      latest: null,
      at: 0,
      points: [],
      controller: null,
    };
  }
  states.set(conn, state);
  if (key) {
    identities.delete(key);
    identities.set(key, state);
    if (identities.size > MAX_SAMPLERS) {
      for (const [oldKey, oldState] of identities) {
        if (!oldState.pending && oldKey !== key) {
          oldState.points = [];
          identities.delete(oldKey);
          break;
        }
      }
    }
  }
  return state;
}
function appendPoint(state, result, now) {
  if (
    !result.success ||
    !result.stats ||
    now - (state.points.at(-1)?.at ?? 0) < 10000
  )
    return;
  const s = result.stats;
  state.points.push({
    at: now,
    cpu: s.cpu,
    memory: s.memTotal > 0 ? (s.memUsed / s.memTotal) * 100 : null,
    disk: s.diskPercent,
    rx: s.networkReady ? s.netRxSpeed : null,
    tx: s.networkReady ? s.netTxSpeed : null,
  });
  state.points = state.points
    .filter((p) => now - p.at <= 30 * 60000)
    .slice(-180);
}
async function sampleSharedStats(session, collect, now = Date.now()) {
  const conn = session.conn || session.moshStatsConn || session.etStatsConn;
  if (!conn) {
    const result = await collect(session);
    const companion = session.moshStatsConn || session.etStatsConn;
    if (companion && result.success) {
      const state = stateFor(companion);
      state.context.prevNetStats = session.prevNetStats;
      state.context.prevCpuStats = session.prevCpuStats;
      state.latest = result;
      state.at = Date.now();
    }
    return result;
  }
  const state = stateFor(conn, session._reuseEndpoint);
  if (state.pending) {
    if (!session._monitorStats) state.terminalJoined = true;
    return state.pending;
  }
  if (state.latest?.success && now - state.at < 4000) return state.latest;
  // Keep transport capabilities on the collection context; baseline is independent of a terminal.
  const companion = !session.conn;
  Object.assign(state.context, {
    conn: companion ? null : conn,
    moshStatsConn: session.moshStatsConn,
    etStatsConn: session.etStatsConn,
    type: session.type,
    singleChannelSsh: session.singleChannelSsh,
    hostname: session.hostname,
    _monitorStats: session._monitorStats,
  });
  state.controller = new AbortController();
  state.terminalJoined = !session._monitorStats;
  state.context.statsSignal = state.controller.signal;
  state.pending = Promise.resolve(collect(state.context))
    .then((result) => {
      if (!state.controller.signal.aborted) {
        state.latest = result;
        state.at = Date.now();
        appendPoint(state, result, state.at);
      }
      return result;
    })
    .finally(() => {
      state.pending = null;
      state.controller = null;
      // The cache retains measurements and baselines, never a live connection.
      state.context.conn = null;
      state.context.moshStatsConn = null;
      state.context.etStatsConn = null;
    });
  return state.pending;
}
function readSharedStats(conn) {
  const state = stateFor(conn);
  if (state.points[0] && Date.now() - state.points[0].at > 30 * 60000)
    state.points = state.points.filter((p) => Date.now() - p.at <= 30 * 60000);
  return { result: state.latest, at: state.at, points: state.points };
}
function cancelSharedStats(conn) {
  const state = states.get(conn);
  if (state && !state.terminalJoined) state.controller?.abort();
}
module.exports = {
  sampleSharedStats,
  readSharedStats,
  cancelSharedStats,
  resetSharedStatsForTests() {
    identities.clear();
    states = new WeakMap();
  },
};
