import assert from "node:assert/strict";
import test from "node:test";
import { uploadEntriesDirect } from "./uploadService";
import { uploadLocalFoldersProgressively } from "./progressiveFolderUpload";

const warning = "Upload completed; remove backup /remote/.netcatty-backup-file.bin manually.";
const config = {
  targetPath: "/remote", sftpId: "remote", isLocal: false,
  joinPath: (base: string, name: string) => `${base}/${name}`,
  bridge: {
    mkdirSftp: async () => {},
    startStreamTransfer: async ({ transferId }: { transferId: string }) => ({ transferId, warning }),
  },
};

test("external file upload keeps success and the cleanup warning in its direct result", async () => {
  const results = await uploadEntriesDirect([
    { file: null, localPath: "/local/file.bin", relativePath: "file.bin", size: 10, isDirectory: false },
  ], config);
  assert.deepEqual(results, [{ fileName: "file.bin", success: true, warning }]);
});

test("progressive folder upload keeps each successful child's cleanup warning", async () => {
  const results = await uploadLocalFoldersProgressively([{ name: "folder", localPath: "/local/folder" }], {
    ...config,
    listLocalTree: async (_path, options) => {
      options.onEntries?.([
        { localPath: "/local/folder/file.bin", relativePath: "folder/file.bin", type: "file", size: 10, lastModified: 1 },
      ]);
      return [];
    },
  });
  assert.deepEqual(results, [{ fileName: "folder/file.bin", success: true, warning }]);
});
