import assert from "node:assert/strict";
import { test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";
import { I18nProvider } from "../../application/i18n/I18nProvider";
import { writeMonitorPanels } from "../../application/state/monitorPanelsStorage";
import type { Host } from "../../domain/models";
import type { MonitorPoint } from "../../domain/monitorRuntime";
import { MonitorPanels, MonitorTrend } from "./MonitorPanels";

const now = 1_800_000_000_000;
const point = (ago: number, cpu: number | null): MonitorPoint => ({
  at: now - ago,
  cpu,
  memory: null,
  disk: null,
  rx: null,
  tx: null,
});
const trend = (points: MonitorPoint[]) => new JSDOM(renderToStaticMarkup(
  <MonitorTrend points={points} field="cpu" range={5} interval={10} label="CPU trend" />,
)).window.document;

test("empty trends do not draw a reading", (t) => {
  t.mock.method(Date, "now", () => now);
  const document = trend([]);
  assert.equal(document.querySelectorAll("svg g path, svg circle").length, 0);
});

test("a first reading is visible at its actual time without invented history", (t) => {
  t.mock.method(Date, "now", () => now);
  const document = trend([point(1000, 40)]);
  const dot = document.querySelector("circle")!;
  assert.equal(Number(dot.getAttribute("cx")), 299);
  assert.equal(document.querySelector('g path[fill="none"]')!.getAttribute("d"), "M 299.00 36.40");
  const area = document.querySelector("g path")!.getAttribute("d")!;
  assert.equal(area, "M 299.00 36.40 L 299.00 58 L 299.00 58 Z");
});

test("trend lines and shaded areas break at missing readings and collection gaps", (t) => {
  t.mock.method(Date, "now", () => now);
  for (const points of [
    [point(40000, 20), point(30000, null), point(20000, 30), point(10000, 40)],
    [point(50000, 20), point(10000, 30), point(0, 40)],
  ]) {
    const document = trend(points);
    const segments = [...document.querySelectorAll("svg g")];
    assert.equal(segments.length, 2);
    assert.equal(segments[0].querySelector('path[fill="none"]')!.getAttribute("d")!.includes(" L "), false);
    assert.equal(segments[1].querySelector('path[fill="none"]')!.getAttribute("d")!.includes(" L "), true);
    // Each area starts at its own segment, rather than extending to the chart origin.
    for (const segment of segments) {
      const firstX = segment.querySelector("path")!.getAttribute("d")!.split(" ")[1];
      assert.ok(Number(firstX) > 0);
      assert.ok(segment.querySelector("path")!.getAttribute("d")!.endsWith(`L ${firstX} 58 Z`));
    }
  }
});

test("multiple host charts use independent gradient references", () => {
  const document = new JSDOM(renderToStaticMarkup(<>
    <MonitorTrend points={[]} field="cpu" range={5} interval={10} label="CPU" />
    <MonitorTrend points={[]} field="memory" range={5} interval={10} label="Memory" />
  </>)).window.document;
  const ids = [...document.querySelectorAll("linearGradient")].map((g) => g.id);
  assert.equal(new Set(ids).size, 2);
});

const hosts: Host[] = [
  { id: "custom", label: "Cloud host", hostname: "cloud.example.com", username: "test", port: 22, os: "linux", tags: [], createdAt: 1, iconMode: "custom", iconId: "cloud", iconColorMode: "manual", iconColorCustom: "#9333EA" },
  { id: "brand", label: "Ubuntu host", hostname: "ubuntu.example.com", username: "test", port: 22, os: "linux", tags: [], createdAt: 1, distro: "ubuntu" },
];

for (const view of ["list", "charts"] as const) {
  test(`${view} keeps saved custom icons, colors and OS logos`, (t) => {
    const storage = new Map<string, string>();
    const original = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
    Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    } });
    t.after(() => {
      if (original) Object.defineProperty(globalThis, "localStorage", original);
      else Reflect.deleteProperty(globalThis, "localStorage");
    });
    writeMonitorPanels([{ id: "panel", name: "Panel", description: "", hostIds: hosts.map((h) => h.id), view, interval: 10, range: 15, sort: "manual", attentionOnly: false }]);
    const document = new JSDOM(renderToStaticMarkup(
      <I18nProvider locale="en"><MonitorPanels hosts={hosts} customGroups={[]} onConnect={() => {}} /></I18nProvider>,
    )).window.document;
    const icon = document.querySelector(".lucide-cloud")!;
    assert.ok(icon);
    assert.equal((icon.parentElement as HTMLElement).style.backgroundColor, "rgb(147, 51, 234)");
    assert.ok(document.querySelector('img[src="/distro/ubuntu.svg"]'));
    assert.ok(document.querySelector(".lucide-gauge"));
    assert.equal(document.querySelector(".lucide-activity"), null);
  });
}
