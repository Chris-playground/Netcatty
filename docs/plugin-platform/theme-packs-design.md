# Declarative theme packs

Status: proposed implementation plan. No theme contribution or theme permission
is implemented by this document. The baseline is Draft #3951 at
`e5bd294cddbf58dfe04c646b6291933d980498fd`; batch 1 grants and network contracts
are reviewed separately in Draft #3955.

## Scope and existing behavior

A theme pack supplies validated color data. Users preview, apply, cancel, or
reset it through the host Appearance UI. Selecting a theme never starts a
plugin runtime or approves its function permissions. This extends whole-app
appearance alongside existing `terminal.theme` and `terminal.background`
Providers and isolated view styles.

Personal `customCSS` is a user-owned advanced setting, not a third-party plugin
surface. This plan introduces no stylesheet, selector, DOM, font URL, image URL,
script, layout, notification, or background permission.

`UiThemeTokens` has 19 fields. They are not independent controls:
`buildAppThemeCssVars()` assigns one effective accent to primary, accent, and
ring and computes both accent foregrounds. The initial theme contract preserves
this relationship. It must not accept independent primary, primaryForeground,
accentForeground, or ring overrides and then silently discard them.

## Contract and package admission

The proposed feature is `appearance.theme-packs`. Its schema definitions,
generated SDK exports, runtime/package compatibility, and documentation move
together. Plan an internal schema/API revision with legacy negotiation retained;
do not change the current batch 1 API just to publish this proposal. Old hosts
reject a pack that requires the unknown feature before registration.

A proposed `contributes.themes` entry contains:

| Field | Meaning and validation |
| --- | --- |
| `id` | Contribution ID under the owning plugin namespace |
| `label` | Existing bounded localized-text contract |
| `variant` | `light`, `dark`, `hc-light`, or `hc-dark` |
| `path` | Canonical package-relative JSON path inside the immutable installed version |

A theme JSON document contains a schema revision, a variant-matching built-in
base ID, bounded color overrides, and an optional static terminal palette.
It contains no cross-plugin includes, arbitrary file references, inheritance
chains, or remote resources. Resolve the validated base and overrides into one
immutable complete palette before registration. Never retain partially valid
entries from a failed theme document.

The initial allowed UI overrides are `background`, `foreground`, `card`,
`cardForeground`, `popover`, `popoverForeground`, `secondary`,
`secondaryForeground`, `muted`, `mutedForeground`, `accent`, `destructive`,
`destructiveForeground`, `border`, and `input`. Accept only opaque `#RRGGBB`
colors. The host converts them to its internal HSL representation. Reject
unknown keys, alpha, CSS expressions, `url()`, `var()`, `@import`, non-finite
values, and custom properties. Do not pass author strings to CSS parsing.

The optional terminal palette uses the existing `TerminalThemeColorName`
allowlist. It merges with a host default and is validated independently.
Static terminal colors require neither a session snapshot nor a Provider call.

Initial bounds for implementation and tests are 32 themes per package,
64 KiB per JSON file, 2 MiB total theme JSON, depth 8, and one active preview per
window. These are proposed defaults, not existing limits. The schema and host
must share the final constants. No font, image, or video assets enter v1.

### Static admission must remain distinct from code activation

The present manifest requires `main` and browser-only policy expects a browser
entrypoint. Removing either check without a separate package variant is unsafe.

For the first usable slice, a sample can retain a no-op browser entrypoint.
Static theme registration must not invoke it. Theme enablement has a separate
host-owned state from function/code enablement. Installing a pack keeps both
off until a user opts into the corresponding contribution. Enabling its themes
never sets the code-enabled flag, grants permissions, or runs activation events.
Disabling the package disables its theme contributions as well as its code.

A later exclusive data-only manifest variant can remove the no-op entrypoint.
It must reject `main`, activation events, permissions, companions, providers,
commands, and every non-theme contribution. Update canonical validation,
semantic admission, package inspection, catalog policy, manager behavior, and
compatibility tests together. The public catalog must explicitly recognize
this inert variant while retaining browser-only admission for executable packs.
A theme-only exception must not admit Node or an executable mixed package.

## Host registry and persistence

A host registry reads only installed, immutable package versions through the
existing package-store path boundary. Verify real paths, file kinds, byte caps,
and package ownership. Preserve the validated source version and content hash.
No plugin RPC can register, apply, or replace global palette data.

A committed selection references plugin ID, theme ID, variant, package version,
and validated theme hash. Store per-variant selections and a monotonic commit
revision through the settings/persistence layer. Do not persist plugin CSS or
turn this into implicit KV/cloud synchronization. Preserve legacy built-in theme
IDs and existing user settings when no plugin theme is selected.

Theme availability records and applied preferences are user state, separate
from runtime KV and function permissions. Define retained missing-selection
metadata and uninstall behavior explicitly. Missing code or theme files must
not trigger downloads, runtime activation, or new grants.

## Preview, apply, cancel, and reset

A single appearance resolver feeds existing chrome/terminal effects. Do not add
a second root effect that races `useAppThemeStyle`, `useThemeRuntime`, or active
terminal chrome selection.

| Host action | Required behavior |
| --- | --- |
| Preview | Create a host-owned token bound to window, preview owner, selected immutable theme, and current committed revision. Render locally without storage writes, sync events, runtime activation, or other-window changes |
| Apply | Verify owner, token, version/hash, availability, and expected commit revision. Commit the selected theme and explicitly chosen terminal linkage as one settings action. A stale preview produces a conflict, not an overwrite |
| Cancel or close | Clear only the matching local preview token. Render the latest committed state. Never restore a captured old settings snapshot over a newer commit |
| Reset | Clear the selected variant's plugin reference using the same revision check and apply the host default. Preserve font, accent, per-host terminal, and accessibility preferences |
| Another window applies | Advance the shared commit revision. End the old preview or mark it stale; later cancel cannot alter the new selection |
| Disable/uninstall/update | Invalidate matching previews and registry entries. Immediately resolve affected selections to a safe built-in variant, retain a bounded missing-reference notice, and never silently adopt unreviewed replacement bytes |
| Application exit or window destruction | Release local preview ownership. Only committed preferences survive startup |

