# Saved session logs

Recording and opening a session log stay separate.

- **Start / Stop session log** controls manual recording.
- **Open session log**, **Reveal session log in folder**, **Open with
  application**, and **Open with system default** live in the terminal
  toolbar's existing **More actions** menu. They are not a default toolbar
  button. Toolbar customization can show the shortcut on the bar or hide it.
  When it is shown, the arrow beside it offers the same reveal and open-with
  actions.

The menu items appear when automatic session logging is enabled. They also
appear once a manual log has been started for that session, and stay available
after recording stops. A successful reconnect drops a stopped manual log when
automatic logging is off, and the menu items go with it. A failed reconnect
keeps them. Pending terminal output is flushed before opening;
recording continues normally. Automatic logs and manually recorded logs both
open this way.

A successfully selected application is remembered locally for subsequent log
opens, independently of SFTP file associations. Choosing the system default
clears this preference. Text, raw, and HTML logs retain their original format.

The last log remains accessible after recording stops or a session disconnects.
After a successful reconnect, a stopped log from the old connection is not reused.
If reconnecting fails, the previous saved log remains available.
Manual recording that is still active remains the current log. If the current session has no saved log,
or the file was moved or deleted, the action reports an error rather than
opening an unrelated file. The action does not enable logging automatically.
