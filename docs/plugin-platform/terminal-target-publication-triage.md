# Diagnose selected terminal target publication

## Current result

Native acceptance at `677aac33b1eec9dbd4a367417a49c964cdea63e7` failed before
selection permission in cold/warm solo, after A -> Vault -> A, selected split,
and workspace Focus mode. The native worker reported three owned synthetic SSH
channels and zero input events. No Preview, Share or draft opened. The failing
capture guard combines a missing target with a different target sender; the
recorded error alone does not distinguish them.

This isolated continuation adds diagnostics and exercises the complete target
transport. It does not claim to fix or identify the native cause. The frozen
candidate and prior feature branches remain unchanged.

## Reproduce without the native GUI

Run these tests from this worktree after building plugin runtime dependencies:

```sh
node --test electron/plugins/terminalSelectionEntrypoint.test.cjs electron/plugins/terminalSelectionAuthority.test.cjs
node --test --import tsx components/PluginHostInteractionHost.test.tsx application/state/pluginTerminalSelection.test.ts components/terminal/terminalCursorRuntimeLifecycle.test.tsx
```

The installed sample now uses the production selection source and registry,
`createPreloadApi`, `registerPluginBridge` with its actual trusted-origin check,
main authority, manager, package store, permission middleware, SDK and browser RPC
entrypoint. Its terminal worker runtime/manager own synthetic sessions only. The
preview response reads the production registry; it no longer injects a target or
selection directly into the service. Publication acknowledgement is awaited in
the fixture because IPC is asynchronous.

The host-dialog test also uses the real preload and trusted main bridge. Tests
cover rejected foreign senders, unavailable sources before selection permission,
blur, owner release and fresh publication, cancellation, renderer/connection
replacement, hidden state, exact snapshots, separate handles, and inert drafts.
They do not establish Electron or native GUI acceptance.

## Collect the missing native evidence

The parent coordinates the reserved native slot. Do not modify the running
candidate, use a debugger, change helper permissions, or send terminal input.
Prepare a separate diagnostic build with:

```sh
VITE_NETCATTY_TERMINAL_TARGET_DIAGNOSTICS=1 npm run build
```

Use the parent's existing authorized launch recipe with
`NETCATTY_TERMINAL_TARGET_DIAGNOSTICS=1 ELECTRON_ENABLE_LOGGING=1` in its environment.
The Vite flag is needed at build time; the two launch flags enable the main
diagnostics and Electron's normal Chromium logging. Use the same owned
synthetic content and unchanged sample package. Invoke Share once after selecting
its bounded range. Stop after the first decisive failure and preserve only the
`[Plugins:TerminalTarget]` records.

### Collect the renderer records

Each diagnostic call now emits **one string**: the fixed prefix, a space, and
`JSON.stringify` of the existing fixed fields. It no longer passes an object as
a second console argument, which can lose those fields in Chromium's console
message formatting. No general console forwarding or new IPC channel is added.

For the project's normal POSIX launcher, the logging environment is sufficient:

```sh
NETCATTY_TERMINAL_TARGET_DIAGNOSTICS=1 ELECTRON_ENABLE_LOGGING=1 node electron/launch.cjs 2>&1 | rg --line-buffered -F '[Plugins:TerminalTarget]'
```

Preserve the parent's authorized profile/dev-server environment. Leave
`ELECTRON_LOG_FILE` unset for stderr collection. Filter the combined stream before
persisting diagnostic records; enabling Chromium logging can also emit unrelated
messages. Chromium may wrap the single diagnostic string with its ordinary
timestamp/process/source metadata. Main-process records use inherited stdout.

If the parent launches the Electron binary directly, the equivalent ordinary
switches are `--enable-logging --log-level=0`, alongside
`NETCATTY_TERMINAL_TARGET_DIAGNOSTICS=1`. The Node launcher does not forward extra
CLI arguments, so use its environment form above. On Windows, use an owned
diagnostic file via `--enable-logging=file --log-file=<owned-path> --log-level=0`
and retain main stdout as well; Electron documents child-process stderr limits
there. No sandbox or debugger switch is needed.

Evidence: [`electron/launch.cjs`](../../electron/launch.cjs) spawns Electron with
inherited stdio; [`electron/launchEnv.cjs`](../../electron/launchEnv.cjs) preserves
these logging variables. [`electron/main.cjs`](../../electron/main.cjs) only
filters DevTools Autofill noise. Electron's
[supported logging switches](https://www.electronjs.org/docs/latest/api/command-line-switches#--enable-loggingfile)
and [environment variables](https://www.electronjs.org/docs/latest/api/environment-variables#electron_enable_logging)
document this collection route. The pinned runtime's
[logging implementation](https://github.com/electron/electron/blob/v42.11.12/shell/common/logging.cc#L75)
maps `ELECTRON_ENABLE_LOGGING` to the normal stderr destination unless a log file
is selected. This is source/documentation verification; native collection and
acceptance remain for the parent-coordinated replay.

| Record | Meaning |
| --- | --- |
| `renderer-source` | Visibility, pane ownership, connected state, sensitive-clear state, session/terminal-ref presence, DOM attachment |
| `renderer-publication` | Registered/eligible counts, API presence, target-versus-clear intent |
| `renderer-ack` | IPC accepted or rejected; no raw exception |
| `main-ipc` | Fixed `untrusted-sender` or `manager-unavailable` rejection before authority |
| `main-publication` | Accepted target/clear, or fixed `invalid-target` / `other-window` reason |
| `main-release` | Target cleared by owner-window release |
| `main-capture` | `targetPresent`, `targetSenderMatchesCaller`, `callerIsMain` at the failing guard |

These records contain fixed stage/reason strings, booleans and counts only.
They omit terminal text, selection data, labels, session/renderer/plugin/source
identities, owner encodings and tokens. Normal builds/launches emit none. There
is no plugin diagnostic API, retry, terminal read, or PTY write.

If `targetPresent` is false, inspect the preceding source/publication/ack records
for ineligibility, a clear, rejection, or owner release. If true while the sender
comparison is false, retain the three capture booleans and accepted publication
sequence before investigating window ownership. A trusted foreign window is
already rejected by `setTarget`; do not relax that guard. Do not infer either
cause from the shared error message or assume palette focus clears selection.

## State and next action

Actual native cause: **uncertain**. Native replay of this diagnostic build:
**pending parent coordination**. No action was denied or bypassed. A behavioral
fix and fail-before/pass-after native evidence remain pending that discriminator.
The source/runtime/connection guards, explicit preview, consent and input-only
host draft behavior are unchanged.

## Validation and sample

Local checks: 678 plugin-runtime tests passed, one native test skipped, zero
failures; seven focused renderer/dialog tests passed; contract, capability-tool
and Codex schema generation checks left no generated changes; lint passed with
seven existing warnings; the diagnostic production build passed.

The JSON collection delta passed 61 focused bridge/authority/installed-entrypoint/
launcher tests, changed-file lint and a fresh diagnostic production build. A
bundled synthetic renderer probe round-tripped source, publication and ack JSON
as single-line strings and checked that no identities or text entered the records.
Native log collection has not been run in this continuation.

The unchanged two-file sample built to archive SHA-256
`4c9c2388b7f891156192a0b5ab7b23291beba3555e7ec8cf24fbe2dfe1242d5e`
and content SHA-256
`99797d8679f34b96580076f922cbec067e511adc0f4ccf396ed129206acb6c4c`.
Use the integrated candidate's hash, rather than the older feature-only SDK
bundle hash. The branch adds no SDK, schema or sample changes.
