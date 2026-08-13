import { read, walk, isProd } from "./lib.mjs";
import { gateResult } from "./config.mjs";

// @adr 009 - structured, redacting logging only (NFR-12)
//
// Logs are the output most likely to leave the trust boundary (aggregators,
// vendors, tickets). Four rules, all mechanical:
//   1. no bare print() in production code — ruff bans it too (T20), but hooks
//      and editor lint do not run in CI, and this gate is the same promise
//      where it counts
//   2. no direct sys.stdout/sys.stderr writes and no stdlib `logging` wiring
//      outside the platform kernel — the kernel owns the transport
//   3. no PII-shaped field name in any log call — a field named `password` in a
//      log call is an incident with a delay on it, and grep catches it before the
//      logger does
//   4. structlog is imported ONLY by the kernel — everything else logs through
//      the kernel's logger, where the redaction configuration lives

const PLATFORM = "src/app/platform/";
const PII = /(password|passwd|secret|token|authorization|ssn|creditcard)/i;
// A structlog-style call: .info("event", key=value, ...) — kwargs are the fields.
const LOG_CALL = /\.(info|warning|error|debug|critical)\(\s*(?:f?"[^"]*"|f?'[^']*')\s*,\s*([^)]*)\)/g;

// CLI tool surfaces whose stdout IS their output, not a log: the contract
// emitter prints the derived spec, and the e2e/capture harness prints its
// conformance report. Both run in dev/CI only, never on the serving path — the
// serving path stays kernel-logger-only.
const TOOL_SURFACES = ["src/app/e2e/", "src/app/contract_emit.py"];

const errors = [];
const files = walk("src", isProd).filter(
  (p) =>
    !p.startsWith("src/app/harness/") &&
    !p.includes("__fixtures__") &&
    !TOOL_SURFACES.some((t) => p === t || p.startsWith(t)),
);

for (const file of files) {
  // A `print(` in a comment is prose, not a transport: strip # comments first.
  const text = read(file).replace(/#.*$/gm, "");
  const inPlatform = file.startsWith(PLATFORM);

  if (/(?<![\w.])print\(/.test(text)) {
    errors.push(`${file}: a bare console/print in production code — log through the platform kernel's logger (NFR-12)`);
  }
  if (!inPlatform && /sys\.(stdout|stderr)\.write/.test(text) && !TOOL_SURFACES.includes(file)) {
    errors.push(`${file}: writes to sys.stdout/stderr directly — the platform kernel owns the log transport (NFR-12)`);
  }
  if (!inPlatform && /^\s*(?:import structlog|from structlog)/m.test(text)) {
    errors.push(`${file}: imports structlog outside src/app/platform — the kernel owns the logger and its redaction config (NFR-12)`);
  }
  if (!inPlatform && /^\s*(?:import logging\b|from logging\b)/m.test(text)) {
    errors.push(`${file}: wires the stdlib logging module outside src/app/platform — the kernel owns the log transport (NFR-12)`);
  }

  for (const m of text.matchAll(LOG_CALL)) {
    for (const key of m[2].matchAll(/(\w+)\s*=/g)) {
      if (PII.test(key[1])) {
        errors.push(`${file}: a PII field name in a log call — "${key[1]}" must never reach a log line (NFR-12)`);
      }
    }
  }
}

gateResult("log", `log:scan: ${files.length} production file(s), structured logging only, no PII field names`, errors);
