import assert from "node:assert/strict";
import test from "node:test";
import React from "react";

import type { AISession } from "../infrastructure/ai/types.ts";
import { createDomRenderer, dispatchDomEvent, installDomEnvironment, runWithAct } from "./test-support/renderReactDom.tsx";

test("history input yields before indexing long sessions and never publishes an obsolete query", async (t) => {
  const env = installDomEnvironment();
  const { SessionHistoryDrawer } = await import("./AIChatSessionHistoryDrawer.tsx");
  const { I18nProvider } = await import("../application/i18n/I18nProvider.tsx");
  const { TooltipProvider } = await import("./ui/tooltip.tsx");
  const renderer = await createDomRenderer(env.document);
  t.after(async () => { await renderer.unmount(); env.cleanup(); });

  let heartbeat = false;
  let readsBeforeHeartbeat = 0;
  let reads = 0;
  const body = "representative retained output and ordinary content ".repeat(400);
  let sessions: AISession[] = Array.from({ length: 180 }, (_, index) => ({
    id: `session-${index}`,
    title: `Session ${index}`,
    agentId: "catty",
    scope: { type: "terminal", targetId: "fixture" },
    createdAt: 0,
    updatedAt: 0,
    messages: Array.from({ length: 4 }, (_, part) => ({
      id: `message-${index}-${part}`,
      role: "assistant" as const,
      timestamp: 0,
      get content() {
        reads += 1;
        if (!heartbeat) readsBeforeHeartbeat += 1;
        return index === 179 && part === 3 ? "latest-match" : body;
      },
    })),
  }));
  const noop = () => {};
  const render = () => renderer.render(
    <I18nProvider locale="en"><TooltipProvider>
      <SessionHistoryDrawer sessions={sessions} activeSessionId={null} onSelect={noop} onDelete={noop} onClose={noop} />
    </TooltipProvider></I18nProvider>,
  );
  const query = async (value: string) => {
    const input = renderer.container.querySelector("input")!;
    Object.getOwnPropertyDescriptor(env.window.HTMLInputElement.prototype, "value")!.set!.call(input, value);
    await dispatchDomEvent(input, new env.window.Event("input", { bubbles: true }));
    assert.equal(input.value, value);
  };
  const waitFor = async (condition: () => boolean) => {
    for (let attempt = 0; attempt < 300 && !condition(); attempt += 1) {
      await runWithAct(() => new Promise((resolve) => setTimeout(resolve, 5)));
    }
    assert.ok(condition(), "search did not settle");
  };

  await render();
  assert.equal(reads, 0, "blank query never indexes message bodies");
  setTimeout(() => { heartbeat = true; }, 0);
  await query("never-match");
  assert.equal(readsBeforeHeartbeat, 0, "typing must return to the event loop before indexing messages");
  await query("latest-match");
  await waitFor(() => renderer.container.querySelectorAll('[role="button"]').length === 1);
  assert.match(renderer.container.querySelector('[role="button"]')!.textContent!, /Session 179/);

  // A streaming session changes while a large search is running. Keep progress
  // on unchanged sessions, search the replacement, and respect the new order.
  await query("new-live-match");
  sessions = [{ ...sessions[10], title: "New live match", messages: [{ id: "replacement", role: "assistant", content: "new-live-match", timestamp: 1 }] }, ...sessions.filter((session) => session.id !== "session-10" && session.id !== "session-179")];
  await render();
  await waitFor(() => renderer.container.querySelector('[role="button"]')?.textContent?.includes("New live match") === true);
  assert.equal(renderer.container.querySelectorAll('[role="button"]').length, 1);
  await query("");
  assert.equal(renderer.container.querySelectorAll('[role="button"]').length, 80);
});
