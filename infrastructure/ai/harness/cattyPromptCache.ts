import type { ModelMessage, SystemModelMessage } from 'ai';

const CACHE_CONTROL = { type: 'ephemeral' } as const;

/** Native Anthropic needs explicit breakpoints; implicit-cache protocols stay untouched. */
export function createCattyPromptCache(systemPrompt: string, provider: string) {
  const enabled = /^anthropic(?:\.|$)/.test(provider);
  const boundary = systemPrompt.indexOf('\n\n## Current Scope');
  const instructions: string | SystemModelMessage[] = enabled
    ? [{
      role: 'system',
      content: boundary < 0 ? systemPrompt : systemPrompt.slice(0, boundary),
      providerOptions: { anthropic: { cacheControl: CACHE_CONTROL } },
    }, ...(boundary < 0 ? [] : [{
      role: 'system' as const,
      content: systemPrompt.slice(boundary),
    }])]
    : systemPrompt;

  return {
    enabled,
    instructions,
    prepareMessages(messages: ModelMessage[]): ModelMessage[] {
      if (!enabled) return messages;
      // Keep at most two moving conversation breakpoints, plus the static
      // system boundary. Remove our prior message-level markers as v7 carries
      // prepared messages forward; never alter signed reasoning content.
      const targets = new Set<number>();
      for (let index = messages.length - 1; index >= 0 && targets.size < 2; index -= 1) {
        if (messages[index].role === 'user' || messages[index].role === 'tool') targets.add(index);
      }
      return messages.map((message, index) => {
        const existing = message.providerOptions?.anthropic;
        if (!targets.has(index) && !existing?.cacheControl && !existing?.cache_control) return message;
        const anthropic = { ...existing };
        delete anthropic.cacheControl;
        delete anthropic.cache_control;
        if (targets.has(index)) anthropic.cacheControl = CACHE_CONTROL;
        return { ...message, providerOptions: { ...message.providerOptions, anthropic } };
      });
    },
  };
}
