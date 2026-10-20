import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { canScheduleCommandCwdProbe, shouldProbeCommandCwd } from "./commandCwdProbe";

test("probes command cwd for session restore even when the SFTP panel is not visible", () => {
  assert.equal(
    shouldProbeCommandCwd({
      restoreTerminalCwd: true,
      visibleSftpHost: null,
      sessionHost: { sftpFollowTerminalCwd: false },
      globalSftpFollowTerminalCwd: false,
    }),
    true,
  );
});

test("does not probe command cwd when neither session restore nor SFTP follow cwd needs it", () => {
  assert.equal(
    shouldProbeCommandCwd({
      restoreTerminalCwd: false,
      visibleSftpHost: null,
      sessionHost: { sftpFollowTerminalCwd: true },
      globalSftpFollowTerminalCwd: true,
    }),
    false,
  );
});

test("probes command cwd for visible SFTP follow cwd using host override", () => {
  assert.equal(
    shouldProbeCommandCwd({
      restoreTerminalCwd: false,
      visibleSftpHost: { sftpFollowTerminalCwd: true },
      sessionHost: { sftpFollowTerminalCwd: false },
      globalSftpFollowTerminalCwd: false,
    }),
    true,
  );
});

test("visible SFTP host override can disable command cwd probing", () => {
  assert.equal(
    shouldProbeCommandCwd({
      restoreTerminalCwd: false,
      visibleSftpHost: { sftpFollowTerminalCwd: false },
      sessionHost: { sftpFollowTerminalCwd: true },
      globalSftpFollowTerminalCwd: true,
    }),
    false,
  );
});

test("schedules the post-command cwd probe for a connected local POSIX shell", () => {
  assert.equal(
    canScheduleCommandCwdProbe({ protocol: "local", status: "connected", shellType: "posix" }),
    true,
  );
  assert.equal(
    canScheduleCommandCwdProbe({ protocol: "local", status: "connected" }),
    true,
  );
});

test("does not schedule a local cwd probe for Windows shells or a disconnected shell", () => {
  assert.equal(
    canScheduleCommandCwdProbe({ protocol: "local", status: "connected", shellType: "powershell" }),
    false,
  );
  assert.equal(
    canScheduleCommandCwdProbe({ protocol: "local", status: "connected", shellType: "cmd" }),
    false,
  );
  assert.equal(
    canScheduleCommandCwdProbe({ protocol: "local", status: "connecting", shellType: "posix" }),
    false,
  );
});

test("keeps the SSH post-command probe on reusable connections only", () => {
  assert.equal(canScheduleCommandCwdProbe({ protocol: "ssh", status: "connected" }), true);
  assert.equal(canScheduleCommandCwdProbe({ protocol: "ssh", status: "disconnected" }), false);
  assert.equal(
    canScheduleCommandCwdProbe({ protocol: "ssh", status: "connected", moshEnabled: true }),
    false,
  );
  assert.equal(canScheduleCommandCwdProbe({ protocol: "telnet", status: "connected" }), false);
});

test("local command submission uses the shared cwd probe gate", () => {
  const source = readFileSync(new URL("../TerminalLayer.tsx", import.meta.url), "utf8");
  const start = source.indexOf("const handleCommandSubmitted = useCallback");
  const end = source.indexOf("const handleCommandExecuted = useCallback", start);
  const body = source.slice(start, end);
  assert.match(body, /canScheduleCommandCwdProbe\(session\)/);
  assert.match(body, /session\.protocol === "local"\) return true/);
});

test("does not probe command cwd on single-channel SSH hosts", () => {
  assert.equal(
    shouldProbeCommandCwd({
      restoreTerminalCwd: true,
      visibleSftpHost: { sftpFollowTerminalCwd: true },
      sessionHost: { sftpFollowTerminalCwd: true },
      globalSftpFollowTerminalCwd: true,
      restrictExtraSshChannels: true,
    }),
    false,
  );
});
