import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./useVaultState.ts", import.meta.url), "utf8");
const terminalLayerSource = readFileSync(
  new URL("../../components/TerminalLayer.tsx", import.meta.url),
  "utf8",
);

test("connection log replay blobs persist through IndexedDB instead of the legacy localStorage blob", () => {
  assert.match(source, /await migrateLegacyConnectionLogTerminalData\(/);
  assert.match(source, /await writeTerminalDataMapDiff\(/);
  assert.match(source, /STORAGE_KEY_CONNECTION_LOG_TERMINAL_DATA_REV/);
  assert.match(source, /syncConnectionLogTerminalData !== false|syncConnectionLogTerminalData\)/);
  assert.doesNotMatch(source, /writeTerminalDataMapWithQuotaRetry/);
  assert.doesNotMatch(
    source,
    /localStorageAdapter\.write\(\s*STORAGE_KEY_CONNECTION_LOG_TERMINAL_DATA\s*,/,
  );
});

test("close-path connection log updates await the indexedDB persist task", () => {
  assert.match(
    source,
    /const updateConnectionLog = useCallback\([\s\S]*?return commitConnectionLogs\(/,
  );
  assert.match(
    terminalLayerSource,
    /const handleTerminalDataCapture = useCallback\(\(sessionId: string, data: string\) => \{\s*return onTerminalDataCapture\?\.\(sessionId, data\);/,
  );
});

test("boot re-reads connection logs after indexedDB load and falls back to the main blob", () => {
  const bootAt = source.indexOf("const loaded = await migrateLegacyConnectionLogTerminalData");
  assert.notEqual(bootAt, -1);
  const bootSlice = source.slice(bootAt, bootAt + 1800);
  assert.match(
    bootSlice,
    /localStorageAdapter\.read<ConnectionLog\[\]>\(\s*STORAGE_KEY_CONNECTION_LOGS,\s*\)[\s\S]*?pruneTerminalDataMapForStorage\(connectionLogsForBoot/,
  );
  assert.match(
    source,
    /!sidePersisted && unsavedTerminalDataPending && mainPersisted\) \{\s*\/\/[\s\S]*?localStorageAdapter\.read<ConnectionLog\[\]>\(\s*STORAGE_KEY_CONNECTION_LOGS\s*\)[\s\S]*?mergeTerminalDataIntoLogs\(freshLogs, buildTerminalDataMapFromLogs\(logs\)\)/,
  );
});
