import assert from "node:assert/strict";
import test from "node:test";
import React, { useState } from "react";
import { createDomRenderer, dispatchDomEvent, installDomEnvironment, runWithAct } from "./test-support/renderReactDom";

test("modal drawers retain focus through replacement and restore their original opener", async (t) => {
  const env = installDomEnvironment();
  const previous = new Map<string, PropertyDescriptor | undefined>();
  for (const [key, value] of Object.entries({
    MutationObserver: env.window.MutationObserver,
    NodeFilter: env.window.NodeFilter,
    HTMLInputElement: env.window.HTMLInputElement,
  })) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  const { AsidePanel } = await import("./ui/aside-panel");
  const renderer = await createDomRenderer(env.document);
  t.after(async () => {
    await renderer.unmount();
    await settle();
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
    env.cleanup();
  });
  async function settle() {
    await runWithAct(() => new Promise<void>((resolve) => setTimeout(resolve, 20)));
  }
  function Flow() {
    const [step, setStep] = useState(0);
    return <>
      <button id="opener" onClick={() => setStep(1)}>Open</button>
      {step === 1 && <AsidePanel key="editor" modal resizable open title="Editor" onClose={() => setStep(0)}>
        <input id="editor-input" autoFocus />
        <button id="pick" onClick={() => setStep(2)}>Pick</button>
      </AsidePanel>}
      {step === 2 && <AsidePanel key="picker" modal open title="Picker" onClose={() => setStep(0)}>
        <button id="back" onClick={() => setStep(1)}>Back</button>
      </AsidePanel>}
    </>;
  }
  await renderer.render(<Flow />);
  const opener = env.document.getElementById("opener")!;
  const click = async (id: string) => {
    const element = env.document.getElementById(id)!;
    element.focus();
    await dispatchDomEvent(element, new env.window.MouseEvent("click", { bubbles: true }));
    await settle();
  };
  const escape = async () => {
    await dispatchDomEvent(env.document, new env.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await settle();
    assert.equal(env.document.querySelector('[role="dialog"]'), null);
    assert.equal(env.document.activeElement, opener);
  };
  await click("opener");
  assert.equal(env.document.activeElement?.id, "editor-input");
  await escape();
  await click("opener");
  await click("pick");
  assert.ok(env.document.querySelector('[role="dialog"]')?.contains(env.document.activeElement));
  await escape();
  await click("opener");
  await click("pick");
  await click("back");
  assert.equal(env.document.activeElement?.id, "editor-input");
  await escape();
  await click("opener");
  const separator = env.document.querySelector('[role="separator"]')!;
  await dispatchDomEvent(separator, new env.window.MouseEvent("pointerdown", { bubbles: true, clientX: 500 }));
  await dispatchDomEvent(env.window, new env.window.MouseEvent("pointermove", { bubbles: true, clientX: 400 }));
  await dispatchDomEvent(env.window, new env.window.MouseEvent("pointerup", { bubbles: true, clientX: 400 }));
  assert.equal((env.document.querySelector('[role="dialog"]') as HTMLElement).style.width, "480px");
  const backdrop = env.document.querySelector('[data-section="aside-modal-backdrop"]')!;
  await dispatchDomEvent(backdrop, new env.window.MouseEvent("pointerdown", { bubbles: true, button: 0 }));
  await settle();
  assert.equal(env.document.querySelector('[role="dialog"]'), null, "first backdrop click after resizing dismisses");
  assert.equal(env.document.activeElement, opener);
});
