import assert from 'node:assert/strict';
import test from 'node:test';
import type { ModelMessage } from 'ai';
import { createCattyPromptCache } from './cattyPromptCache';

test('leaves implicit-cache protocols unchanged', () => {
  for (const provider of ['openai.chat', 'openai.responses', 'google.generative-ai']) {
    const cache = createCattyPromptCache('instructions', provider);
    const messages: ModelMessage[] = [{ role: 'user', content: 'hello' }];
    assert.equal(cache.instructions, 'instructions');
    assert.equal(cache.prepareMessages(messages), messages);
  }
});

test('Claude markers stay bounded across tool steps without changing signed reasoning', () => {
  const cache = createCattyPromptCache('static\n\n## Current Scope\nvolatile', 'anthropic.messages');
  const reasoning = { type: 'reasoning' as const, text: 'thinking',
    providerOptions: { anthropic: { signature: 'signed-value' } } };
  let messages: ModelMessage[] = [{ role: 'user', content: 'hello' }];
  for (let step = 0; step < 30; step += 1) {
    messages = cache.prepareMessages(messages);
    const marked = messages.filter(message => message.providerOptions?.anthropic?.cacheControl);
    assert.ok(marked.length <= 2);
    messages.push({ role: 'assistant', content: [reasoning, { type: 'text', text: 'result' }] });
    messages.push({ role: 'user', content: `next-${step}` });
  }
  for (const message of messages) {
    if (message.role === 'assistant') assert.equal(message.content[0], reasoning);
  }
  assert.ok(Array.isArray(cache.instructions));
  assert.deepEqual(cache.instructions[0].providerOptions?.anthropic?.cacheControl, { type: 'ephemeral' });
});
