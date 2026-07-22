import { walk, read, isCode, isProd, fail, ok } from "./lib.mjs";

// BR-12: no stubbed dependencies / placeholder markers in delivered code.
// NOTE (honest limit): grep cannot fully prove "no inline mock data" — a large
// static literal dataset in a feature could still slip. This gate enforces the
// mechanically-detectable surface (markers + first-party mocks + fixture pulls);
// the seed-data allowance is confined by convention to src/infra/**/seed.ts.
const prod = [...walk("src", isProd), ...walk("packages", (p) => isCode(p) && !/\.test\./.test(p))];
const allSource = [...walk("src", isCode), ...walk("packages", isCode)];
const errors = [];

const markers = [/\bTODO\b/i, /\bFIXME\b/i, /\bXXX\b/, /\bHACK\b/i, /not implemented/i, /\bunimplemented\b/i, /lorem ipsum/i];
for (const f of prod) {
  const b = read(f);
  for (const re of markers) if (re.test(b)) errors.push(`${f}: banned marker ${re}`);
  if (/(?:\bfrom\b|import\(|require\()\s*[`"'][^`"']*__fixtures__/.test(b)) errors.push(`${f}: pulls __fixtures__ into production code`);
}

// Mocking a first-party module (relative / @/ / @jj/) is banned ANYWHERE — setup and
// helper files apply mocks globally, so scan all source, and catch vi.doMock + backticks.
const firstPartyMock = /(?:vi|jest)\.(?:do)?mock\(\s*[`"'](?:@\/|@jj\/|\.\.?\/)/;
for (const f of allSource) {
  if (firstPartyMock.test(read(f))) errors.push(`${f}: mocks a first-party module (BR-12)`);
}

if (errors.length) fail("stub-scan FAILED", errors);
ok(`stub-scan: clean (${prod.length} prod, ${allSource.length} source files)`);
