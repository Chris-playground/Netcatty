import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { I18nProvider } from '../../../../application/i18n/I18nProvider';
import { STORAGE_KEY_AI_EXTERNAL_MCP_REDACTION } from '../../../../infrastructure/config/storageKeys';
import { ExternalMcpRedactionSection } from './ExternalMcpRedactionSection';

function installEnvironment(setConfig: (config: unknown) => Promise<unknown>) {
  const values = new Map<string, string>();
  const events = new EventTarget();
  const globals = {
    IS_REACT_ACT_ENVIRONMENT: true,
    localStorage: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    },
    window: {
      netcatty: { externalMcpSetConfig: setConfig },
      addEventListener: events.addEventListener.bind(events),
      removeEventListener: events.removeEventListener.bind(events),
      dispatchEvent: events.dispatchEvent.bind(events),
    },
  };
  const previous = new Map<string, PropertyDescriptor | undefined>();
  for (const [name, value] of Object.entries(globals)) {
    previous.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
  }
  return {
    values,
    restore: () => {
      for (const [name, descriptor] of previous) {
        if (descriptor) Object.defineProperty(globalThis, name, descriptor);
        else Reflect.deleteProperty(globalThis, name);
      }
    },
  };
}

function view() {
  return <I18nProvider locale="en"><ExternalMcpRedactionSection /></I18nProvider>;
}

test('privacy settings default off and explain their limits and connection scope', async () => {
  const env = installEnvironment(async () => ({ ok: true }));
  let renderer: ReactTestRenderer | undefined;
  try {
    await act(async () => { renderer = create(view()); });
    const markup = JSON.stringify(renderer!.toJSON());
    assert.equal(renderer!.root.findAllByType('button').filter((node) => node.props['aria-checked'] === false).length, 2);
    assert.match(markup, /cannot detect every secret/);
    assert.match(markup, /Binary responses are blocked/);
    assert.match(markup, /one client connection only/);
    assert.match(markup, /reconnect external MCP clients/);
    assert.match(markup, /Additional IP ranges/);
    assert.match(markup, /Custom regular expressions/);
  } finally {
    if (renderer) await act(async () => { renderer!.unmount(); });
    env.restore();
  }
});

test('privacy drafts apply together, retain rejected input and persist only validated settings', async () => {
  const calls: unknown[] = [];
  let accepted = false;
  const env = installEnvironment(async (config) => {
    calls.push(config);
    return accepted ? { ok: true } : { ok: false, error: 'Invalid privacy rules.' };
  });
  let renderer: ReactTestRenderer | undefined;
  try {
    await act(async () => { renderer = create(view()); });
    const root = renderer!.root;
    const privacySwitch = () => root.findAllByType('button').find((node) => (
      node.props['aria-label'] === 'Enable text redaction'
    ))!;
    const apply = () => root.findAllByType('button').find((node) => node.props.children === 'Apply')!;
    await act(async () => { privacySwitch().props.onClick(); });
    await act(async () => {
      root.findAllByType('textarea')[0].props.onChange({ currentTarget: { value: '192.0.2.0/24\n\n2001:db8::/32' } });
      root.findAllByType('textarea')[1].props.onChange({ currentTarget: { value: '[' } });
    });
    assert.equal(calls.length, 0, 'draft edits must not change runtime or storage');
    assert.equal(env.values.get(STORAGE_KEY_AI_EXTERNAL_MCP_REDACTION), undefined);
    await act(async () => { apply().props.onClick(); });
    assert.equal(root.findAllByType('textarea')[1].props.value, '[');
    assert.match(root.findByProps({ role: 'alert' }).children.join(''), /Invalid privacy rules/);
    assert.equal(env.values.get(STORAGE_KEY_AI_EXTERNAL_MCP_REDACTION), undefined);

    accepted = true;
    await act(async () => {
      root.findAllByType('textarea')[1].props.onChange({ currentTarget: { value: 'INTERNAL_[A-Z0-9]+' } });
    });
    await act(async () => { apply().props.onClick(); });
    const saved = JSON.parse(env.values.get(STORAGE_KEY_AI_EXTERNAL_MCP_REDACTION)!);
    assert.deepEqual(saved, {
      enabled: true,
      redactPrivateIps: false,
      cidrs: ['192.0.2.0/24', '2001:db8::/32'],
      patterns: ['INTERNAL_[A-Z0-9]+'],
    });
    assert.deepEqual(calls[1], { redaction: saved });
    assert.equal(root.findAllByProps({ role: 'alert' }).length, 0);
    assert.match(root.findByProps({ role: 'status' }).children.join(''), /Reconnect/);
  } finally {
    if (renderer) await act(async () => { renderer!.unmount(); });
    env.restore();
  }
});

test('malformed saved privacy settings remain visible as a recoverable error', async () => {
  const env = installEnvironment(async () => ({ ok: true }));
  let renderer: ReactTestRenderer | undefined;
  try {
    env.values.set(STORAGE_KEY_AI_EXTERNAL_MCP_REDACTION, '{');
    await act(async () => { renderer = create(view()); });
    assert.match(renderer!.root.findByProps({ role: 'alert' }).children.join(''), /Invalid saved External MCP privacy settings/);
    assert.ok(renderer!.root.findAllByType('button').some((node) => node.props.children === 'Apply'));
    assert.equal(env.values.get(STORAGE_KEY_AI_EXTERNAL_MCP_REDACTION), '{');
  } finally {
    if (renderer) await act(async () => { renderer!.unmount(); });
    env.restore();
  }
});
