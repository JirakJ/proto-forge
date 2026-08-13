import { pino } from "pino";

// Structured, redacting logging only (NFR-12): production code logs through this
// factory, never console.*. The redaction list is the PII denylist — a field with
// one of these names never leaves the process in clear text.
const REDACT_PATHS = ["password", "token", "secret", "authorization", "email"];

/** The narrow surface the app programs against; pino satisfies it structurally. */
export type Logger = {
  info: (obj: Record<string, unknown>, msg: string) => void;
  warn: (obj: Record<string, unknown>, msg: string) => void;
  error: (obj: Record<string, unknown>, msg: string) => void;
};

export function createLogger(level = "info"): Logger {
  return pino({
    level,
    redact: { paths: REDACT_PATHS, censor: "[redacted]" },
  });
}

/** For tests: same shape, no output. */
export const noopLogger: Logger = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};
