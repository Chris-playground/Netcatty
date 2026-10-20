import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { I18nProvider } from "../application/i18n/I18nProvider";
import type { Host } from "../types";
import { QuickSwitcher } from "./QuickSwitcher";

const host = (overrides: Partial<Host> = {}): Host => ({
  id: "saved-1",
  label: "core-switch",
  hostname: "10.1.1.1",
  username: "admin",
  tags: [],
  os: "linux",
  protocol: "ssh",
  ...overrides,
}) as Host;

const renderSwitcher = (
  query: string,
  results: Host[] = [],
  locale = "en",
) => renderToStaticMarkup(
  <I18nProvider locale={locale}>
    <QuickSwitcher
      isOpen
      query={query}
      results={results}
      sessions={[]}
      workspaces={[]}
      onQueryChange={() => undefined}
      onSelect={() => undefined}
      onSelectTab={() => undefined}
      onClose={() => undefined}
      onQuickConnect={() => undefined}
      showSftpTab={false}
    />
  </I18nProvider>,
);

test("quick switcher offers quick connect first when the query is an address", () => {
  const markup = renderSwitcher("10.1.1.1", [host()]);
  const quickConnectAt = markup.indexOf("Quick connect to 10.1.1.1");
  const hostAt = markup.indexOf("core-switch");

  assert.ok(quickConnectAt >= 0);
  assert.ok(hostAt > quickConnectAt);
});

test("quick switcher offers quick connect when nothing else matches", () => {
  const markup = renderSwitcher("root@10.2.0.8:2222");

  assert.match(markup, /Quick connect to root@10\.2\.0\.8:2222/);
  assert.match(markup, /bg-primary\/15[\s\S]*Quick connect to root@10\.2\.0\.8:2222/);
});

test("quick switcher does not offer quick connect for ordinary search text", () => {
  const markup = renderSwitcher("core switch");

  assert.doesNotMatch(markup, /Quick connect to/);
});

test("quick switcher quick connect row uses zh-TW wording", () => {
  const markup = renderSwitcher("10.0.0.8", [], "zh-TW");

  assert.match(markup, /快速連線到 10\.0\.0\.8/);
});
