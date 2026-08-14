import { read, walk, isProd } from "./lib.mjs";
import { gateResult } from "./config.mjs";

// @adr 009 - structured, redacting logging only (NFR-12)
//
// Logs are the output most likely to leave the trust boundary (aggregators,
// vendors, tickets). Four rules, all mechanical:
//   1. no bare println/print/System.out in production code — a console call
//      routes around the transport, the levels and the redaction at once
//   2. no printStackTrace — an exception's dump is a log line with no level, no
//      structure and no redaction
//   3. no PII-shaped key in any kernel-logger call — a key named `password` in a
//      log call is an incident with a delay on it, and grep catches it before the
//      logger's redaction has to
//   4. SLF4J is imported ONLY by the kernel — everything else logs through the
//      kernel's AppLogger, where the redaction lives

const PLATFORM = "src/main/kotlin/app/platform/";
const PII = /(password|passwd|secret|token|authorization|ssn|creditcard)/i;
// A kernel-logger call: .info("msg", "key", value, ...) — the keys are the quoted
// strings after the message.
const LOG_CALL = /\.(info|warn|error|debug|trace)\(\s*"[^"]*"\s*,([^\n]*)/g;

const errors = [];
const files = walk("src", isProd);

for (const file of files) {
  const text = read(file);
  const inPlatform = file.startsWith(PLATFORM);

  if (/(^|[^.\w])print(ln)?\s*\(/.test(text) || /\bSystem\.(out|err)\s*\./.test(text)) {
    errors.push(`${file}: a bare console/print in production code — log through the platform kernel's logger (NFR-12)`);
  }
  if (/\.printStackTrace\s*\(/.test(text)) {
    errors.push(`${file}: printStackTrace dumps an exception past the log transport — log through the kernel (NFR-12)`);
  }
  if (!inPlatform && /^import\s+org\.slf4j\./m.test(text)) {
    errors.push(`${file}: imports org.slf4j outside src/main/kotlin/app/platform — the kernel owns the logger and its redaction config (NFR-12)`);
  }

  for (const m of text.matchAll(LOG_CALL)) {
    for (const key of m[2].matchAll(/"([\w-]+)"/g)) {
      if (PII.test(key[1])) {
        errors.push(`${file}: a PII field name in a log call — "${key[1]}" must never reach a log line (NFR-12)`);
      }
    }
  }
}

gateResult("log", `log:scan: ${files.length} production file(s), structured logging only, no PII field names`, errors);
