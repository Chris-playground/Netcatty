// Exercise shipped JS/dependencies with the same Electron runtime, headlessly.
// No BrowserWindow, real accounts, or external SSH hosts are involved.
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const releaseDir = path.resolve("release");
const archives = fs.readdirSync(releaseDir, { recursive: true })
  .filter((entry) => path.basename(entry) === "app.asar")
  .map((entry) => path.join(releaseDir, entry));
if (archives.length === 0) throw new Error("No packaged app.asar found");
for (const appRoot of archives) {
  console.log(`Testing packaged SSH transport: ${appRoot}`);
  const result = spawnSync(process.execPath, ["--test", "electron/bridges/sshChaChaTransport.test.cjs"], {
    env: {
      ...process.env,
      NETCATTY_SSH_TEST_APP_ROOT: appRoot,
      NETCATTY_SSH_TEST_RUNTIME: require("electron"),
    },
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
