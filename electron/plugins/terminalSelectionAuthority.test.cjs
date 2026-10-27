"use strict";
const assert = require("node:assert/strict");
const test = require("node:test");
const { TerminalSelectionAuthority, LIMITS } = require("./terminalSelectionAuthority.cjs");
const { privateOwner, LOCAL_SOURCE, OFFICIAL_SOURCE } = require("./sourceIdentity.cjs");

function fixture(t) {
  const sender = { id: 7, isDestroyed: () => false };
  let window = { webContents: sender }, generation = 0, time = 100, alive = true, source = LOCAL_SOURCE;
  const listeners = new Map();
  const manager = { getPluginSessionBinding(id, owner) { return alive && owner === 7 && ['a', 'b'].includes(id) ? { epoch: 'worker-a', generation } : null; } };
  for (const key of ['onSessionOwned', 'onSessionClosed', 'onWorkerExit']) manager[key] = (fn) => { listeners.set(key, fn); return { dispose() {} }; };
  const database = { privateOwner: (id) => privateOwner(source, id), publicPluginId: (owner) => owner === privateOwner(source, 'com.example.synthetic') ? 'com.example.synthetic' : null };
  const context = { pluginId: 'com.example.synthetic', pluginVersion: '1.0.0', runtimeId: 'runtime-a', manifest: { features: { required: ['terminal.selection-sharing', 'terminal.input-drafts'] } } };
  const authority = new TerminalSelectionAuthority({ database, getWindow: () => window, getManager: () => manager, clock: () => time });
  t.after(() => authority.shutdown());
  const select = (sessionId = 'a', rendererId = 'renderer-a') => authority.setTarget(sender, { sessionId, rendererId, label: 'Synthetic terminal' });
  select();
  return { authority, context, sender, select, database, capture: () => authority.capture(sender, context),
    reconnect() { generation++; listeners.get('onSessionOwned')?.(); }, close() { alive = false; listeners.get('onSessionClosed')?.(); },
    replaceOwner() { window = { webContents: { id: 9 } }; }, expire() { time += LIMITS.handleTtlMs; authority.invalidate(); }, replaceSource() { source = OFFICIAL_SOURCE; authority.invalidate(); } };
}

test('references bind source/runtime/version/window/connection/renderer and reveal no raw objects or text', (t) => {
  const f = fixture(t), target = f.capture();
  const receipt = f.authority.issue(target, f.context);
  assert.deepEqual(Object.keys(receipt).sort(), ['expiresAt', 'handle']);
  assert.equal(f.authority.resolve(receipt.handle, f.context), target);
  assert.equal(JSON.stringify([...f.authority.handles.values()]).includes('selected text'), false);
  for (const delta of [{ runtimeId: 'other' }, { pluginVersion: '2.0.0' }, { pluginId: 'com.example.other' }]) {
    assert.throws(() => f.authority.resolve(receipt.handle, { ...f.context, ...delta }), /unavailable/);
  }
  f.select('b');
  assert.throws(() => f.authority.resolve(receipt.handle, f.context), /unavailable/);
  const second = f.authority.issue(f.capture(), f.context);
  assert.notEqual(second.handle, receipt.handle);
});

