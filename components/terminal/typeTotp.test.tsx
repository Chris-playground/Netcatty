import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
import type { Terminal } from "@xterm/xterm";
import { useTerminalContextActions } from "./hooks/useTerminalContextActions";

test("type totp marks the paste sensitive and already dispatched", () => {
  const source = readFileSync(new URL("./hooks/useTerminalContextActions.ts", import.meta.url), "utf8");
  assert.match(source, /pasteTextIntoTerminal\(term, result\.code, \{[\s\S]*?sensitive: true,[\s\S]*?onPasteData: \(\) => true,/);
});

test("type totp pastes the current code without a trailing enter", async () => {
  const dom = new JSDOM("<div id=\"root\"></div>", { url: "http://localhost" });
  const previous = new Map<string, PropertyDescriptor | undefined>();
  for (const [key, value] of Object.entries({
    window: dom.window,
    document: dom.window.document,
    IS_REACT_ACT_ENVIRONMENT: true,
  })) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  const pasted: string[] = [];
  Object.assign(dom.window, {
    netcatty: {
      previewTotp: async () => ({ ok: true, code: "396153", secondsRemaining: 20, uri: "otpauth://totp/test" }),
    },
  });
  const term = {
    cols: 80,
    rows: 24,
    element: dom.window.document.createElement("div"),
    focus() {},
    paste(text: string) { pasted.push(text); },
  };
  const termRef = { current: term as unknown as Terminal };
  let actions!: ReturnType<typeof useTerminalContextActions>;
  function Harness() {
    actions = useTerminalContextActions({
      termRef,
      sourceSessionId: "session",
      sessionRef: { current: "session" },
      isLocalConnection: false,
      supportsRemoteImagePaste: false,
      terminalBackend: { writeToSession() {} },
      getTotpUri: () => "otpauth://totp/Example:user?secret=JBSWY3DPEHPK3PXP",
    });
    return null;
  }
  const root = createRoot(dom.window.document.getElementById("root")!);
  try {
    await act(async () => { root.render(<Harness />); });
    const originalPaste = (await import("./runtime/terminalUserPaste.ts")).pasteTextIntoTerminal;
    assert.equal(typeof originalPaste, "function");
    await act(async () => { await actions.onTypeTotp?.(); });
    assert.deepEqual(pasted, ["396153"]);
    assert.equal(pasted.some((text) => /[\r\n]/.test(text)), false);
  } finally {
    await act(async () => { root.unmount(); });
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete (globalThis as Record<string, unknown>)[key];
    }
  }
});