The preview UI always identifies plugin source/version and has host-controlled
Apply, Cancel, and Restore default controls. Those controls live inside the
security appearance boundary. Theme data cannot control their labels, order,
visibility, click behavior, or layout.

Applying a theme changes only the selected palette and explicit terminal linkage.
It does not overwrite user font family/size, accent override, host terminal
override, reduced-motion choice, or OS accessibility preferences.

## Appearance precedence and terminal behavior

Resolve appearance in this order:

1. Host security surfaces and OS accessibility requirements.
2. Explicit user font, size, accent, and per-host/per-terminal overrides.
3. The selected and validated theme pack.
4. Built-in defaults.

Define one effective accent using the current host rule. Reject impossible
contrast combinations, including a user accent override against the effective
surface, or show an explicit host correction before apply. Do not report an
ignored author field as a successful override.

Follow App may use the pack's static terminal palette. Manual terminal choices
and per-host overrides retain precedence. Reuse the existing active-chrome
selection rather than resetting app appearance on tab changes. Test Vault,
SFTP, terminal, editor, Notes, logs, split panes, and detached windows.

High-contrast flags in plugin environments are not proof that the host already
has complete high-contrast themes. Missing HC variants require a host-owned HC
fallback. Do not downgrade a forced-colors/high-contrast preference to an
ordinary light/dark theme. Respect reduced motion and font scaling.

## Security appearance and contrast gates

Native Electron permission dialogs already sit outside renderer CSS. React
security surfaces need a new explicit boundary before a theme pack ships.
Cover AppLock, host-key trust, credential selection, grant/revoke management,
dangerous confirmations, and theme preview/apply controls. Use host-controlled
colors, font, icons, and layout there. Package colors never style those surfaces.
The existing code has no verified shared boundary covering all of them.

Color validation checks complete resolved/composited pairs, not only body text:
foreground/background, card text/card, popover text/popover, secondary/muted
text, accent/button text, destructive/button text, focus rings, borders, inputs,
and selected/disabled states. Ordinary text needs 4.5:1, large text 3:1, and
required non-text indicators 3:1 against adjacent surfaces. Reject a failing
palette with a named pair and ratio, or show an explicit host correction.
Tests must prove the effective UI, not only a helper's arithmetic.

These gates follow [WCAG text contrast](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)
and [non-text contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html).
Theme screenshot review supplements contract, lifecycle, and accessibility
checks. It does not establish safe ownership, persistence, or revocation.

## Delivery stages and acceptance

Current batch A grants and SDK consistency reaches review/CI first. Complete
the controlled native interaction/context work as planned; theme work remains
a separate small stage from marketplace card/layout changes.

| Stage | Implementation and evidence |
| --- | --- |
| Contract and pure validation | Canonical schema/generated SDK, feature/revision negotiation, strict color parser, derived-accent semantics, static terminal palette, bounds, named contrast diagnostics, old manifest compatibility |
| Registry and security boundary | Immutable package ownership, static registration without runtime, independent theme/code enablement, fixed security appearance, same-variant/HC fallback, unavailable/tampered version behavior |
| Product workflow | Appearance grouping/source, local preview ownership, revision-safe apply/cancel/reset, safe defaults, system theme changes, terminal linkage and overrides, persistence and window synchronization |
| Samples and final acceptance | Light/dark no-op-browser sample, normal settings import without advanced mode, no runtime/grants on theme apply, later data-only admission only if fully validated, exact-SHA tests/build/package/CI, Codex review/fix/review, parent-owned native recording |

Boundary tests include unknown fields/feature, invalid or excessive JSON,
unsupported variant/base, non-package and changed paths, unreadable colors,
preview cancellation and window close, two-window apply/cancel ordering,
update/disable/uninstall/failure fallback, startup restoration, host and accent
overrides, forced colors, reduced motion, Chinese fonts/fallback, and every
protected security surface. A pending gate keeps the theme row unfinished.

Later controlled candidates are known-font recommendations, radius/density
presets after component support exists, declarative file/folder icons, and
package-local static backgrounds on fixed surfaces with contrast limits. They
need separate contracts and acceptance. Global CSS, free layout, remote fonts,
HTML/video backgrounds, and security-UI customization remain excluded.

## Baseline source references

- `infrastructure/config/uiThemes.ts`: token fields and built-in registry.
- `application/state/settingsStateDefaults.ts`: accent derivation and built-in ID checks.
- `application/state/appearanceSync.ts`, `appearanceChromeStore.ts`, and
  `useSettingsState.ts`: persistence and cross-window behavior.
- `application/app/useAppThemeStyle.ts`, `activeChromeTheme.ts`,
  `application/state/useThemeRuntime.ts`, and `domain/terminalAppearance.ts`:
  effective UI and terminal precedence.
- `packages/plugin-sdk/src/index.ts`: existing terminal theme/background types.
- `electron/plugins/pluginProtocol.cjs`: isolated view CSS/font/network CSP.
- `lib/customCss.ts`: personal user CSS, excluded from plugin authority.
- `domain/pluginRuntimePolicy.cjs` and the canonical manifest schema: executable admission.
- `electron/plugins/nativePermissionDecision.cjs`: native permission prompts.
