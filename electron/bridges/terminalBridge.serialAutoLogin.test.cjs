const test = require("node:test");
const assert = require("node:assert/strict");
const terminalBridge = require("./terminalBridge.cjs");
const { createTelnetAutoLogin } = require("./telnetAutoLogin.cjs");

function createSerialAutoLoginSession() {
  const writes = [];
  const events = [];
  const session = {
    type: "serial",
    protocol: "serial",
    encoding: "utf-8",
    serialPort: {
      write: (data) => {
        writes.push(typeof data === "string" ? data : Buffer.from(data).toString());
        return true;
      },
    },
  };
  session.autoLogin = createTelnetAutoLogin({
    username: "admin",
    password: "secret",
    write: (data) => {
      session.serialPort.write(data);
    },
    onUserInput: () => { events.push("cancelled"); },
  });
  return { session, writes, events };
}

test("serial auto-login cancels on interactive user input but not automated writes", () => {
  let userInputs = 0;
  const session = {
    type: "serial",
    protocol: "serial",
    encoding: "utf-8",
    serialPort: { write: () => true },
    autoLogin: { handleUserInput: () => { userInputs += 1; } },
  };
  terminalBridge.init({ sessions: new Map([["s", session]]), electronModule: {} });
  try {
    terminalBridge.writeToSession({}, { sessionId: "s", data: "x" });
    assert.equal(userInputs, 1);
    terminalBridge.writeToSession({}, { sessionId: "s", data: "y", automated: true });
    assert.equal(userInputs, 1);
    // xterm replies to ANSI queries (cursor position, DA1, ...) travel through
    // onData without `automated`; they must not cancel auto-login.
    terminalBridge.writeToSession({}, { sessionId: "s", data: "\x1b[24;80R" });
    assert.equal(userInputs, 1);
  } finally {
    terminalBridge.cleanupAllSessions();
  }
});

test("serial line-mode buffered input notification cancels auto-login", () => {
  let userInputs = 0;
  const session = {
    type: "serial",
    protocol: "serial",
    encoding: "utf-8",
    serialPort: { write: () => true },
    autoLogin: {
      // Mirror createTelnetAutoLogin.handleUserInput: idempotent cancel.
      handleUserInput() {
        if (this.disabled) return;
        this.disabled = true;
        userInputs += 1;
      },
      disabled: false,
    },
  };
  terminalBridge.init({ sessions: new Map([["s", session]]), electronModule: {} });
  try {
    // Serial line mode buffers keystrokes in the renderer and only writes to
    // the session on Enter, so cancellation is signalled via a dedicated
    // notification instead of the write path.
    terminalBridge.notifySessionUserInput({}, { sessionId: "s" });
    assert.equal(userInputs, 1);
    // Idempotent: further notifications do not re-notify.
    terminalBridge.notifySessionUserInput({}, { sessionId: "s" });
    assert.equal(userInputs, 1);
    // Unknown sessions are ignored.
    terminalBridge.notifySessionUserInput({}, { sessionId: "missing" });
    assert.equal(userInputs, 1);
  } finally {
    terminalBridge.cleanupAllSessions();
  }
});

test("serial wake-only enter keeps auto-login armed and still reaches the port", () => {
  const { session, writes, events } = createSerialAutoLoginSession();
  terminalBridge.init({ sessions: new Map([["s", session]]), electronModule: {} });
  try {
    terminalBridge.writeToSession({}, { sessionId: "s", data: "\r" });
    assert.deepEqual(events, []);
    assert.deepEqual(writes, ["\r"]);

    session.autoLogin.handleText("login: ");
    session.autoLogin.handleText("\r\nPassword: ");

    assert.deepEqual(events, []);
    assert.deepEqual(writes, ["\r", "admin\r", "secret\r"]);
  } finally {
    terminalBridge.cleanupAllSessions();
  }
});

