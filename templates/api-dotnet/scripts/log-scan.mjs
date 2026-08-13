import { read, walk, isProd } from "./lib.mjs";
import { gateResult } from "./config.mjs";

// @adr 009 - structured, redacting logging only (NFR-12)
//
// Logs are the output most likely to leave the trust boundary (aggregators,
// vendors, tickets). Four rules, all mechanical:
//   1. no bare Console.* print in production code — a console call routes
//      around the transport, the levels and the redaction at once
//   2. no Debug/Trace writer — a diagnostics dump is a log line with no level
//      contract, no structure and no redaction
//   3. no PII-shaped key in any kernel-logger call — a key named `password` in a
//      log call is an incident with a delay on it, and grep catches it before the
//      logger's redaction has to
//   4. Microsoft.Extensions.Logging is imported ONLY by the kernel — everything
//      else logs through the kernel's AppLogger, where the redaction lives
//
// The rules read explicit using directives and call sites; ArchUnitNET closes
// the implicit-usings gap for rule 4 in the dotnet build (BR-21's suite).

const PLATFORM = "src/App/Platform/";
const PII = /(password|passwd|secret|token|authorization|ssn|creditcard)/i;
// A kernel-logger call: .Info("msg", "key", value, ...) — the keys are the quoted
// strings after the message.
const LOG_CALL = /\.(Info|Warn|Error|Debug|Trace)\(\s*"[^"]*"\s*,([^;]*)/g;

const errors = [];
const files = walk("src", isProd);

for (const file of files) {
  const text = read(file);
  const inPlatform = file.startsWith(PLATFORM);

  // The composition root's console MODES (--emit-openapi) write a derived
  // artefact to stdout — that is a CLI's result channel, not a log line, and it
  // is the one file allowed to touch it.
  if (/\bConsole\.(Out|Error|Write|WriteLine)\b/.test(text) && file !== "src/App/Program.cs") {
    errors.push(`${file}: a bare console/print in production code — log through the platform kernel's logger (NFR-12)`);
  }
  if (/\b(Debug|Trace)\.Write/.test(text)) {
    errors.push(`${file}: a Debug/Trace writer dumps past the log transport — log through the kernel (NFR-12)`);
  }
  if (!inPlatform && /^using\s+Microsoft\.Extensions\.Logging\b/m.test(text)) {
    errors.push(`${file}: imports Microsoft.Extensions.Logging outside src/App/Platform — the kernel owns the logger and its redaction config (NFR-12)`);
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
