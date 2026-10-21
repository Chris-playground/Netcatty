"use strict";
/* global __dirname */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const css = fs.readFileSync(path.join(root, "index.css"), "utf8");
const tabs = fs.readFileSync(path.join(root, "components/top-tabs/TopTabItems.tsx"), "utf8");

test("unread terminal activity has a static theme-aware outline, not an endless animation", () => {
  const rule = css.match(/\.session-activity-dot\s*\{([^}]+)\}/)?.[1];
  assert.ok(rule, "keep a distinct unread activity style");
  assert.match(rule, /outline:\s*1px solid color-mix\(in srgb, var\(--top-tabs-fg, hsl\(var\(--foreground\)\)\) 75%, transparent\)/);
  assert.match(rule, /outline-offset:\s*2px/);
  assert.doesNotMatch(rule, /(?:animation|transition|background|color|transform)\s*:/);
  assert.doesNotMatch(css, /session-activity-breathe/);
});

test("static unread styling keeps session status hues and conditional tab/workspace consumers", () => {
  assert.match(tabs, /hasActivity && "session-activity-dot"/);
  assert.match(tabs, /status === 'connected'[\s\S]*?"bg-emerald-400"[\s\S]*?status === 'connecting'[\s\S]*?"bg-amber-400"[\s\S]*?"bg-rose-500"/);
  assert.match(tabs, /sessionStatusDot\(session.status, hasActivity\)/);
  assert.match(tabs, /hasActivity && sessionStatusDot\('connected', true\)/);
});
