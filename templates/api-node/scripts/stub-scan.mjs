import { walk, read, isCode, isProd, fail, ok } from "./lib.mjs";

// BR-12: no stubbed dependencies / placeholder markers in delivered code.
// NOTE (honest limit): grep cannot fully prove "no inline mock data" — a large
// static literal dataset in a handler could still slip. This gate enforces the
// mechanically-detectable surface (markers + first-party mocks + fixture pulls);
// the seed-data allowance is confined by convention to db/seed.sql.
const prod = walk("src", isProd);
const allSource = walk("src", isCode);
const errors = [];

const markers = [/\bTODO\b/i, /\bFIXME\b/i, /\bXXX\b/, /\bHACK\b/i, /not implemented/i, /\bunimplemented\b/i, /lorem ipsum/i];
for (const f of prod) {
  const b = read(f);
  for (const re of markers) if (re.test(b)) errors.push(`${f}: banned marker ${re}`);
  // Fixture modules and the test infrastructure may compose each other; the ban
  // is on PRODUCT code reaching into __fixtures__.
  const isTestSurface = f.includes("__fixtures__") || f.startsWith("src/test/");
  if (!isTestSurface && /(?:\bfrom\b|import\(|require\()\s*[`"'][^`"']*__fixtures__/.test(b)) {
    errors.push(`${f}: pulls __fixtures__ into production code`);
  }
}

// Mocking a first-party module (relative / @/) is banned ANYWHERE — setup and
// helper files apply mocks globally, so scan all source, and catch vi.doMock + backticks.
const firstPartyMock = /(?:vi|jest)\.(?:do)?mock\(\s*[`"'](?:@\/|\.\.?\/)/;
for (const f of allSource) {
  if (firstPartyMock.test(read(f))) errors.push(`${f}: mocks a first-party module (BR-12)`);
}

// BR-21 and NFR-12 have no eslint-disable escape hatch BY DESIGN — the fix is always
// moving the import or the log call, never silencing the rule. A disable comment for
// the boundary rules, the security rules or no-console is a shortcut marker like
// TODO, and it is caught here for the same reason.
const GATED_RULES = /eslint-disable[^\n]*(boundaries\/element-types|security\/|no-console)/;
for (const f of prod) {
  if (GATED_RULES.test(read(f))) {
    errors.push(`${f}: disables a gated lint rule inline — these rules have no escape hatch; fix the code (BR-21/NFR-12)`);
  }
}

// A __fixtures__ module may export schema-checked factories (defineFactory), the
// zod schemas they parse against, types, and BEHAVIOUR — function/class
// declarations such as the factory plumbing itself or an in-memory port fake.
// What it may NOT export is a bare literal binding: that is exactly the
// hand-written fixture that drifts from the domain without anything failing (BR-12).
for (const f of allSource.filter((p) => p.includes("__fixtures__"))) {
  const b = read(f);
  for (const m of b.matchAll(/^export\s+(?!type\b)(const|let|var|function|class|default)\s*(\w*)\s*=?\s*([^;\n]*)/gm)) {
    if (m[1] === "function" || m[1] === "class") continue; // behaviour, not data
    const rhs = m[3] ?? "";
    if (/defineFactory\s*\(/.test(rhs)) continue;
    if (/\bz\s*\./.test(rhs)) continue; // the schema the factory parses against
    errors.push(
      `${f}: exports "${m[2]}" that is neither a defineFactory(...) nor a zod schema — ` +
        `a hand-written fixture drifts from the domain without anything failing (BR-12)`,
    );
  }
}

if (errors.length) fail("stub-scan FAILED", errors);
ok(`stub-scan: clean (${prod.length} prod, ${allSource.length} source files)`);
