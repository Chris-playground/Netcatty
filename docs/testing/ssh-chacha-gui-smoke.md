# Verify the saved ChaCha20-only setting in the native app

Keep the application checkout at `8fd8f5580ba13ec2c308f2bd327b9db638493028`.
This support branch supplies a disposable loopback SSH echo server. The server
uses the checkout's installed `ssh2` package and Node/OpenSSL. It accepts one
locally generated synthetic identity and advertises exactly
`chacha20-poly1305@openssh.com` in both directions. It executes no OS commands.

## Start the fixture on the GUI machine

Use a shell with Node.js 22 or newer. Set `APP_CHECKOUT` to the existing app
checkout that already has its dependencies installed. Fetching and extracting
the support files does not change the app's checked-out revision.

```sh
set -eu
APP_CHECKOUT=/path/to/Netcatty
test "$(git -C "$APP_CHECKOUT" rev-parse HEAD)" = 8fd8f5580ba13ec2c308f2bd327b9db638493028
git -C "$APP_CHECKOUT" fetch origin support/3984-chacha-gui-fixture
FIXTURE_REF=$(git -C "$APP_CHECKOUT" rev-parse FETCH_HEAD)
FIXTURE_DIR=$(mktemp -d /tmp/netcatty-3984-gui.XXXXXX)
git -C "$APP_CHECKOUT" show "$FIXTURE_REF:scripts/fixtures/ssh-chacha-gui-server.cjs" > "$FIXTURE_DIR/server.cjs"
node - "$FIXTURE_DIR/credentials.json" <<'JS'
const fs = require('node:fs');
const crypto = require('node:crypto');
fs.writeFileSync(process.argv[2], JSON.stringify({
  username: 'smoke-' + crypto.randomBytes(6).toString('hex'),
  password: crypto.randomBytes(24).toString('hex'),
}), { mode: 0o600, flag: 'wx' });
JS
node "$FIXTURE_DIR/server.cjs" "$APP_CHECKOUT" "$FIXTURE_DIR/credentials.json" > "$FIXTURE_DIR/evidence.jsonl" 2>&1 &
FIXTURE_PID=$!
```

Read the `listening` event in `evidence.jsonl` for the assigned loopback port.
Read the generated credentials file locally to fill the app's authentication
fields. Keep that file and the authentication controls out of reports,
screenshots, and recordings. The server never logs credential values or raw
terminal input.

## Exercise the saved setting

1. Create a disposable SSH host for `127.0.0.1` and the emitted port.
2. Use the generated local identity with password authentication. Use the
   network-device host setting to avoid OS discovery and stats probes against
   this echo-only server.
3. Open advanced SSH algorithms. Select only
   `chacha20-poly1305@openssh.com` under Cipher.
4. Save the host. Close and reopen its editor. Confirm that Cipher still has
   only that selection. Capture the cipher section without authentication fields.
5. Connect to the host and accept the disposable host key.
6. Wait for `SYNTHETIC CHACHA20 SMOKE READY` in the terminal.
7. Type `NETCATTY_CHACHA_SMOKE` and press Enter. Capture the connected terminal
   and echoed marker. Start any recording after the credentials are filled.

## Check the sanitized evidence

The JSONL log must contain both `client-offer` events with exactly one entry:
`chacha20-poly1305@openssh.com`. These are parsed from the client's actual
KEXINIT, rather than from Netcatty's configuration helper.

The `negotiated` event must name that cipher for both `clientToServer` and
`serverToClient`. The same connection must then report `authenticated`,
`shell-open`, and an `echo-check` event with `matched: true`.

This is synthetic SSH transport and saved-setting coverage. It does not test
the reporter's exact OpenWrt/Dropbear device or the separate post-handshake
session-close behavior in #3731. The earlier reporter PCAP predates the final
saved-setting attempt and is not evidence for that final attempt.

## Stop and remove the fixture

```sh
kill "$FIXTURE_PID"
```

Preserve only the sanitized JSONL log and selected screenshots/video. Delete
the credentials file and disposable host entry after the smoke test.
