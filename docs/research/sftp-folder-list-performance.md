# Expanded SFTP folder-list responsiveness

The global transfer center already limited mounted top-level rows, but expanding
a folder rendered every retained child file. Each progress update also rebuilt
all folder groups and sorted their children. A folder with thousands of queued
files therefore stalled the renderer even when only one file's bytes changed.

The child list now mounts its visible range with a small overscan. Its existing
scroll area still reaches every retained file. The transfer center reads a stable
hierarchy snapshot between lifecycle changes; mounted parent/child rows subscribe
to their own live progress. Progress that introduces a row or changes its status
still refreshes the hierarchy. Completion retention and compact checkpoints are
unchanged.

## Controlled measurements

A separate Electron window mounted the actual before/after transfer center with
two synthetic directory transfers. No SSH connection, real file or user transfer
was involved. The same expand action, ten updates to one child and a scroll to
the final file were exercised in each version.

| Children | Work | Before | After |
| ---: | --- | ---: | ---: |
| 1,000 | Expand to next rendered frame | 298.8 ms | 10.94 ms |
| 1,000 | One child's progress to next frame | 112.6–125.6 ms | 1.18–18.18 ms |
| 5,000 | Expand to next rendered frame | 1,216.1 ms | 14.36 ms |
| 5,000 | One child's progress to next frame | 500.5–538.4 ms | 1.31–6.03 ms |
| 1,000 / 5,000 | Mounted child rows | 1,000 / 5,000 | 12 / 12 |

Both repaired lists reached their final child and retained all 1,000 / 5,000
queued records. Native scrolling, collapse/reopen and live byte display were
also checked. These are development-fixture measurements on one machine, not a
cross-device frame-rate guarantee.

The actual-component regression fails on the original implementation because
it mounts 1,000 children. It verifies bounded mounted rows, live progress without
re-sorting the folder, final-child access, completion accounting and collapse /
reopen. The existing top-level recycling test also expands a folder, scrolls it
out of view and returns to its retained expansion state.

## Issue relationship

Related to #3155. Its Windows report and subsequent comments cover multiple
possible large-transfer failures; they do not establish that this exact expanded
folder-list workload caused the reporter's freeze. This repair is independently
reproduced UI work and must not close that issue. Open #3694 and #3696 modify
file metadata / transfer connection acquisition, not this list behavior.
