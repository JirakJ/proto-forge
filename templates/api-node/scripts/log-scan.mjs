import { read, walk, isProd } from "./lib.mjs";
import { gateResult } from "./config.mjs";

// @adr 009 - structured, redacting logging only (NFR-12)
//
// Logs are the output most likely to leave the trust boundary (aggregators,
// vendors, tickets). Four rules, all mechanical:
//   1. no bare console.* in production code — lint bans it too, but hooks and
//      editor lint do not run in CI, and this gate is the same promise where it counts
//   2. no direct process.stdout/stderr writes outside the platform kernel — the
//      kernel owns the transport
//   3. no PII-shaped field name in any log call — a field named `password` in a
//      log call is an incident with a delay on it, and grep catches it before the
//      logger does
//   4. pino is imported ONLY by the kernel — everything else logs through the
//      kernel's logger, where the redaction configuration lives

const PLATFORM = "src/platform/";
const PII = /(password|passwd|secret|token|authorization|ssn|creditcard)/i;
// A log call with an object literal first argument: .info({ ... }, "msg")
const LOG_CALL = /\.(info|warn|error|debug|fatal|trace)\(\s*\{([^}]*)\}/g;

// CLI tool surfaces whose stdout IS their output, not a log: the contract
// emitter prints the derived spec, and the e2e/capture harness prints its
// conformance report. Both run in dev/CI only, never on the serving path — the
// serving path stays kernel-logger-only.
const TOOL_SURFACES = ["src/e2e/", "src/adapters/in/http/emit.ts"];

const errors = [];
const files = walk("src", isProd).filter(
  (p) =>
    !p.startsWith("src/test/") &&
    !p.startsWith("src/harness/") &&
    !p.includes("__fixtures__") &&
    !TOOL_SURFACES.some((t) => p === t || p.startsWith(t)),
);

for (const file of files) {
  const text = read(file);
  const inPlatform = file.startsWith(PLATFORM);

  if (/\bconsole\.\w+\(/.test(text)) {
    errors.push(`${file}: a bare console/print in production code — log through the platform kernel's logger (NFR-12)`);
  }
  if (!inPlatform && /process\.(stdout|stderr)\.write/.test(text)) {
    errors.push(`${file}: writes to process.stdout/stderr directly — the platform kernel owns the log transport (NFR-12)`);
  }
  if (!inPlatform && /from "pino"|import\("pino"\)|import "pino"/.test(text)) {
    errors.push(`${file}: imports pino outside src/platform — the kernel owns the logger and its redaction config (NFR-12)`);
  }

  for (const m of text.matchAll(LOG_CALL)) {
    for (const key of m[2].matchAll(/(["']?)([\w-]+)\1\s*:/g)) {
      if (PII.test(key[2])) {
        errors.push(`${file}: a PII field name in a log call — "${key[2]}" must never reach a log line (NFR-12)`);
      }
    }
    // Shorthand properties carry their name as the field name: { password }
    for (const part of m[2].split(",")) {
      const bare = part.trim();
      if (/^[\w-]+$/.test(bare) && PII.test(bare)) {
        errors.push(`${file}: a PII field name in a log call — "${bare}" must never reach a log line (NFR-12)`);
      }
    }
  }
}

gateResult("log", `log:scan: ${files.length} production file(s), structured logging only, no PII field names`, errors);
