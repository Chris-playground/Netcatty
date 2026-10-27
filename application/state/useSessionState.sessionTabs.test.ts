import assert from 'node:assert/strict';
import test from 'node:test';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { collectSessionIds } from '../../domain/workspace';
import { activeTabStore } from './activeTabStore';
import { useSessionState } from './useSessionState';

test('session tabs preserve their workspace, transport source, focus and names', async (t) => {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost' });
  const globals = {
    window: dom.window,
    document: dom.window.document,
    localStorage: dom.window.localStorage,
    CustomEvent: dom.window.CustomEvent,
    Event: dom.window.Event,
    IS_REACT_ACT_ENVIRONMENT: true,
  };
  const previous = new Map<string, PropertyDescriptor | undefined>();
  for (const [key, value] of Object.entries(globals)) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, value });
  }
  const root = createRoot(document.getElementById('root')!);
  t.after(async () => {
    await act(async () => root.unmount());
    activeTabStore.setActiveTabId('vault');
    await new Promise(resolve => setTimeout(resolve, 0));
    dom.window.close();
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  });
  let state: ReturnType<typeof useSessionState>;
  function Probe() {
    state = useSessionState({ persistSessionRestore: false });
    return null;
  }
  await act(async () => root.render(React.createElement(React.StrictMode, null, React.createElement(Probe))));
  const host = { id: 'ssh-1', label: 'Production', hostname: 'example.test', username: 'root', port: 22, protocol: 'ssh' as const, tags: [], os: 'linux' as const };
  await act(async () => state.connectToHost(host));
  const original = state!.sessions[0];
  await act(async () => state.updateSessionStatus(original.id, 'connected'));
  await act(async () => state.splitSession(original.id, 'vertical', { tabbed: true, inheritedCwd: '/srv/app' }));
  assert.equal(state!.workspaces.length, 1);
  const workspace = state!.workspaces[0];
  const second = state!.sessions.find(s => s.id !== original.id)!;
  assert.equal(workspace.viewMode, 'focus');
  assert.equal(workspace.focusLayout, 'tabs');
  assert.equal(workspace.title, 'Production');
  assert.equal(workspace.focusedSessionId, second.id);
  assert.equal(second.reuseConnectionFromSessionId, original.id);
  assert.equal(second.pendingInitialCwd, undefined, 'new SSH tabs must not inject a cd command');
  assert.equal(state!.sessions.length, 2, 'StrictMode must not duplicate sessions');
  assert.deepEqual(collectSessionIds(workspace.root), [original.id, second.id]);
  await act(async () => state.submitSessionRename(second.id, 'Deploy'));
  assert.equal(state!.sessions.find(s => s.id === second.id)?.customName, 'Deploy');
  assert.equal(state!.workspaces[0].title, 'Production');
  await act(async () => state.splitSession(second.id, 'vertical', { tabbed: true }));
  assert.equal(state!.workspaces.length, 1);
  assert.equal(state!.sessions.length, 3);
  const third = state!.sessions.find(s => s.id !== original.id && s.id !== second.id)!;
  assert.equal(state!.workspaces[0].id, workspace.id);
  assert.equal(state!.workspaces[0].focusedSessionId, third.id);
  await act(async () => state.closeSession(third.id));
  assert.ok(state!.sessions.some(s => s.id === state!.workspaces[0].focusedSessionId));
  await act(async () => state.closeSession(second.id));
  assert.equal(state!.workspaces.length, 1, 'the host tab stays stable with one session');
  assert.equal(state!.sessions.length, 1);
  assert.equal(state!.sessions[0].id, original.id);
  assert.equal(state!.sessions[0].workspaceId, workspace.id);
  assert.equal(state!.workspaces[0].focusedSessionId, original.id);
  await act(async () => state.splitSession(original.id, 'horizontal'));
  assert.equal(state!.workspaces[0].viewMode, 'split', 'the split action still opens a visible pane');
  const split = state!.sessions.find(s => s.id !== original.id)!;
  await act(async () => state.closeSession(split.id));
  await act(async () => state.closeSession(original.id));
  assert.equal(state!.workspaces.length, 0);
  assert.equal(state!.sessions.length, 0);
  assert.equal(activeTabStore.getActiveTabId(), 'vault');
});
