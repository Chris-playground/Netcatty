import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { remoteSoftwareRequiresSingleChannel } from "../../domain/singleChannelSshBanner.shared.mjs";
import { sftpRequiresDedicatedLogin } from "../../domain/sftpDedicatedLogin";

const sidePanelSource = readFileSync(new URL("../SftpSidePanel.tsx", import.meta.url), "utf8");
const slotSource = readFileSync(
  new URL("../terminalLayer/terminalLayerSidePanelSlots.tsx", import.meta.url),
  "utf8",
);

test("locate-path write skips sessions waiting on sensitive/password prompts", () => {
  assert.match(
    sidePanelSource,
    /isTerminalSensitiveInputActive\(action\.sessionId\)[\s\S]*?writeToSession\(action\.sessionId, action\.data/,
  );
  assert.match(
    sidePanelSource,
    /if \(isTerminalSensitiveInputActive\(action\.sessionId\)\) return;/,
  );
});

test("locate-path write requires an idle shell prompt before PTY injection", () => {
  assert.match(
    sidePanelSource,
    /isTerminalReadyForCommandInjection\(action\.sessionId\)[\s\S]*?writeToSession\(action\.sessionId, action\.data/,
  );
  assert.match(
    sidePanelSource,
    /if \(!isTerminalReadyForCommandInjection\(action\.sessionId\)\) return;/,
  );
});

test("locate-path uses the confirmed toolbar path rather than an optimistic navigate target", () => {
  assert.match(sidePanelSource, /getNextSftpToolbarDisplayPath\(/);
  assert.match(
    sidePanelSource,
    /path: confirmedLocatePathRef\.current \|\| connection\?\.currentPath/,
  );
});

test("locate-path uses focused session fallback when SFTP cannot reuse the terminal", () => {
  assert.match(sidePanelSource, /resolveLocateSftpPathSessionId\(\{\s*activeSessionId,\s*focusedSessionId,/);
  assert.match(
    slotSource,
    /focusedSessionId=\{panelFocusedSessionId\}/,
  );
});

test("single-channel SFTP opens a dedicated connection instead of the terminal channel", () => {
  assert.match(
    sidePanelSource,
    /const dedicatedSftpLogin = sftpRequiresDedicatedLogin\(\{\s*host: activeHost,\s*remoteSshVersion: sftpBannerDecision\?\.sessionId === activeSessionId\s*\? sftpBannerDecision\.remoteSshVersion\s*: undefined,\s*\}\);/,
  );
  assert.doesNotMatch(sidePanelSource, /activeHost\.singleChannelSsh/);
  assert.doesNotMatch(sidePanelSource, /sftpBannerDecision\.singleChannel/);
  assert.match(sidePanelSource, /reuseTransport: false/);
  assert.match(
    sidePanelSource,
    /const reuseTerminalTransport = !dedicatedSftpLogin &&/,
  );
  assert.match(
    sidePanelSource,
    /sourceSessionId: reuseTerminalTransport/,
  );
});

test("network-device mode and network-vendor banners force dedicated SFTP", () => {
  assert.equal(
    sftpRequiresDedicatedLogin({ host: { deviceType: "network" }, remoteSshVersion: "OpenSSH_9.6" }),
    true,
  );
  assert.equal(
    sftpRequiresDedicatedLogin({ host: { deviceType: "network" } }),
    true,
  );
  assert.equal(
    sftpRequiresDedicatedLogin({ host: { deviceType: "general" }, remoteSshVersion: "-" }),
    true,
  );
  assert.equal(
    sftpRequiresDedicatedLogin({ host: { deviceType: "general" }, remoteSshVersion: "SSH-2.0--" }),
    true,
  );
  assert.equal(
    sftpRequiresDedicatedLogin({ host: { deviceType: "general" }, remoteSshVersion: "SSH-2.0-RGOS_SSH" }),
    true,
  );
  assert.equal(
    sftpRequiresDedicatedLogin({ host: { deviceType: "general" }, remoteSshVersion: "OpenSSH_9.6" }),
    false,
  );
  assert.equal(remoteSoftwareRequiresSingleChannel("-"), false);
  assert.equal(remoteSoftwareRequiresSingleChannel("SSH-2.0--"), false);
});
