# Saved session logs

The terminal toolbar has separate actions for recording and opening logs:

- **Start / Stop session log** controls manual recording.
- **Open session log** opens the current terminal's saved log in one click.
  Automatic logs are supported as well as manually recorded logs. Pending
  terminal output is flushed before opening; recording continues normally.
- The arrow beside **Open session log** offers **Reveal session log in folder**,
  **Open with application**, and **Open with system default**.

A successfully selected application is remembered locally for subsequent log
opens, independently of SFTP file associations. Choosing the system default
clears this preference. Text, raw, and HTML logs retain their original format.

The last log remains accessible after recording stops or a session disconnects.
After a successful reconnect, a stopped log from the old connection is not reused.
If reconnecting fails, the previous saved log remains available.
Manual recording that is still active remains the current log. If the current session has no saved log,
or the file was moved or deleted, the action reports an error rather than
opening an unrelated file. The shortcut does not enable logging automatically.

Like other terminal toolbar items, the shortcut can be shown, collapsed into
**More actions**, or hidden through the toolbar's customization menu.
