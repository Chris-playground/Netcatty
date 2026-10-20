// Created: 2026-07-15
// Purpose: verify keyboard-interactive modal server prompt formatting.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { keyboardInteractiveFieldLabel } from "./KeyboardInteractiveModal.tsx";

const modalSource = readFileSync(new URL("./KeyboardInteractiveModal.tsx", import.meta.url), "utf8");

test("keyboardInteractiveFieldLabel uses the cleaned last prompt line", () => {
  assert.equal(keyboardInteractiveFieldLabel("Secondary Authentication Password:", "Verification code"), "Secondary Authentication Password");
  assert.equal(keyboardInteractiveFieldLabel("JumpServer:\n| SMS code:", "Verification code"), "SMS code");
  assert.equal(keyboardInteractiveFieldLabel("[OTP Code]: ", "Verification code"), "OTP Code");
  assert.equal(keyboardInteractiveFieldLabel("   ", "Verification code"), "Verification code");
});

test("keyboard-interactive dialog shows a field label and an inline TOTP action", () => {
  assert.doesNotMatch(modalSource, /<pre/);
  assert.match(modalSource, /keyboardInteractiveFieldLabel\(/);
  assert.match(modalSource, /index === fillIndex/);
  assert.doesNotMatch(modalSource, /className="w-full"/);
});

test("keyboard-interactive modal cannot be dismissed by outside click or Escape", () => {
  assert.match(modalSource, /onOpenChange=\{\(\) => \{\/\* intentionally non-dismissable \*\/\}\}/);
  assert.match(modalSource, /onInteractOutside=\{\(e\) => e\.preventDefault\(\)\}/);
  assert.match(modalSource, /onEscapeKeyDown=\{\(e\) => e\.preventDefault\(\)\}/);
});
