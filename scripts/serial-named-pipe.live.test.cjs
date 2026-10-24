'use strict';

// Native Electron integration, not a hypervisor fixture: the disposable server
// implements the same local Windows pipe byte-stream contract as a VM console.
if (!process.versions.electron) {
  require('node:test')('serial named pipe Electron integration', {
    skip: 'run electron scripts/serial-named-pipe.live.test.cjs',
  }, () => {});
} else {
  const assert = require('node:assert/strict');
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');
  const net = require('node:net');
  const { randomUUID } = require('node:crypto');
  const electron = require('electron');
  const { app, BrowserWindow, ipcMain, protocol } = electron;
  protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } }]);
  const sessions = new Map();
  const peers = new Set();
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'netcatty-pipe-electron-'));
  app.setPath('userData', profile);
  app.on('window-all-closed', () => {});
  let win;
  let server;
  let bridge;
  const watchdog = setTimeout(() => finish(1, new Error('serial pipe Electron test timed out')), 45000);
  function finish(code, error) {
    clearTimeout(watchdog);
    if (error) console.error(error);
    bridge?.cleanupAllSessions();
    for (const peer of peers) peer.destroy();
    server?.close();
    if (win && !win.isDestroyed()) win.destroy();
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* Windows may hold cache files until exit. */ }
    app.exit(code);
  }
  const js = (source) => win.webContents.executeJavaScript(source);
  async function waitFor(source) {
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      if (await js(source)) return;
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    throw new Error(`Timed out: ${source}`);
  }
  async function main() {
    bridge = require('../electron/bridges/terminalBridge.cjs');
    bridge.init({ sessions, electronModule: electron });
    bridge.registerHandlers(ipcMain);
    win = new BrowserWindow({ show: false, webPreferences: {
      preload: path.join(__dirname, '../electron/preload.cjs'),
      contextIsolation: true, nodeIntegration: false,
      // Match the production main-window preload configuration.
      sandbox: false,
    } });
    protocol.handle('app', () => new Response('<title>Serial pipe integration</title><pre id="output"></pre>', { headers: { 'content-type': 'text/html' } }));
    await win.loadURL('app://netcatty/serial-pipe-test');
    assert.equal(await js('typeof window.netcatty.startSerialSession'), 'function');
    const endpoint = String.raw`\\.\pipe\netcatty VM console ${randomUUID()}`;
    if (process.platform !== 'win32') {
      await assert.rejects(js(`window.netcatty.startSerialSession(${JSON.stringify({ sessionId: 'unsupported', path: endpoint })})`), /only supported on Windows/);
      assert.equal(sessions.size, 0);
      console.log('SERIAL_PIPE_ELECTRON_PASS: native preload/IPC rejects Windows pipes on non-Windows');
      return;
    }
    const received = [];
    server = net.createServer(peer => {
      peers.add(peer);
      peer.on('error', () => {});
      peer.on('close', () => peers.delete(peer));
      peer.on('data', data => { received.push(data); peer.write(data); });
    });
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(endpoint, resolve);
    });
    const sessionId = 'native-pipe-session';
    for (let attempt = 0; attempt < 2; attempt++) {
      assert.equal(await js(`window.netcatty.startSerialSession(${JSON.stringify({ sessionId, path: endpoint, charset: 'utf-8' })})`), sessionId);
      assert.equal(sessions.get(sessionId).type, 'serial');
      await js(`window.pipeDataOff?.(); window.pipeExitOff?.(); window.pipeOutput = ''; window.pipeExits = []; window.pipeDataOff = window.netcatty.onSessionData(${JSON.stringify(sessionId)}, data => { window.pipeOutput += data; document.getElementById('output').textContent = window.pipeOutput; }); window.pipeExitOff = window.netcatty.onSessionExit(${JSON.stringify(sessionId)}, event => window.pipeExits.push(event));`);
      const payload = `round ${attempt}: café 中文\r\n`;
      await js(`window.netcatty.writeToSession(${JSON.stringify(sessionId)}, ${JSON.stringify(payload)})`);
      await waitFor(`window.pipeOutput === ${JSON.stringify(payload)}`);
      assert.ok(Buffer.concat(received).toString('utf8').includes(payload), 'renderer input reaches the real Windows pipe server');
      assert.equal(await js("document.getElementById('output').textContent"), payload);
      if (attempt === 0) {
        await js(`window.netcatty.closeSession(${JSON.stringify(sessionId)})`);
        assert.equal(sessions.has(sessionId), false);
      } else {
        for (const peer of peers) peer.destroy();
        await waitFor('window.pipeExits.length === 1');
        assert.equal(sessions.has(sessionId), false, 'broken pipe removes backend session');
        await js(`window.netcatty.closeSession(${JSON.stringify(sessionId)})`);
      }
    }
    await new Promise(resolve => server.close(resolve));
    server = null;
    await assert.rejects(js(`window.netcatty.startSerialSession(${JSON.stringify({ sessionId: 'missing', path: endpoint })})`), /Failed to open serial port/);
    // A deliberately nonexistent hardware port still takes the SerialPort path,
    // not the pipe adapter. This does not claim testing physical COM hardware.
    await assert.rejects(js(`window.netcatty.startSerialSession({sessionId:'missing-com',path:'COM999999',baudRate:9600})`), /Failed to open serial port/);
    assert.equal(sessions.size, 0);
    console.log('SERIAL_PIPE_ELECTRON_PASS: real Windows pipe, renderer/preload/IPC, UTF-8 I/O, reconnect, disconnect, missing pipe and COM error');
  }
  app.whenReady().then(main).then(() => finish(0), error => finish(1, error));
}
