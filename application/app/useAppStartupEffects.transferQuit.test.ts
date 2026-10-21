import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { useAppStartupEffects } from "./useAppStartupEffects.ts";
import { sftpTransferCenterStore } from "../state/sftpTransferCenterStore.ts";
import { netcattyBridge } from "../../infrastructure/services/netcattyBridge.ts";

for (const accept of [false, true]) {
  test(`app Quit with an unfinished transfer: ${accept ? "confirm quits" : "declining resumes the transfer and reports \"transfers\""}`, async (t) => {
    const previous = Object.getOwnPropertyDescriptor(globalThis, "IS_REACT_ACT_ENVIRONMENT");
    Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", { configurable: true, value: true });
    const g = globalThis as unknown as { window?: { confirm?: (m: string) => boolean } };
    const hadWindow = "window" in g; const previousConfirm = g.window?.confirm;
    if (!g.window) g.window = {};
    g.window.confirm = () => accept;
    let renderer: ReactTestRenderer | undefined;
    t.after(async () => {
      await act(async () => renderer?.unmount());
      if (hadWindow && g.window) g.window.confirm = previousConfirm; else delete g.window;
      if (previous) Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", previous);
      else Reflect.deleteProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT");
    });
    const calls: string[] = [];
    const reports: Array<[boolean, string | undefined]> = [];
    let query!: () => Promise<void>;
    t.mock.method(sftpTransferCenterStore, "getSnapshot", () => ({
      tasks: [
        { id: "running", status: "transferring" },
        { id: "already-paused", status: "paused" },
        { id: "child", parentTaskId: "running", status: "transferring" },
      ],
    }) as unknown as ReturnType<typeof sftpTransferCenterStore.getSnapshot>);
    t.mock.method(sftpTransferCenterStore, "pause", async (id: string) => { calls.push(`pause:${id}`); });
    t.mock.method(sftpTransferCenterStore, "resume", async (id: string) => { calls.push(`resume:${id}`); });
    t.mock.method(netcattyBridge, "get", () => ({
      onCheckDirtyEditors: (callback: typeof query) => { query = callback; return () => {}; },
      reportDirtyEditorsResult: (dirty: boolean, reason?: string) => reports.push([dirty, reason]),
    }));
    function Probe() {
      useAppStartupEffects({ enabled: false, updateState: {}, sessions: [], hosts: [], keys: [], identities: [], knownHosts: [], proxyProfiles: [], groupConfigs: [], workspaces: [], portForwardingRules: [], t: (key: string) => key });
      return null;
    }
    await act(async () => { renderer = create(React.createElement(Probe)); });
    await query();
    if (accept) {
      assert.deepEqual(reports, [[false, undefined]]);
      assert.deepEqual(calls, ["pause:running", "pause:already-paused"], "tasks stay paused so they restore as resumable");
    } else {
      assert.deepEqual(reports, [[true, "transfers"]], "main must be told the prompt was already answered");
      assert.deepEqual(calls, ["pause:running", "pause:already-paused", "resume:running"],
        "only the task the prompt paused is resumed; a user-paused task stays paused");
    }
  });
}
