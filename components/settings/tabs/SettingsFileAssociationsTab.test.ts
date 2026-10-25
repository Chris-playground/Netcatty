import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./SettingsFileAssociationsTab.tsx", import.meta.url), "utf8");

test("SFTP settings imports the shared Toggle used by its option rows", () => {
  assert.match(source, /<Toggle\b/);
  assert.match(source, /Toggle,\s*\n\s*Select,/);
});

test("SFTP file association removal uses the in-app confirm dialog", () => {
  assert.match(source, /import \{ ConfirmDialog \} from "\.\.\/\.\.\/ui\/confirm-dialog"/);
  assert.match(source, /<ConfirmDialog\b/);
  assert.doesNotMatch(source, /\bconfirm\s*\(/);
});
