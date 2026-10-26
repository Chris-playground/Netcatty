# Batch 1 aggregate failure comparison

Frozen base: `e5bd294cddbf58dfe04c646b6291933d980498fd`. Current:
`9af123e5d7bdb15771d69fb427faacf32c46dfb3`. Same Node 24.19.0 executable,
same installed dependency tree, same sandbox and environment. Tests use existing
synthetic fixtures. No home/cache permission or native-build bypass was added.

The 39 entries below were observed before stopping the local full suite.
Later runner failures caused by that explicit termination are excluded. This
is not a successful aggregate run and is not proof that every full-suite test
was executed. The full suite was stopped after existing/environmental failures
to avoid presenting an incomplete run as green.

## Bounded comparison result

Targeted test-name patterns selected the original 39 failures across 15 files.
Thirty-eight fail on both frozen base and current with matching failure titles
and key error signatures. The persistence-volume assertion passes on both.
Three additional paired repetitions of that assertion also pass on both: four
passing runs per side including the initial comparison. Its code is unchanged;
the aggregate-only result remains a timing-sensitive limitation, not an
established current-only regression.

The first baseline rerun reproduced 11 entries: rows 1-2 and 4-12. It did not
reproduce row 3. No new source change fixes unrelated baseline failures.

| Rows | Signature and classification |
| --- | --- |
| 1-2, 14-16, 27-33, 35-39 | Host temp-dir creation fails outside writable roots (`ENOENT` from `tempDirBridge`). Both revisions fail. Environment constraint |
| 4-9 | Markdown comparison falls back to source; expected rich-preview elements are absent. Both revisions fail. Existing baseline/dependency behavior; no source repair in this scope |
| 10-12 | Native `pty.node` missing from normal build/prebuild lookup. Both revisions fail. Dependency/native setup constraint |
| 13 | UI algorithm list includes `ssh-ed25519-cert-v01@openssh.com` but installed ssh2 rejects it. Both revisions fail. Existing baseline/dependency behavior |
| 17-26 | Cursor discovery/SDK expectations differ (`false` vs `true`, then expected installation/auth DTO). Both revisions fail with matching assertion signatures. Existing environment/dependency behavior; no real account accessed |
| 34 | Electron bootstrap fetch fails and the binary is not installed. Both revisions fail. Dependency/network setup constraint |
| 3 | Persistence writes exceed aggregate threshold; isolated baseline/current and three repetitions each pass. Aggregate-only timing-sensitive assertion; no current-only failure reproduced |

## Original titles and first error

