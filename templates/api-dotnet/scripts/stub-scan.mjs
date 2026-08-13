import { walk, read, isCode, isProd, fail, ok } from "./lib.mjs";

// BR-12: no stubbed dependencies / placeholder markers in delivered code.
// NOTE (honest limit): grep cannot fully prove "no inline mock data" — a large
// static literal dataset in a handler could still slip. This gate enforces the
// mechanically-detectable surface (markers + first-party mocks + fixture pulls);
// the seed-data allowance is confined by convention to the harness seed.
const prod = walk("src", isProd);
const allSource = [...prod, ...walk("tests", isCode)];
const errors = [];

const markers = [/\bTODO\b/i, /\bFIXME\b/i, /\bXXX\b/, /\bHACK\b/i, /not implemented/i, /\bunimplemented\b/i, /lorem ipsum/i];
for (const f of prod) {
  const b = read(f);
  for (const re of markers) if (re.test(b)) errors.push(`${f}: banned marker ${re}`);
  // Fixture classes and the test infrastructure may compose each other; the ban
  // is on PRODUCT code reaching into the fixtures namespace.
  if (/^using\s+(?:static\s+)?App\.Tests\.Fixtures/m.test(b)) {
    errors.push(`${f}: pulls __fixtures__ (App.Tests.Fixtures) into production code`);
  }
}

// Mocking a first-party type (Moq's Mock<App.…> / NSubstitute — every type in
// this repo is first-party) is banned ANYWHERE: a test that mocks the port it
// claims to prove asserts agreement with the mock (BR-12). The in-memory fixture
// implementations in App.Tests.Fixtures are the reviewed alternative.
const firstPartyMock = /\bnew\s+Mock<\s*(?:App\.|I?Note|IApp|Route|Problem|Harness)|\bMock\.Of<\s*(?:App\.|I?Note)|\bSubstitute\.For</;
for (const f of allSource) {
  if (firstPartyMock.test(read(f))) errors.push(`${f}: mocks a first-party module (BR-12)`);
}

// BR-21 and NFR-12 have no suppression escape hatch BY DESIGN — the fix is always
// moving the import or the log call, never silencing the rule. A Security-category
// SuppressMessage (or a #pragma over a security analyzer id) silences the gated
// rules (BRS §16), so it is a shortcut marker like TODO and is caught here for
// the same reason. Plain style/IDE suppressions are the compiler's business, not
// this gate's.
const GATED_RULES = /\bSuppressMessage\(\s*"Security|#pragma warning disable\s+(?:SCS|SYSLIB003|CA5)/;
for (const f of prod) {
  if (GATED_RULES.test(read(f))) {
    errors.push(`${f}: disables a gated lint rule inline — these rules have no escape hatch; fix the code (BR-21/NFR-12)`);
  }
}

// A fixtures class may expose factories built through DefineFactory(...), behaviour
// (methods, port fakes) and private plumbing. What it may NOT expose is a public
// static field holding a bare literal: that is exactly the hand-written fixture
// that drifts from the domain without anything failing (BR-12).
for (const f of allSource.filter((p) => p.toLowerCase().includes("/fixtures/"))) {
  const b = read(f);
  for (const m of b.matchAll(/^\s*public\s+(?:static\s+readonly|const)\s+[\w<>,.?\s[\]]+?\s(\w+)\s*=\s*([^;]*);/gm)) {
    const rhs = m[2] ?? "";
    if (/DefineFactory\s*\(/.test(rhs)) continue;
    errors.push(
      `${f}: exposes "${m[1]}" that is not a DefineFactory(...) product — ` +
        `a hand-written fixture drifts from the domain without anything failing (BR-12)`,
    );
  }
}

if (errors.length) fail("stub-scan FAILED", errors);
ok(`stub-scan: clean (${prod.length} prod, ${allSource.length} source files)`);
