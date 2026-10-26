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

The connection captures the host's setting under its session-owned terminal settings ref. This snapshot survives xterm disposal and the actual hibernate wake/reattach path. Reconnect refreshes the setting through `resetConnectionInputState(host)`, including reconnects that reuse the existing runtime.

## Historical evidence

[Issue #3077](https://github.com/binaricat/Netcatty/issues/3077#issuecomment-5433744875) reports that individual hanzi worked in a Qianxin search prompt where multi-character input failed. The report also says Windows with Xshell worked. Those observations do not establish the remote parser's SSH-write semantics or Xshell's default implementation.

The [Xshell 7 manual](https://cdn.netsarang.net/docs/Xshell7_manual.pdf), section 5.2.21, printed page 27, describes session paste character delay, line delay, and prompt waiting. [SecureCRT's echo flow control tip](https://www.vandyke.com/support/tips/echoflowctrl.html) describes a session line delay and an optional script that waits for each line's echo. These references support configurable send compatibility. They do not establish default per-character IME sends or equivalence to a Qianxin-specific fix. This feature adds no delays or echo waiting.

## Verification boundaries

`sshInputCompatibility.integration.test.ts` runs real xterm and `createXTermRuntime` callbacks under JSDOM. It covers raw paste, literal `insertText`, key code 229, composition events, composition fallback, long IME text, terminal controls, bracketed paste, Kitty text, reconnect with a reused runtime, and the actual `wakeTerminalFromHibernate` entry after a saved setting changes. Local, Telnet, serial, Mosh, and Eternal Terminal cases verify that the SSH field leaves their legacy text and control-containing payload behavior unchanged. Canvas measurement is stubbed. These tests do not exercise native input methods or application windows.

`useVaultState.inputCompatibility.test.ts` exercises the actual vault hook's asynchronous save, reload, duplicate, JSON backup, local backup payload, and cloud payload apply paths. It uses test localStorage and no native safeStorage key. CSV and endpoint selection have separate round-trip and jump-host tests.

## Isolated OpenSSH timing fixture

The implementation-side fixture connected to an owned OpenSSH server on `127.0.0.1:22379` using public-key authentication. It executed `cat` without a PTY because the unprivileged daemon could not allocate one. Production IME/raw-paste selectors and the code-point chunker supplied an `ssh2` client's `channel.write` calls. This fixture did not include native GUI events, renderer IPC, clipboard handling, or an OS input method.

Each sample used 15 consecutive repetitions per mode on the same ready SSH channel. Standard mode ran before compatibility mode for each sample; the modes were not randomized or interleaved. Authentication, command startup, selector evaluation, and chunk-array construction finished before timing. Each repetition started immediately before its first `channel.write` call and ended after the awaited receive-length condition resolved: the client's echo buffer contained at least the expected UTF-8 byte length. The complete received buffer was then compared byte-for-byte with the input, outside the timer. No artificial send delay was added.

The table reports milliseconds. Median is the eighth sorted observation. P95 uses nearest rank, which is the largest of 15 observations here. Every repetition in all six tested sample pairs preserved the exact input bytes.

| Sample | UTF-8 bytes | Client writes, standard / compatibility | Echo median, standard / compatibility | Echo P95, standard / compatibility |
|---|---:|---:|---:|---:|
| `中文输入` (IME selector) | 12 | 1 / 4 | 47.439 / 44.572 | 57.971 / 48.418 |
| `中文👩🏽‍💻é-hostname-123` (raw paste) | 37 | 1 / 21 | 46.628 / 47.957 | 51.753 / 55.012 |
| `中` repeated 32 times (raw paste) | 96 | 1 / 32 | 44.122 / 47.536 | 49.040 / 54.734 |
| `中文abc👩🏽‍💻é` repeated 4,096 times (raw paste) | 110,592 | 1 / 1 | 5.433 / 6.240 | 26.105 / 54.073 |
| Arrow sequence `ESC [ A` | 3 | 1 / 1 | 44.320 / 47.657 | 55.726 / 52.414 |
| Bracketed paste containing `中文` | 18 | 1 / 1 | 44.151 / 44.995 | 48.959 / 55.769 |

These are local end-to-end SSH echo completion times for this fixture. They are not native app paste latency, remote processing time, a throughput benchmark, or evidence that the previous behavior caused lag. Client write-call counts do not establish SSH packet boundaries, server read boundaries, or SSH channel-data block counts.

## Native desktop evidence status

The interim native QA report for code commit `bd5f27ff42d29b18c0e9cb3513415da3243dd636` confirms bidirectional save/reconnect and full hibernate/wake checks. The native fixture's 37-byte short sample retained identical content in both modes and produced 1 / 13 observed SSH channel-data blocks. Those block counts are a different observation from the implementation fixture's 1 / 21 client write calls. The native 128 KiB long sample also retained identical content; it is not the 110,592-byte timing sample above. The interim report does not provide repetition counts or timings for these native observations, so no native median or P95 is reported.

The native run's measured receive or completion times, when supplied, must state their own start and end boundaries. They cannot be substituted for the implementation fixture's client echo timings. Actual OS IME coverage must be stated separately from synthetic DOM-event coverage and native clipboard/paste coverage.

The isolated-profile legacy-record startup migration check and the final native report are pending. Native acceptance is not marked complete. Qianxin hardware was unavailable during implementation, so compatibility with that endpoint remains unverified.
