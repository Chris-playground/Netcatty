import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./useVaultState.ts", import.meta.url), "utf8");

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
});
