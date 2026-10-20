# External MCP reversible masking

External MCP privacy masking is **off by default**. Enable it in Settings > AI >
External MCP before connecting an external client. It applies to both stdio and
Streamable HTTP clients, including the environment resource. It does not change
Catty, local terminal display, saved terminal output, or the actual host data.

## Working loop

A recognized address or credential in a tool response becomes an opaque token,
for example `[NC_<session>_IP_1]`. The same exact value has the same token within
that connection. A later command or file-write argument containing that token is
restored locally before the main-process permission checks and approval dialog.
The host receives the original value; the external client receives masked results.

Each stdio server process / HTTP MCP session owns its own in-memory mapping. No
mapping is saved to disk or shared through the app-wide external chat scope.
Reconnects start a new mapping. Unknown, stale, or other-client tokens are rejected
rather than sent to the host. After changing privacy settings, reconnect clients;
existing connections fail closed instead of silently changing their protection.

## What is covered

- Recognized credential assignments, authorization bearer values, URL passwords,
  familiar API token forms, structured secret fields and complete private-key blocks.
- IPv4 and IPv6 addresses, with private/local ranges retained by default to match
  the original feature request. Enable **Mask private IP addresses** to hide them
  too, or select additional CIDRs. Documentation/test addresses are also masked.
- Structured host names and user-supplied regular-expression matches.
- Text tool results, nested structured results, and RPC error messages.

Custom expressions match whole values and use the existing RE2 engine. Unsupported
expressions, malformed CIDRs, or empty matches are rejected. Rules and mapping
sizes are bounded; exhaustion blocks the response instead of evicting active tokens.

Binary/base64 attachments are blocked while masking is enabled. This feature does
not scan images, archives, encoded/encrypted content, or files transferred outside
MCP responses. It cannot guarantee detection of arbitrary credentials, all hostnames,
or intentionally obfuscated data. It is an accidental-disclosure safeguard, not a
DLP system or a substitute for the normal tool permission policy.

## Verification

Use synthetic values when testing: read `192.0.2.10`, read `198.51.100.7`, then read
the first again. Tokens should be different for different values and stable for
repeated reads. Write a returned token back or use it in a terminal command; the
actual file/terminal should contain the original value, never the token. A token
from another client or an earlier session must fail without dispatching a command.