test("serial character input before login still cancels auto-login", () => {
  const { session, writes, events } = createSerialAutoLoginSession();
  terminalBridge.init({ sessions: new Map([["s", session]]), electronModule: {} });
  try {
    terminalBridge.writeToSession({}, { sessionId: "s", data: "x" });
    session.autoLogin.handleText("login: ");
    session.autoLogin.handleText("\r\nPassword: ");

    assert.deepEqual(events, ["cancelled"]);
    assert.deepEqual(writes, ["x"]);
  } finally {
    terminalBridge.cleanupAllSessions();
  }
});

test("serial wake-only enter stays armed when an input interceptor is pending", async () => {
  const { session, writes, events } = createSerialAutoLoginSession();
  let interceptorResolved = false;
  terminalBridge.init({
    sessions: new Map([["s", session]]),
    electronModule: {},
    terminalDataPipeline: {
      has: () => true,
      interceptInput: async (sessionId, data) => {
        await new Promise((resolve) => setTimeout(resolve, 20));
        interceptorResolved = true;
        return data;
      },
    },
  });
  try {
    terminalBridge.writeToSession({}, { sessionId: "s", data: "\n" });
    assert.deepEqual(events, []);
    assert.equal(interceptorResolved, false);

    await new Promise((resolve) => setTimeout(resolve, 40));
    assert.equal(interceptorResolved, true);
    assert.deepEqual(writes, ["\n"]);

    session.autoLogin.handleText("login: ");
    session.autoLogin.handleText("\r\nPassword: ");
    assert.deepEqual(events, []);
    assert.deepEqual(writes, ["\n", "admin\r", "secret\r"]);
  } finally {
    terminalBridge.cleanupAllSessions();
  }
});

test("serial line-mode notification still cancels auto-login without keystroke data", () => {
  const { session, writes, events } = createSerialAutoLoginSession();
  terminalBridge.init({ sessions: new Map([["s", session]]), electronModule: {} });
  try {
    terminalBridge.notifySessionUserInput({}, { sessionId: "s" });
    session.autoLogin.handleText("login: ");
    session.autoLogin.handleText("\r\nPassword: ");

    assert.deepEqual(events, ["cancelled"]);
    assert.deepEqual(writes, []);
  } finally {
    terminalBridge.cleanupAllSessions();
  }
});

test("serial sessions without auto-login credentials accept input normally", () => {
  const writes = [];
  const session = {
    type: "serial",
    protocol: "serial",
    encoding: "utf-8",
    serialPort: { write: (d) => writes.push(Buffer.from(d)) },
  };
  terminalBridge.init({ sessions: new Map([["s", session]]), electronModule: {} });
  try {
    terminalBridge.writeToSession({}, { sessionId: "s", data: "ls\r" });
    assert.deepEqual(writes.map((b) => b.toString()), ["ls\r"]);
  } finally {
    terminalBridge.cleanupAllSessions();
  }
});

test("serial auto-login cancels at input ingress before a slow interceptor resolves", async () => {
  let userInputs = 0;
  let interceptorResolved = false;
  const session = {
    type: "serial",
    protocol: "serial",
    encoding: "utf-8",
    serialPort: { write: () => true },
    autoLogin: {
      // Mirror createTelnetAutoLogin.handleUserInput: idempotent cancel.
      handleUserInput() {
        if (this.disabled) return;
        this.disabled = true;
        userInputs += 1;
      },
      disabled: false,
    },
  };
  terminalBridge.init({
    sessions: new Map([["s", session]]),
    electronModule: {},
    terminalDataPipeline: {
      has: () => true,
      interceptInput: async (sessionId, data) => {
        await new Promise((resolve) => setTimeout(resolve, 20));
        interceptorResolved = true;
        return data;
      },
    },
  });
  try {
    terminalBridge.writeToSession({}, { sessionId: "s", data: "ls\r" });
    // Cancellation must happen synchronously at ingress, not only after the
    // asynchronous interceptor resolves.
    assert.equal(userInputs, 1);
    assert.equal(interceptorResolved, false);
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 40));
    assert.equal(userInputs, 1);
  } finally {
    terminalBridge.cleanupAllSessions();
  }
});
