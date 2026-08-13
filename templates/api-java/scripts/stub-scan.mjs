import { walk, read, isCode, isProd, fail, ok } from "./lib.mjs";

// BR-12: no stubbed dependencies / placeholder markers in delivered code.
// NOTE (honest limit): grep cannot fully prove "no inline mock data" — a large
// static literal dataset in a handler could still slip. This gate enforces the
// mechanically-detectable surface (markers + first-party mocks + fixture pulls);
// the seed-data allowance is confined by convention to the harness seed.
const prod = walk("src", isProd);
const allSource = walk("src", isCode);
const errors = [];

const markers = [/\bTODO\b/i, /\bFIXME\b/i, /\bXXX\b/, /\bHACK\b/i, /not implemented/i, /\bunimplemented\b/i, /lorem ipsum/i];
for (const f of prod) {
  const b = read(f);
  for (const re of markers) if (re.test(b)) errors.push(`${f}: banned marker ${re}`);
  // Fixture classes and the test infrastructure may compose each other; the ban
  // is on PRODUCT code reaching into the fixtures package.
  if (/^import\s+(?:static\s+)?app\.fixtures\./m.test(b)) {
    errors.push(`${f}: pulls __fixtures__ (app.fixtures) into production code`);
  }
}

// Mocking a first-party class (Mockito's mock(app.…) / any @MockBean — every bean
// in this repo is first-party) is banned ANYWHERE: a test that mocks the port it
// claims to prove asserts agreement with the mock (BR-12). The in-memory fixture
// implementations in app.fixtures are the reviewed alternative.
const firstPartyMock = /\bmock(?:Static)?\(\s*app\.|\bmock(?:Static)?\(\s*(?:Note|App|Route|Problem|Harness)\w*\.class|@MockBean|@MockitoBean/;
for (const f of allSource) {
  if (firstPartyMock.test(read(f))) errors.push(`${f}: mocks a first-party module (BR-12)`);
}

// BR-21 and NFR-12 have no suppression escape hatch BY DESIGN — the fix is always
// moving the import or the log call, never silencing the rule. @SuppressFBWarnings
// silences the SpotBugs/findsecbugs security rules the register gates (BRS §16),
// so it is a shortcut marker like TODO and is caught here for the same reason.
// Plain compiler @SuppressWarnings("unchecked" …) is javac's business, not this gate's.
const GATED_RULES = /@SuppressFBWarnings/;
for (const f of prod) {
  if (GATED_RULES.test(read(f))) {
    errors.push(`${f}: disables a gated lint rule inline — these rules have no escape hatch; fix the code (BR-21/NFR-12)`);
  }
}

// A fixtures class may expose factories built through defineFactory(...), behaviour
// (methods, port fakes) and private plumbing. What it may NOT expose is a public
// static field holding a bare literal: that is exactly the hand-written fixture
// that drifts from the domain without anything failing (BR-12).
for (const f of allSource.filter((p) => p.includes("/fixtures/"))) {
  const b = read(f);
  for (const m of b.matchAll(/^\s*public\s+(?:static\s+final|final\s+static)\s+[\w<>,.?\s\[\]]+?\s(\w+)\s*=\s*([^;]*);/gm)) {
    const rhs = m[2] ?? "";
    if (/defineFactory\s*\(/.test(rhs)) continue;
    errors.push(
      `${f}: exposes "${m[1]}" that is not a defineFactory(...) product — ` +
        `a hand-written fixture drifts from the domain without anything failing (BR-12)`,
    );
  }
}

if (errors.length) fail("stub-scan FAILED", errors);
ok(`stub-scan: clean (${prod.length} prod, ${allSource.length} source files)`);
