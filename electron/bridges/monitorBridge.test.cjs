const test = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const pool = require("./sshConnectionPool.cjs");
const { createMonitorService } = require("./monitorBridge.cjs");
const {
  sampleSharedStats,
  readSharedStats,
  cancelSharedStats,
  resetSharedStatsForTests,
} = require("./sshBridge/sharedStats.cjs");
const event = (id) => ({ sender: { id } });
const options = {
  hostId: "h",
  hostname: "test",
  username: "alice",
  password: "fixture-password",
  verifyHostKeys: true,
};
const demand = (id = "p", opts = options) => ({
  id,
  interval: 10,
  hosts: [{ id: "h", options: opts }],
});
const tick = () => new Promise((resolve) => setImmediate(resolve));
function conn() {
  const c = new EventEmitter();
  c._sock = { destroyed: false };
  c.end = () => {
    c.ended = true;
  };
  return c;
}
function fixture(overrides = {}) {
  let dials = 0,
    samples = 0;
  const timers = [];
  const c = conn();
  const service = createMonitorService({
    startConnection: async (_e, opts) => {
      dials++;
      return {
        transport: pool.createTransport({
          conn: c,
          endpoint: pool.buildConnectionReuseEndpoint(opts),
        }),
      };
    },
    cancelConnection: () => {},
    getStats: (context) =>
      sampleSharedStats(context, async () => {
        samples++;
        return {
          success: true,
          stats: {
            cpu: null,
            memTotal: 100,
            memUsed: 50,
            networkReady: false,
            disks: [],
          },
        };
      }),
    timers: {
      setTimeout(fn, ms) {
        const t = { fn, ms };
        timers.push(t);
        return t;
      },
      clearTimeout(t) {
        t.cancelled = true;
      },
    },
    ...overrides,
  });
  return {
    service,
    c,
    timers,
    get dials() {
      return dials;
    },
    get samples() {
      return samples;
    },
  };
}
test.beforeEach(() => {
  resetSharedStatsForTests();
  pool.resetSshTransportRegistryForTests({ defaultIdleTtlMs: 0 });
});
test.afterEach(() => pool.resetSshTransportRegistryForTests());
test("two panels and windows share one transport/sample; stopping preserves a terminal lease", async () => {
  const f = fixture();
  f.service.reconcile(event(1), [demand("a"), demand("b")]);
  f.service.reconcile(event(2), [demand("a")]);
  await tick();
  await tick();
  assert.equal(f.dials, 1);
  assert.equal(f.samples, 1);
  assert.equal(f.service.snapshot(event(1)).count, 3);
  const transport = pool.findTransportByEndpoint(
    pool.buildConnectionReuseEndpoint(options),
  );
  const terminal = {};
  pool.borrowTransport(transport, {
    kind: pool.LEASE_KINDS.shell,
    holder: terminal,
  });
  f.service.reconcile(event(1), []);
  assert.equal(f.service.snapshot(event(2)).hostCount, 1);
  f.service.removeOwner(2);
  assert.equal(transport.count, 1);
  assert.equal(f.c.ended, undefined);
  assert.ok(f.timers.every((t) => t.cancelled));
  pool.returnTransport(terminal);
  f.service.dispose();
});
test("different credentials never share an entry or physical dial", async () => {
  const f = fixture();
  f.service.reconcile(event(1), [demand("a")]);
  f.service.reconcile(event(2), [
    demand("b", { ...options, password: "different" }),
  ]);
  await tick();
  await tick();
  assert.equal(f.dials, 2);
  assert.equal(f.service.snapshot(event(1)).hostCount, 2);
  f.service.dispose();
});
test("stopping while queued prevents dial; stopping during dial returns late transport", async () => {
  let finish,
    opens = 0,
    cancels = 0;
  const c = conn();
  const f = fixture({
    startConnection: (_e, opts) => {
      opens++;
      return new Promise((resolve) => {
        finish = () =>
          resolve({
            transport: pool.createTransport({
              conn: c,
              endpoint: pool.buildConnectionReuseEndpoint(opts),
            }),
          });
      });
    },
    cancelConnection: () => cancels++,
  });
  f.service.reconcile(event(1), [demand("a")]);
  await tick();
  f.service.reconcile(event(1), [demand("b", { ...options, username: "bob" })]);
  f.service.reconcile(event(1), []);
  finish();
  await tick();
  await tick();
  assert.equal(opens, 1);
  assert.equal(cancels, 1);
  assert.equal(f.samples, 0);
  assert.equal(f.service.snapshot(event(1)).count, 0);
  const t = pool.findTransportByEndpoint(
    pool.buildConnectionReuseEndpoint(options),
  );
  assert.equal(t.state, "idle");
  assert.equal(t.count, 0);
  f.service.dispose();
});
test("terminal and monitor join in-flight collection; stop never aborts a terminal reader", async () => {
  const c = conn();
  let finish,
    calls = 0,
    aborted = false;
  const collect = (ctx) => {
    calls++;
    ctx.statsSignal.addEventListener("abort", () => (aborted = true));
    return new Promise((resolve) => (finish = resolve));
  };
  const a = sampleSharedStats({ conn: c, _monitorStats: true }, collect);
  const b = sampleSharedStats({ conn: c }, collect);
  cancelSharedStats(c);
  assert.equal(aborted, false);
  finish({ success: true, stats: { cpu: null, memTotal: 1, memUsed: 1 } });
  await Promise.all([a, b]);
  assert.equal(calls, 1);
  assert.equal(readSharedStats(c).points.length, 1);
});
test("sparse trends keep a finite time and point budget under sustained samples", async () => {
  const c = conn();
  const original = Date.now;
  let now = 100000;
  Date.now = () => now;
  try {
    for (let i = 0; i < 250; i++) {
      await sampleSharedStats(
        { conn: c, _monitorStats: true },
        async () => ({
          success: true,
          stats: { cpu: i % 100, memTotal: 100, memUsed: 50 },
        }),
        now,
      );
      now += 10000;
    }
    const history = readSharedStats(c).points;
    assert.equal(history.length, 180);
    assert.ok(history.every((p) => now - p.at <= 1800000));
    assert.equal(history[0].at, 800000);
  } finally {
    Date.now = original;
  }
});

test("fresh terminal logins with the exact same pool identity share the monitor's sampler", async () => {
  const a = conn(),
    b = conn();
  const endpoint = pool.normalizeEndpoint(
    pool.buildConnectionReuseEndpoint(options),
  );
  let calls = 0;
  const collect = async () => {
    calls++;
    return { success: true, stats: { cpu: 42, memTotal: 100, memUsed: 50 } };
  };
  await sampleSharedStats(
    { conn: a, _reuseEndpoint: endpoint, _monitorStats: true },
    collect,
  );
  await sampleSharedStats({ conn: b, _reuseEndpoint: endpoint }, collect);
  assert.equal(calls, 1);
  assert.equal(readSharedStats(a).points, readSharedStats(b).points);
});
