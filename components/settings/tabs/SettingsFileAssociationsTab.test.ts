import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./SettingsFileAssociationsTab.tsx", import.meta.url), "utf8");

function functionBody(functionName: string): string {
  const start = source.indexOf(`const ${functionName} = useCallback`);
  assert.notEqual(start, -1, `${functionName} should exist`);
  const next = source.indexOf("\n  const ", start + 1);
  return source.slice(start, next === -1 ? source.length : next);
}

test("SFTP settings imports the shared Toggle used by its option rows", () => {
  assert.match(source, /<Toggle\b/);
  assert.match(source, /Toggle,\s*\n\s*Select,/);
});

test("removing an SFTP file association confirms with the in-app dialog", () => {
  assert.match(source, /import \{ ConfirmDialog \} from "\.\.\/\.\.\/ui\/confirm-dialog";/);
  assert.doesNotMatch(source, /window\.confirm|globalThis\.confirm|\bconfirm\(/);
  assert.match(
    source,
    /const \[pendingRemoveExtension, setPendingRemoveExtension\] = useState<string \| null>\(null\);/,
  );

  const handleRemove = functionBody("handleRemove");
  assert.match(handleRemove, /setPendingRemoveExtension\(extension\)/);
  assert.doesNotMatch(handleRemove, /removeAssociation\(/);

  const handleConfirm = functionBody("handleConfirmRemoveAssociation");
  assert.match(handleConfirm, /if \(!pendingRemoveExtension\) return;/);
  assert.match(handleConfirm, /removeAssociation\(pendingRemoveExtension\);/);
  assert.match(handleConfirm, /setPendingRemoveExtension\(null\);/);

  const dialogStart = source.indexOf("<ConfirmDialog");
  assert.notEqual(dialogStart, -1, "ConfirmDialog should be rendered");
  const dialog = source.slice(dialogStart);
  assert.match(dialog, /open=\{pendingRemoveExtension !== null\}/);
  assert.match(dialog, /settings\.sftpFileAssociations\.removeConfirm/);
  assert.match(dialog, /confirmLabel=\{t\('action\.remove'\)\}/);
  assert.match(dialog, /\bdestructive\b/);
  assert.match(dialog, /onConfirm=\{handleConfirmRemoveAssociation\}/);

  const onOpenChange = dialog.slice(dialog.indexOf("onOpenChange"), dialog.indexOf("onConfirm"));
  assert.match(onOpenChange, /if \(!open\) setPendingRemoveExtension\(null\);/);
  assert.doesNotMatch(onOpenChange, /removeAssociation\(/);
});
