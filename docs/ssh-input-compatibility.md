# SSH input compatibility

The host advanced settings include **输入兼容模式：逐字发送** (input compatibility: send character by character). The help text is **中文输入或短粘贴出现丢字时尝试开启。** Saved changes take effect after reconnecting.

New SSH hosts use standard mode. Compatibility mode retains the interactive text workaround introduced by [PR #3168](https://github.com/binaricat/Netcatty/pull/3168):

- Literal IME commits with multiple Unicode code points use separate writes.
- Plain, unbracketed pastes of at most 32 Unicode code points use separate writes.
- Longer raw pastes, bracketed pastes, Kitty associated text, and the existing confirmed line-paste path retain their current transport behavior.
- Terminal controls stay together. Unicode code points retain their byte order, including combining marks and emoji sequences.

The setting belongs to the terminal endpoint host. A host used only as an SSH network jump does not supply the target's input setting. Other transports retain their existing input behavior. Automated commands, connect scripts, and SFTP do not use this setting.

## Stored records

`Host.sshInputCompatibility` stores the choice as a boolean. `sanitizeHost` migrates an SSH record with a missing field to `true`, including records whose omitted protocol means SSH. It preserves explicit `false` and `true` values on every subsequent load, import, and save. The existing vault normalization and persistence paths save the migrated value. No global migration marker or new storage key is required.

New host creation paths save `false`. Duplicates copy the source value. JSON vault backups and cloud sync retain the field. CSV exports include `SshInputCompatibility`; imports accept `true` and `false`. External imports without that column create standard-mode hosts.

The runtime captures the host's setting when it opens a connection. Reconnect refreshes that setting through `resetConnectionInputState(host)`, including reconnects that reuse the existing runtime.

## Historical evidence

[Issue #3077](https://github.com/binaricat/Netcatty/issues/3077#issuecomment-5433744875) reports that individual hanzi worked in a Qianxin search prompt where multi-character input failed. The report also says Windows with Xshell worked. Those observations do not establish the remote parser's SSH-write semantics or Xshell's default implementation.

The [Xshell 7 manual](https://cdn.netsarang.net/docs/Xshell7_manual.pdf), section 5.2.21, printed page 27, describes session paste character delay, line delay, and prompt waiting. [SecureCRT's echo flow control tip](https://www.vandyke.com/support/tips/echoflowctrl.html) describes a session line delay and an optional script that waits for each line's echo. These references support configurable send compatibility. They do not establish default per-character IME sends or equivalence to a Qianxin-specific fix. This feature adds no delays or echo waiting.

## Verification boundaries

`sshInputCompatibility.integration.test.ts` runs real xterm and `createXTermRuntime` callbacks under JSDOM. It covers raw paste, literal `insertText`, key code 229, composition events, composition fallback, long IME text, terminal controls, bracketed paste, Kitty text, and reconnect with a reused runtime. Local, Telnet, and serial cases verify that the SSH field leaves their legacy text and control-containing payload behavior unchanged. Canvas measurement is stubbed. These tests do not exercise native input methods or application windows.

`useVaultState.inputCompatibility.test.ts` exercises the actual vault hook's asynchronous save, reload, duplicate, JSON backup, local backup payload, and cloud payload apply paths. It uses test localStorage and no native safeStorage key. CSV and endpoint selection have separate round-trip and jump-host tests.

Native application settings, save, reconnect, and OS input-method QA require a desktop run. Qianxin hardware was unavailable during implementation, so compatibility with that endpoint remains unverified.
