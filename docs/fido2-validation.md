# FIDO2 SSH validation without hardware

Run the real OpenSSH integration simulation on Linux:

```sh
npm run test:fido-sim
```

Prerequisites: Node.js 22+, a C compiler, OpenSSL development headers, and
OpenSSH `ssh-keygen`, `/usr/bin/ssh-agent`, `ssh-add`, `ssh-sk-helper`, and
`/usr/sbin/sshd`. The test runs an unprivileged server bound to a random
localhost port and uses Netcatty's managed temporary directory. It does not
modify system SSH configuration or the user's login agent.

The opt-in test compiles `scripts/fixtures/fido/provider.c` as an OpenSSH SK
provider and exercises the production key generation, askpass and agent helpers.
It covers both ED25519-SK and ECDSA-SK, PIN-required enrollment and signatures,
tokenized IdentityFile references, inline handles, SSH command execution, SFTP,
TCP forwarding, CA certificates under IdentitiesOnly, and simultaneous callers
from separate windows. The independent OpenSSH server verifies the signatures.

The provider is strictly a test fixture: its opaque handles contain disposable
software private keys, and its PIN is always `123456`. It must never be selected
for a real account. Its resident flag support only simulates enrollment; it does
not enumerate stored resident credentials.

The ordinary test suite also exercises PIN/touch helper subprocesses, modal
cancellation, helper-exit cleanup, platform selection, resource release and SK
signature framing. `npm test` skips the opt-in integration simulation.

This verifies the OpenSSH integration on Linux with a software authenticator.
Real USB/CTAP devices and Windows/macOS installations still need device testing.
