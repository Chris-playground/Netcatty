# Diagnose selected terminal target publication

## Current result

Native acceptance at `677aac33b1eec9dbd4a367417a49c964cdea63e7` failed before
selection permission in cold/warm solo, after A -> Vault -> A, selected split,
and workspace Focus mode. The native worker reported three owned synthetic SSH
channels and zero input events. No Preview, Share or draft opened. The failing
capture guard combines a missing target with a different target sender; the
recorded error alone does not distinguish them.

This isolated continuation adds diagnostics and exercises the complete target
transport. The subsequent evidence below identifies a fixture-induced sensitive
input stop. No production behavior correction is warranted by that evidence.
The frozen candidate and prior feature branches remain unchanged.

## Native discriminator and fixture verification

At diagnostic runtime head `587bc9f3f9979dfc89c0389e21b0951425d2f875`, the parent
reported a visible, pane-owned, connected and attached solo source with both
session and terminal refs present. `sensitiveClear` was false. The registry had
one source, zero eligible targets and an available API; main accepted its clear,
and the renderer received a successful acknowledgement. This establishes source
ineligibility and rules out a rejected publication for that observation.

The parent supplied the fixture's final prompt `fixture-A> ` and confirmed the
baseline used the same output. The complete native output bytes are not present
in this worktree. Direct invocation of the production renderer and shared main
classifiers verifies the exact supplied prompt (ordinary SSH options,
`allowHostStyleGreaterThan: false`, `alternateScreen: false`):

| Synthetic prompt | Confirmed shell | Untrusted input | Shared main untrusted |
| --- | --- | --- | --- |
| `fixture-A> ` | false | true | true |
| `fixture-B> ` | false | true | true |
| `fixture@owned-A:~$ ` | true | false | false |
| `fixture@owned-B:~$ ` | true | false | false |

These prompts contain no recognized sensitive vocabulary. The existing policy
also treats an ambiguous prompt-shaped `>` boundary as untrusted, protecting
custom authentication challenges. Host-name-style `>` prompts are confirmed only
for actual network-device mode. The fixture is exercising that deliberate guard.

[`Terminal.observeTerminalInputPrompt`](../../components/Terminal.tsx#L2054)
folds the output and sets `passwordPromptActiveRef.current = true` for an untrusted
prompt; the selected-terminal source receives that same flag at line 939.
[`isConfirmedTerminalShellPrompt`](../../domain/terminalPromptSecurity.ts#L150)
and [`isUntrustedTerminalInputPrompt`](../../domain/terminalPromptSecurity.ts#L292)
produce the classifications above. The source's `sensitive !== false` guard then
correctly yields no target. This matches the native diagnostic sequence.

The regression in `application/state/pluginTerminalSelection.test.ts` uses the
real output folder and classifiers with constructed synthetic marker lines and
the exact reported prompt. Both whole-stream and character-by-character delivery
(including split CRLF) latch sensitivity and block the real selection source.
A subsequent ordinary shell prompt clears the latch; a later password boundary
blocks it again. Classification never reads the selection.

### Minimal fixture correction and recheck

Change only the owned SSH fixture server's emitted prompt literals from
`fixture-A> ` / `fixture-B> ` to `fixture@owned-A:~$ ` /
`fixture@owned-B:~$ `. Keep the unique selected content, transport ownership and
all product settings unchanged. Start fresh fixture sessions and repeat the
parent-coordinated native check. Do not send commands to make a prompt, label the
fixture as a network device, override sensitivity metadata, or relax any guard.

The fixture source and reserved GUI slot belong to the native worker and are
not available in this worktree; the edit and native recheck remain pending there.
Runtime head `587bc9f3f` can be reused with that separately recorded fixture
change: this follow-up changes tests and this record only. The earlier matrix
failures with the unchanged prompt are retained as **fixture-induced safety
stops**. They do not establish failure of the corrected ordinary-shell fixture,
whose native preview, consent, draft and zero-input checks remain pending.

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

Observed cause: **fixture prompt deliberately classified as untrusted input**.
Corrected fixture edit and native recheck: **pending parent/native-worker
coordination**. No action was denied or bypassed. No behavioral production patch
is warranted for this evidence. The source/runtime/connection guards, explicit
preview, consent and input-only host draft behavior are unchanged.

## Validation and sample

Local checks: 678 plugin-runtime tests passed, one native test skipped, zero
failures; seven focused renderer/dialog tests passed; contract, capability-tool
and Codex schema generation checks left no generated changes; lint passed with
seven existing warnings; the diagnostic production build passed.

The JSON collection delta passed 61 focused bridge/authority/installed-entrypoint/
launcher tests, changed-file lint and a fresh diagnostic production build. A
bundled synthetic renderer probe round-tripped source, publication and ack JSON
as single-line strings and checked that no identities or text entered the records.
Native log collection was performed by the parent/native worker at `587bc9f3f`;
this continuation consumes its fixed diagnostic fields and runs no native GUI.
The fixture-prompt follow-up passed 16 classifier/selection-source tests and
changed-file lint; it changes no runtime file.

The unchanged two-file sample built to archive SHA-256
`4c9c2388b7f891156192a0b5ab7b23291beba3555e7ec8cf24fbe2dfe1242d5e`
and content SHA-256
`99797d8679f34b96580076f922cbec067e511adc0f4ccf396ed129206acb6c4c`.
Use the integrated candidate's hash, rather than the older feature-only SDK
bundle hash. The branch adds no SDK, schema or sample changes.
