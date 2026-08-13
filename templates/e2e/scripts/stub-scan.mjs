import { walk, read, isCode } from "./lib.mjs";
import { gateResult } from "./config.mjs";

// BR-12: no stubbed dependencies / placeholder markers in delivered code. In this
// template the SUITES are the delivered code, so e2e/** is scanned alongside
// src/** — a placeholder assertion is exactly as hollow as a placeholder handler.
// NOTE (honest limit): grep cannot fully prove "no inline mock data"; this gate
// enforces the mechanically-detectable surface (markers, first-party mocks,
// gated-rule escape hatches).
const prod = [...walk("src", isCode), ...walk("e2e", isCode)];
const errors = [];

const markers = [/\bTODO\b/i, /\bFIXME\b/i, /\bXXX\b/, /\bHACK\b/i, /not implemented/i, /\bunimplemented\b/i, /lorem ipsum/i];
for (const f of prod) {
  const b = read(f);
  for (const re of markers) if (re.test(b)) errors.push(`${f}: banned marker ${re}`);
}

// Mocking a first-party module (relative / @/) is banned ANYWHERE — a cross-app
// suite that mocks its own helpers is testing the mock, and one that mocks the
// pair is not a cross-app suite at all.
const firstPartyMock = /(?:vi|jest)\.(?:do)?mock\(\s*[`"'](?:@\/|\.\.?\/)/;
for (const f of prod) {
  if (firstPartyMock.test(read(f))) errors.push(`${f}: mocks a first-party module (BR-12)`);
}

// The security rules and no-console have no eslint-disable escape hatch BY
// DESIGN — the fix is always moving the code, never silencing the rule. A
// disable comment for them is a shortcut marker like TODO, caught here for the
// same reason.
const GATED_RULES = /eslint-disable[^\n]*(security\/|no-console)/;
for (const f of prod) {
  if (GATED_RULES.test(read(f))) {
    errors.push(`${f}: disables a gated lint rule inline — these rules have no escape hatch; fix the code (NFR-12)`);
  }
}

gateResult("stub", `stub-scan: clean (${prod.length} source files)`, errors);
