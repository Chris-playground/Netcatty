# Host-routed browser for issue #2972

Status: implementation in `codex/issue-2972-host-browser`, 2026-09-30.
The standalone browser has been exercised on macOS with a local SSH server,
including host-routed page loading, disconnected/retry states, tabs, bookmarks,
website icons, and window controls. Windows/Linux and an external SSH host are
not yet runtime-verified.

## Goal and completion criteria

From a connected SSH terminal, the user opens a browser window pinned to that
host. All supported page traffic, including access to that host's
`127.0.0.1`, must use the selected host's network path. Loss of that path
stops browsing without switching to a local direct connection. Bookmarks sync
through the existing encrypted cloud-sync payload.

The feature is complete only after a packaged desktop build demonstrates:

1. Remote `127.0.0.1`, remote-only LAN DNS, a public exit-IP endpoint, and
   HTTPS all behave as seen from the selected SSH host.
2. HTTP, HTTPS, WebSocket, redirects, popups, downloads, and background tab
   requests remain on the same route. Requests using an unsupported transport
   are denied rather than sent directly.
3. Disconnect, proxy setup failure, reconnection, host deletion, browser close,
   and app quit leave no direct fallback or orphaned listener.
4. Tabs on two different hosts cannot share network state, cookies, local
   storage, service workers, or `127.0.0.1` data.
5. Bookmarks survive restart and encrypted multi-device sync, including
   simultaneous additions, edits, and deletions on two devices. Browsing
   history, cookies, passwords, open tabs, and local tunnel ports do not sync.
6. The real UI is checked on macOS, Windows, and Linux: opening from a terminal,
   navigation, tabs, focus, resizing, loading/errors, reconnect, and bookmarks.

## Product behavior

### Entry and window identity

- Add a Browser action to the customizable top terminal toolbar. Offer it only
  when a selected, usable SSH host is available. The toolbar's compact and
  overflow modes must keep the action reachable.
- The window is pinned to the host identity at creation. Reopening from another
  terminal for the same host focuses that window; opening from a different host
  creates an independent window. A tab cannot silently change its route.
- Title and permanent route badge: `Browser - via <host label>`. The badge has
  connecting, connected, disconnected, and reconnecting states. Its details
  show the host name and SSH chain, without exposing credentials or local ports.
- Keep the browser window independent of the terminal pane. Closing a terminal
  does not retarget the window. The browser owns its SSH access lifetime and
  can reconnect to the same saved host; closing the browser releases it.

### Browsing surface

- A separate window gives sites usable width. The trusted top chrome has a tab
  strip, new/close/reorder tab controls, back, forward, reload/stop, one address
  bar, a route label, and a bookmarks menu. Page title and favicon appear on
  tabs. The start tab is a plain app-icon grid with no duplicate address field.
  It follows the main window's flat tab styling and normal desktop shortcuts.
- Website favicons are fetched through the host route and stored locally by
  host and website. Users can right-click a tab to set an icon image or glyph;
  that override persists until they restore the website icon. Bookmark app
  icons can also use a custom image, which is included in bookmark sync.
- `127.0.0.1:80` or `localhost:80` defaults to HTTP and refers to the SSH host.
  External names default to HTTPS. The address field displays the real page URL
  while the route badge independently identifies the selected host.
- All page-created tabs and permitted window-open requests stay in this host's
  browser window/profile. External protocols and "open in system browser" need
  an explicit warning that the destination will use the local computer's route.
- While disconnected, show a full-window error state and a Retry action. Do not
  load cached pages as though the route were connected; stale content, if ever
  shown, needs a separate offline label.

### Bookmarks

- Each item has an id, title, URL, scope (`host` or `all-hosts`), optional
  hostId, display order, and timestamps. The default scope is the current host,
  especially for `localhost` and private addresses. Users can explicitly make
  a public bookmark available from every host.
- The menu has `This host` and `All hosts`, add/edit/delete, and a quick search.
  Bookmark opening always uses the current window's host route. A missing host
  reference is shown as unavailable; never silently attach it to another host.
- Sync bookmark metadata as its own id-based payload entity with the same
  merge, deletion, backup/restore, shrink guard, and encrypted provider handling
  as other vault entities. Browser cookies, history, passwords, page content,
  and per-device settings remain local. Host-scoped bookmarks retain the synced
  host id. Old sync payloads treat a missing bookmarks array as legacy absence,
  not as a delete-all operation.

## Network and security model

