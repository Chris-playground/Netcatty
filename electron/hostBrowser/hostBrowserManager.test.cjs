"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { normalizeBrowserUrl } = require("./hostBrowserManager.cjs");

test("browser addresses accept bare localhost and domain ports", () => {
  assert.equal(normalizeBrowserUrl("localhost:3000"), "http://localhost:3000/");
  assert.equal(normalizeBrowserUrl("localhost:3000/app"), "http://localhost:3000/app");
  assert.equal(normalizeBrowserUrl("127.0.0.1:8080"), "http://127.0.0.1:8080/");
  assert.equal(normalizeBrowserUrl("example.com:8080"), "https://example.com:8080/");
  assert.equal(normalizeBrowserUrl("https://example.com/app"), "https://example.com/app");
});

test("browser addresses keep rejecting external protocols and credentials", () => {
  for (const url of ["file:///etc/passwd", "javascript:alert(1)", "mailto:test@example.com", "https://user:password@example.com/"]) {
    assert.throws(() => normalizeBrowserUrl(url));
  }
});
