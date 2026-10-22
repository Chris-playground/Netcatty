export type SessionLogMenuStatus = "connecting" | "connected" | "disconnected";

export interface SessionLogMenuInput {
  automaticLogging: boolean;
  manualLogging: boolean;
  previousStatus: SessionLogMenuStatus;
  status: SessionLogMenuStatus;
}

/** Keep a stopped manual log in the menu until a new connection retires it. */
export function resolveRetainedSessionLog(
  retainedManualLog: boolean,
  input: SessionLogMenuInput,
): boolean {
  if (input.manualLogging) return true;
  const reconnectRetiredInactiveLog = input.status === "connected"
    && input.previousStatus !== "connected"
    && !input.automaticLogging;
  if (reconnectRetiredInactiveLog) return false;
  return retainedManualLog;
}

export function canOfferSessionLogMenu(
  retainedManualLog: boolean,
  input: SessionLogMenuInput,
): boolean {
  return input.automaticLogging
    || input.manualLogging
    || resolveRetainedSessionLog(retainedManualLog, input);
}