- The browser chrome is trusted local UI. Each untrusted website is rendered in
  a sandboxed `WebContentsView` with no Node integration, no Netcatty preload,
  and no access to terminal, vault, or plugin bridges. Use an Electron session
  partition separate from the application and separate for each host profile.
  Tabs for one host may share website cookies; different hosts must not.
- The main process owns a `HostBrowserManager` with a small interface:
  openForHost(hostId), create/close/navigate tab, bookmark operations, and
  close host browser. The UI sends intent and receives state. The manager owns
  browser windows, tabs, session partitions, route state, and cleanup.
- Use a dedicated, temporary SSH connection for the browser, honoring
  Netcatty's existing host authentication, known-host policy, jump hosts, and
  connection settings. A dynamic SOCKS5 listener binds only to `127.0.0.1` on
  an OS-assigned port. It is not a saved port-forward rule. Expose the actual
  assigned port only inside the main process; close it with the last host window.
- A loopback SOCKS listener is not exclusive to this browser: another local
  process could use it while open, and Chromium does not support SOCKS5 proxy
  authentication. Keep its lifetime short, never bind a public interface,
  and describe this limitation honestly. If exclusive access becomes a product
  requirement, the local listener design must be revisited.
- Before creating any page view, create its isolated session with a dead-end
  proxy and the loopback bypass disabled. After SSH/SOCKS is ready, install a
  single SOCKS5 proxy with no `DIRECT` alternative. Chromium routes names to
  the SOCKS5 side and can proxy `localhost` only when its implicit bypass is
  explicitly removed. On route loss, first prevent new navigation and requests,
  switch to the dead-end proxy, close pooled connections, then close/replace
  the SSH route. Resume only after the new route and proxy are verified.
- The existing dynamic SOCKS implementation is a starting point, not a ready
  browser transport: it currently assumes caller-chosen local ports, parses
  SOCKS messages from single socket chunks, and rejects IPv6 targets. Extract a
  bounded, incremental SOCKS parser/listener shared with saved forwarding;
  support IPv4, hostnames, and IPv6, timeouts, cancellation, and cleanup.
- Allow HTTP(S) and WS(S). Restrict or explicitly deny page capabilities that
  can use a direct route outside the SOCKS TCP path (notably WebRTC/UDP), along
  with unexpected URL schemes and unrestricted device permissions. Downloads
  must use the isolated browser session and a reviewed destination flow.
  Browser-started operations must not call the app's normal Node `fetch`, system
  browser, DNS resolver, or default Electron session.
- SSH encrypts local-computer-to-host transport. Traffic from the SSH host to
  the destination follows that URL's HTTP or HTTPS security; SSH alone does not
  make a remote-to-website HTTP leg encrypted. The product copy must say this
  accurately and must not promise anonymity or unrestricted internet access.

## Existing code seams

- Toolbar: `components/terminal/TerminalToolbar.tsx` and its caller in
  `components/Terminal.tsx`.
- SSH forwarding: `electron/bridges/portForwardingBridge.cjs` and
  `infrastructure/services/portForwardingService.ts`. The saved rule's fixed
  port and persistence model should not own temporary browser routes.
- Isolated web content and fail-closed proxy patterns already exist in
  `electron/plugins/pluginViewHost.cjs`; reuse the principles, not the plugin
  permissions or protocol.
- Sync entity/payload: `domain/sync.ts`, `domain/syncMerge.ts`,
  `application/syncPayload.ts`, and the auto/cloud sync application hooks.
  Existing SFTP global bookmarks live inside settings, but browser bookmarks
  need host scope and per-item conflict/deletion handling.

## Delivery order

1. Network proof in the actual Electron runtime: isolated session, SSH SOCKS5,
   `localhost` through the host, remote DNS, public exit IP, WS(S), disconnect
   kill switch, and packet-capture checks for direct DNS/WebRTC/UDP leakage.
   This is a release gate, not a mock-only test.
2. Browser manager and safe window/tab lifecycle, including page isolation,
   navigation, popups, permissions, downloads, and multi-host separation.
3. Toolbar entry and full browsing UI, with real click-through QA.
4. Bookmark storage and encrypted sync migration/merge; cross-device QA.
5. Packaged smoke tests on all supported desktop platforms and resource cleanup.

Primary references: [Netcatty issue #2972](https://github.com/binaricat/Netcatty/issues/2972),
[Electron web embeds](https://www.electronjs.org/docs/latest/tutorial/web-embeds),
[Electron session proxy](https://www.electronjs.org/docs/latest/api/session),
[Chromium proxy behavior](https://chromium.googlesource.com/chromium/src/+/main/net/docs/proxy.md),
[Electron security guidance](https://www.electronjs.org/docs/latest/tutorial/security).