for (const action of ['reconnect', 'close', 'replaceOwner', 'expire', 'replaceSource']) test(`revokes references on ${action}`, (t) => {
  const f = fixture(t), receipt = f.authority.issue(f.capture(), f.context);
  f[action]();
  assert.throws(() => f.authority.resolve(receipt.handle, f.context), /unavailable/);
});
for (const method of ['releaseRuntime', 'releasePlugin', 'clearHandles']) test(`${method} revokes references`, (t) => {
  const f = fixture(t), receipt = f.authority.issue(f.capture(), f.context);
  f.authority[method](method === 'releaseRuntime' ? f.context.runtimeId : f.context.pluginId);
  assert.throws(() => f.authority.resolve(receipt.handle, f.context), /unavailable/);
});
test('renderer replacement and explicit null never fall back to a different session', (t) => {
  const f = fixture(t), receipt = f.authority.issue(f.capture(), f.context);
  f.select('a', 'attached-renderer');
  assert.throws(() => f.authority.resolve(receipt.handle, f.context), /unavailable/);
  f.authority.setTarget(f.sender, { sessionId: null });
  assert.throws(() => f.capture(), /Select a live terminal/);
  assert.throws(() => f.authority.setTarget({ id: 8 }, { sessionId: null }), /another window/);
});
test('missing database ownership and a bare plugin ID fail closed', (t) => {
  const f = fixture(t);
  f.database.privateOwner = () => f.context.pluginId;
  assert.throws(() => f.capture(), /source owner/);
  delete f.database.privateOwner;
  assert.throws(() => f.capture(), /source owner/);
});
test('quotas, undeclared features and malformed targets fail before issuing a reference', (t) => {
  const f = fixture(t);
  assert.throws(() => f.authority.capture(f.sender, { ...f.context, manifest: {} }), /not declared/);
  assert.throws(() => f.authority.setTarget(f.sender, { sessionId: 'a' }), /Invalid/);
  const target = f.capture();
  for (let i = 0; i < LIMITS.handlesPerRuntime; i++) f.authority.issue(target, f.context);
  assert.throws(() => f.authority.issue(target, f.context), /limit/);
});

test('opt-in capture diagnostics distinguish a missing target from a sender mismatch without identities or text', (t) => {
  const f = fixture(t), events = [];
  const previousFlag = process.env.NETCATTY_TERMINAL_TARGET_DIAGNOSTICS, previousInfo = console.info;
  try {
    process.env.NETCATTY_TERMINAL_TARGET_DIAGNOSTICS = '1';
    console.info = (tag, flags) => { events.push([tag, flags]); };
    f.authority.setTarget(f.sender, { sessionId: null });
    assert.throws(() => f.capture(), /Select a live terminal/);
    assert.deepEqual(events.at(-1), ['[Plugins:TerminalTarget]', {
      stage: 'main-capture', targetPresent: false, targetSenderMatchesCaller: false, callerIsMain: true,
    }]);
    f.select();
    assert.throws(() => f.authority.capture({ id: 99 }, f.context), /Select a live terminal/);
    assert.deepEqual(events.at(-1), ['[Plugins:TerminalTarget]', {
      stage: 'main-capture', targetPresent: true, targetSenderMatchesCaller: false, callerIsMain: false,
    }]);
    assert.equal(JSON.stringify(events).includes('Synthetic'), false);
    assert.equal(JSON.stringify(events).includes('renderer-a'), false);
    assert.equal(JSON.stringify(events).includes(f.context.pluginId), false);
    assert.throws(() => f.authority.setTarget(f.sender, { sessionId: 'synthetic-private-session' }), /Invalid/);
    assert.deepEqual(events.at(-1)[1], { stage: 'main-publication', accepted: false, reason: 'invalid-target' });
    assert.throws(() => f.authority.setTarget({ id: 99 }, { sessionId: null }), /another window/);
    assert.deepEqual(events.at(-1)[1], { stage: 'main-publication', accepted: false, reason: 'other-window' });
    delete process.env.NETCATTY_TERMINAL_TARGET_DIAGNOSTICS;
    const count = events.length;
    f.authority.setTarget(f.sender, { sessionId: null });
    assert.throws(() => f.capture(), /Select a live terminal/);
    assert.equal(events.length, count, 'normal launches emit no diagnostic events');
  } finally {
    console.info = previousInfo;
    if (previousFlag === undefined) delete process.env.NETCATTY_TERMINAL_TARGET_DIAGNOSTICS;
    else process.env.NETCATTY_TERMINAL_TARGET_DIAGNOSTICS = previousFlag;
  }
});