| # | Test file | Original title | First key error | Paired result |
| --- | --- | --- | --- | --- |
| 1 | `application/state/sftp/dedicatedTransferResume.test.ts` | large-history replace recovery retransfers retained completed children into its empty stage: late=false | ENOENT creating host temp directory from tempDirBridge | base/current same failure |
| 2 | `application/state/sftp/dedicatedTransferResume.test.ts` | large-history replace recovery retransfers retained completed children into its empty stage: late=true | ENOENT creating host temp directory from tempDirBridge | base/current same failure |
| 3 | `application/state/sftpTransferCenterStore.test.ts` | large directory progress coalesces synchronous persistence work | AssertionError [ERR_ASSERTION]: expected bounded persistence volume, wrote 2638624 characters for a 588644-character snapshot | base/current pass; aggregate-only |
| 4 | `components/notes/InlineMarkdownEditor.unrenderableMarkdown.test.tsx` | literal Markdown comparisons render without changing the note source | AssertionError [ERR_ASSERTION]: a comparison must render as ordinary text | base/current same failure |
| 5 | `components/notes/InlineMarkdownEditor.unrenderableMarkdown.test.tsx` | comparison variants render in paragraphs, tables and alongside HTML | assert.ok(!querySourceFallback(rootNode)) is false | base/current same failure |
| 6 | `components/notes/InlineMarkdownEditor.unrenderableMarkdown.test.tsx` | issue 3205 author note survives source, preview and edit without rewriting | AssertionError [ERR_ASSERTION]: preview must render the author's note | base/current same failure |
| 7 | `components/notes/InlineMarkdownEditor.unrenderableMarkdown.test.tsx` | editing a comparison emits Markdown that can be reopened | assert.ok(editable): actual null | base/current same failure |
| 8 | `components/notes/InlineMarkdownEditor.unrenderableMarkdown.test.tsx` | preview task checkboxes still save explicit changes without rewriting comparisons | assert.ok(task): actual null | base/current same failure |
| 9 | `components/notes/InlineMarkdownEditor.unrenderableMarkdown.test.tsx` | switching between a comparison note and an unsupported note keeps the fallback scoped | assert.ok(!querySourceFallback(rootNode)) is false | base/current same failure |
| 10 | `components/terminal/runtime/serialInputSequences.test.ts` | components/terminal/runtime/serialInputSequences.test.ts | Failed to load native module: pty.node | base/current same failure |
| 11 | `components/terminal/runtime/terminalLinePaste.test.ts` | components/terminal/runtime/terminalLinePaste.test.ts | Failed to load native module: pty.node | base/current same failure |
| 12 | `components/terminal/runtime/terminalPasteCancellation.test.ts` | components/terminal/runtime/terminalPasteCancellation.test.ts | Failed to load native module: pty.node | base/current same failure |
| 13 | `domain/sshAlgorithmList.test.ts` | SUPPORTED_ALGORITHMS_BY_CATEGORY only lists algorithms ssh2 will actually accept | AssertionError [ERR_ASSERTION]: ssh-ed25519-cert-v01@openssh.com (serverHostKey) is in the UI list but ssh2 would reject it | base/current same failure |
| 14 | `electron/bridges/ai/liveShellProbe.test.cjs` | Bash invoked as sh cleans probe history | ENOENT creating host temp directory from tempDirBridge | base/current same failure |
| 15 | `electron/bridges/ai/liveShellProbe.test.cjs` | Bash invoked as renamed-bash cleans probe history | ENOENT creating host temp directory from tempDirBridge | base/current same failure |
| 16 | `electron/bridges/aiBridge.externalContext.test.cjs` | electron/bridges/aiBridge.externalContext.test.cjs | ENOENT creating host temp directory from sshBridge import | base/current same failure |
| 17 | `electron/bridges/aiBridge.test.cjs` | resolve-cli reports Cursor Agent CLI on PATH as installed without CLI login | AssertionError [ERR_ASSERTION]: Expected values to be strictly equal: | base/current same failure |
| 18 | `electron/bridges/aiBridge.test.cjs` | resolve-cli reports Cursor SDK installed but unavailable without an API key | AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal: | base/current same failure |
| 19 | `electron/bridges/aiBridge.test.cjs` | resolve-cli separates Cursor SDK installation from API key availability | AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal: | base/current same failure |
| 20 | `electron/bridges/aiBridge.test.cjs` | resolve-cli ignores custom Cursor paths and stores the SDK sentinel path | AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal: | base/current same failure |
| 21 | `electron/bridges/aiBridge.test.cjs` | resolve-cli exposes Cursor SDK support when installed and authenticated | AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal: | base/current same failure |
| 22 | `electron/bridges/aiBridge.test.cjs` | resolve-cli exposes Cursor SDK support when API key is saved in settings | AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal: | base/current same failure |
| 23 | `electron/bridges/aiBridge.test.cjs` | resolve-cli reports settings as Cursor auth source when settings and env keys both exist | AssertionError [ERR_ASSERTION]: Expected values to be strictly equal: | base/current same failure |
| 24 | `electron/bridges/aiBridge.test.cjs` | resolve-cli can refresh shell env before resolving Cursor | AssertionError [ERR_ASSERTION]: Expected values to be strictly equal: | base/current same failure |
| 25 | `electron/bridges/aiBridge.test.cjs` | discover exposes Cursor SDK support when API key is saved in settings | AssertionError [ERR_ASSERTION]: Expected values to be strictly equal: | base/current same failure |
| 26 | `electron/bridges/aiBridge.test.cjs` | discover can refresh shell env before scanning Cursor | AssertionError [ERR_ASSERTION]: Expected values to be strictly equal: | base/current same failure |
| 27 | `electron/bridges/aiBridge/sdk/copilotDriver.test.cjs` | listCopilotModels resolves a Windows .cmd shim to the copilot JS entry before the SDK sees it | ENOENT creating host temp directory from tempDirBridge | base/current same failure |
| 28 | `electron/bridges/aiBridge/sdk/copilotDriver.test.cjs` | listCopilotModels retains the official loader when its platform runtime is unavailable | ENOENT creating host temp directory from tempDirBridge | base/current same failure |
| 29 | `electron/bridges/aiBridge/sdk/copilotDriver.test.cjs` | resolveCopilotPlatformExecutable resolves the platform package exe from the loader root | ENOENT creating host temp directory from tempDirBridge | base/current same failure |
| 30 | `electron/bridges/aiBridge/sdk/copilotDriver.test.cjs` | resolveCopilotExecutableForSdk resolves npm's copilot.ps1 wrapper to the JS entry on Windows | ENOENT creating host temp directory from tempDirBridge | base/current same failure |
| 31 | `electron/bridges/aiBridge/sdk/copilotDriver.test.cjs` | connectCopilotStdioPath directly selects the official loader's native runtime | ENOENT creating host temp directory from tempDirBridge | base/current same failure |
| 32 | `electron/bridges/aiBridge/sdk/opencodeDriver.startup.test.cjs` | OpenCode releases the process-env gate after spawning separate catalog profiles | ENOENT creating host temp directory from tempDirBridge | base/current same failure |
| 33 | `electron/bridges/aiBridge/sdk/opencodeDriver.test.cjs` | createOpenCodeProcessEnv prefers an existing opencode binary | ENOENT creating host temp directory from tempDirBridge | base/current same failure |
| 34 | `electron/bridges/aiEchoSuppressionOrdering.test.cjs` | electron/bridges/aiEchoSuppressionOrdering.test.cjs | fetch failed; Electron failed to install correctly | base/current same failure |
| 35 | `electron/bridges/autoUpdateBridge.test.cjs` | recognizes packaged Linux FPM formats as auto-update capable | ENOENT creating host temp directory from tempDirBridge | base/current same failure |
| 36 | `electron/bridges/autoUpdateBridge.test.cjs` | allows the update check to reach electron-updater for a packaged Linux deb | ENOENT creating host temp directory from tempDirBridge | base/current same failure |
| 37 | `electron/bridges/autoUpdateBridge.test.cjs` | keeps the manual-update fallback for an unmarked Linux package | ENOENT creating host temp directory from tempDirBridge | base/current same failure |
| 38 | `electron/bridges/autoUpdateBridge.test.cjs` | keeps AppImage auto-update support on Linux | ENOENT creating host temp directory from tempDirBridge | base/current same failure |
| 39 | `electron/bridges/autoUpdateBridge.test.cjs` | install handler reports package-manager failures and restores the app state | ENOENT creating host temp directory from tempDirBridge | base/current same failure |

## Reproduction method

For each file above, run the existing test with the same title pattern in each
checkout. Pass the title pattern as an argument, without interpolating it as
shell code. Native/import failures occur before the title filter can execute.

```sh
node --test --import tsx --test-reporter=tap --test-name-pattern "<escaped original title>" <test file>
```

The comparison used bounded 90-second subprocess deadlines. None reached that
deadline. The persistence repeat used the same existing test and a 60-second
deadline. It added no load generator or attack payload.

All 15 test files and the business modules responsible for these signatures
are unchanged by batch 1. This classification does not resolve the two
independently reported grant-management review findings; those receive
separate source fixes and tests.
