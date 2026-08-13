import { walk, read, isCode, isProd, fail, ok } from "./lib.mjs";

// BR-12: no stubbed dependencies / placeholder markers in delivered code.
// NOTE (honest limit): grep cannot fully prove "no inline mock data" — a large
// static literal dataset in a handler could still slip. This gate enforces the
// mechanically-detectable surface (markers + first-party mocks + fixture pulls);
// the seed-data allowance is confined by convention to the harness seed.
//
// The harness and the e2e composition roots are TEST SURFACE by design: the
// scenario catalogue is data for the conformance run, and the e2e boot composes
// the __fixtures__ port fake because Python has no in-process real Postgres —
// the real-database tier is tests/integration (BRS §15/§19, ADR 003/022).
const prod = walk("src", isProd);
const allSource = [...walk("src", isCode), ...walk("tests", isCode)];
const errors = [];

const markers = [/\bTODO\b/i, /\bFIXME\b/i, /\bXXX\b/, /\bHACK\b/i, /not implemented/i, /\bunimplemented\b/i, /lorem ipsum/i, /NotImplementedError/];
const isTestSurface = (f) =>
  f.includes("__fixtures__") || f.startsWith("src/app/harness/") || f.startsWith("src/app/e2e/");

for (const f of prod) {
  const b = read(f);
  for (const re of markers) if (re.test(b)) errors.push(`${f}: banned marker ${re}`);
  // Fixture modules and the test surface may compose each other; the ban
  // is on PRODUCT code reaching into __fixtures__.
  if (!isTestSurface(f) && /^\s*(?:import|from)\s+[\w.]*__fixtures__/m.test(b)) {
    errors.push(`${f}: pulls __fixtures__ into production code`);
  }
}

// Mocking or monkeypatching a first-party module (app.*) is banned ANYWHERE —
// conftest and helper files apply patches globally, so scan all source including
// tests. The port fake in __fixtures__ is the sanctioned seam; a patched app
// module is a test that asserts agreement with the patch (BR-12).
const firstPartyMock = /(?:\bpatch(?:\.object)?|\bmocker\.patch|monkeypatch\.(?:setattr|setitem|delattr))\(\s*["']app\./;
for (const f of allSource) {
  if (firstPartyMock.test(read(f))) errors.push(`${f}: mocks a first-party module (BR-12)`);
}

// The gated rules have no noqa escape hatch BY DESIGN — the fix is always moving
// the import, the log call or the code, never silencing the rule. A disable
// comment for the security rules (S...) or the print ban (T20...) is a shortcut
// marker like TODO, and it is caught here for the same reason. (Per-file ignores
// in pyproject are visible, reasoned configuration — this bans the inline path.)
const GATED_RULES = /#\s*noqa(?::\s*[A-Z0-9, ]*\b(S\d{3}|T20\d)\b|\s*$)/;
for (const f of prod) {
  if (GATED_RULES.test(read(f))) {
    errors.push(`${f}: disables a gated lint rule inline — these rules have no escape hatch; fix the code (BR-21/NFR-12)`);
  }
}

// A __fixtures__ module may export factories built with define_factory, plus
// BEHAVIOUR — function/class definitions such as the factory plumbing itself or
// an in-memory port fake. What it may NOT export is a bare literal binding: that
// is exactly the hand-written fixture that drifts from the domain without
// anything failing (BR-12). Private (underscore) module state is plumbing.
for (const f of allSource.filter((p) => p.includes("__fixtures__") && !p.endsWith("__init__.py"))) {
  const b = read(f);
  for (const m of b.matchAll(/^([A-Za-z]\w*)(?::[^=\n]+)?\s*=\s*(.+)$/gm)) {
    const rhs = m[2] ?? "";
    if (/define_factory\(/.test(rhs)) continue;
    errors.push(
      `${f}: exports "${m[1]}" that is not a define_factory(...) — ` +
        `a hand-written fixture drifts from the domain without anything failing (BR-12)`,
    );
  }
}

if (errors.length) fail("stub-scan FAILED", errors);
ok(`stub-scan: clean (${prod.length} prod, ${allSource.length} source files)`);
