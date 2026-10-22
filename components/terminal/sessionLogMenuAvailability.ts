export type SessionLogMenuStatus = "connecting" | "connected" | "disconnected";

export interface SessionLogMenuInput {
  automaticLogging: boolean;
  manualLogging: boolean;
  previousStatus: SessionLogMenuStatus;
  status: SessionLogMenuStatus;
}

/** Keep the current log in the menu until a new connection retires it. */
export function resolveRetainedSessionLog(
  retainedManualLog: boolean,
  input: SessionLogMenuInput,
): boolean {
  // An automatic stream keeps recording after the setting is turned off.
  if (input.manualLogging || input.automaticLogging) return true;
  const reconnectRetiredInactiveLog = input.status === "connected"
    && input.previousStatus !== "connected";
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
