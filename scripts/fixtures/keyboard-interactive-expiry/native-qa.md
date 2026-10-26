# Verify remembered KI passwords and reconnects

Run this recipe in the parent's native GUI session on PR #3983 head `2096e93420f547be6491b7fb5df90f20f75a9545`.
Use a fresh Netcatty profile and the two disposable local servers from this kit.
Keep private-fixture.json out of screenshots, recordings, uploads, and reports.

1. Run `python3 build.py` in this directory.
2. Run `python3 manage.py start`.
3. Read private-fixture.json locally for the synthetic account and connection details. Do not copy those values into the report.
4. Build the app at the exact PR head with `npm ci` and `npm run build`.
5. Launch the native app through `electron/launch.cjs --user-data-dir=/absolute/path/to/disposable-profile`. Keep the sandbox enabled. Coordinate the GUI session through the parent.
6. In **Keychain**, create one password identity from the kit's current account.
7. In **Hosts**, add the kit's target and control servers. Link both hosts to that identity.
8. Enable **Prioritize keyboard-interactive authentication** on the target host.
9. Set the target host's stored username to a different synthetic account while retaining the identity. The identity must supply the actual login account.
10. Connect to the control host. Verify that the shell opens. Close its session.
11. Connect to the target host. Accept only the disposable server's host key.
12. Enter the current password when the expiry dialog requests it.
13. Enter the new password from private-fixture.json. Select **Remember** and submit.
14. Confirm the new password when requested. Verify that the shell opens.
15. Close the target session. Reconnect by opening the saved target host. Verify that login succeeds with the saved new password.
16. Open the target host's editor. Verify that the identity reference is cleared, the actual identity username is retained, and the password remains masked.
17. Open **Keychain**. Verify that the shared identity remains unchanged without revealing its password.
18. Reconnect to the control host. Verify that it still opens with the shared identity.
19. Record the exact app head and the expected results. Capture screenshots at the expiry dialog, Remember selection, first shell, reconnected shell, detached target identity, and connected control host.
20. Repeat after `python3 manage.py reset` with **Remember** unchecked. Verify that the target keeps its identity reference. Do not treat a subsequent prompt or failed reconnect with the old password as a fix regression.
21. Repeat with a blank stored host username. Verify that the identity supplies and preserves the actual account.
22. Repeat with no identity reference. Verify that Remember saves the new host password and reconnect succeeds.

## Verify the separate wrong-current path

1. Run `python3 manage.py reset`.
2. Restore the target host's shared identity and its old fixture credential in the app.
3. Connect to the target host.
4. Enter an intentionally incorrect current password in the KI dialog.
5. Capture the transition to the terminal password-change prompt in the same connection.
6. Record whether the server rejects KI, accepts password authentication, and then opens the shell. Do not infer protocol events from the dialog alone.
7. Run `node probe.cjs /absolute/path/to/Netcatty wrong` after another reset to capture the redacted protocol event sequence.
8. Keep this outcome separate from remembered KI credential persistence. The terminal password prompt does not offer KI Remember.

## Remove the fixture

1. Close the native app sessions.
2. Run `python3 manage.py stop` to remove both containers and the private connection details.
3. Remove the disposable app profile.
