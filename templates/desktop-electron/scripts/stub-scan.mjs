import { walk, read, isCode, isProd, fail, ok } from "./lib.mjs";

// BR-12: no stubbed dependencies / placeholder markers in delivered code.
// BR-44: no dead-end interactions — a control whose only behaviour is to explain
// that the feature is missing is a placeholder wearing real i18n keys.
// NOTE (honest limit): grep cannot fully prove "no inline mock data" — a large
// static literal dataset in a feature could still slip. This gate enforces the
// mechanically-detectable surface (markers + first-party mocks + fixture pulls +
// dead-end copy + no-op wiring); the seed-data allowance is confined by
// convention to src/infra/**/seed.ts, and flow COMPLETENESS (an accepted CRUD
// ADR ships every screen and action the flow implies) is the Phase-4 DoD,
// verified in review — a scan cannot know what a flow implies.
const prod = [...walk("src", isProd), ...walk("packages", (p) => isCode(p) && !/\.test\./.test(p))];
const allSource = [...walk("src", isCode), ...walk("packages", isCode)];
const errors = [];

const markers = [/\bTODO\b/i, /\bFIXME\b/i, /\bXXX\b/, /\bHACK\b/i, /not implemented/i, /\bunimplemented\b/i, /lorem ipsum/i];

// BR-44: copy that tells the user the product is missing. The list is pinned
// here — widening it is free, narrowing it is a gate edit under review.
const DEAD_END = [
  /not (?:yet )?(?:available|implemented|supported)(?: in| yet)?\b/i,
  /coming soon/i,
  /in a (?:future|later) (?:version|release)/i,
  /\b(?:this|the) (?:prototype|demo|preview)\b/i,
  /will be (?:available|added|implemented)\b/i,
];

// Dead-end copy is a STRING problem: comments legitimately talk about "the demo"
// (Phase 1 deletes it), so only quoted literals are scanned in code.
const stringLiterals = (body) =>
  [...body.matchAll(/"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`/g)].map((m) => m[0]);
// The harness is the screenshot-and-browser-test catalogue (§2): its mounts wire
// no-op callbacks BY DESIGN, so the wiring checks skip it — features do not.
const isHarness = (p) => /(^|\/)src\/harness\//.test(p);

for (const f of prod) {
  const b = read(f);
  for (const re of markers) if (re.test(b)) errors.push(`${f}: banned marker ${re}`);
  for (const lit of stringLiterals(b)) {
    for (const re of DEAD_END) {
      if (re.test(lit)) errors.push(`${f}: dead-end copy ${re} in ${lit.slice(0, 60)} — wire the action or drop the control; a scope cut is an ADR, not UI copy (BR-44)`);
    }
  }
  // A handler that is a hard-coded empty function, or a link to nowhere, is a
  // control wired to nothing — the mechanical half of the dead-end ban.
  if (!isHarness(f)) {
    if (/\bon[A-Z]\w*=\{\s*\(\s*\)\s*=>\s*\{\s*\}\s*\}/.test(b) || /\bon[A-Z]\w*\s*:\s*\(\s*\)\s*=>\s*\{\s*\}/.test(b)) {
      errors.push(`${f}: an interaction handler is a hard-coded no-op — the control performs nothing (BR-44)`);
    }
    if (/\bhref=(?:"#"|'#'|\{\s*["']#["']\s*\})/.test(b)) {
      errors.push(`${f}: href="#" is a link to nowhere — route it through src/app/routes.ts or drop it (BR-44)`);
    }
  }
  if (/(?:\bfrom\b|import\(|require\()\s*[`"'][^`"']*__fixtures__/.test(b)) errors.push(`${f}: pulls __fixtures__ into production code`);
  // BR-48: user state (settings included) persists through the repository port
  // on the real persistence adapter — where schema versioning and migrations
  // live. Ad-hoc web storage is unversioned and silently wiped by the next
  // build's key drift; a reset is an ADR with a migration, never an accident.
  if (/\b(?:localStorage|sessionStorage)\b/.test(b)) {
    errors.push(`${f}: direct web storage access — persist through the repository port so settings survive a rebuild (BR-48)`);
  }
}

// BR-44, catalogue half: the polite refusal usually ships as a translated i18n
// value, which every code-only scan is blind to. Scan every catalogue VALUE for
// the markers and the dead-end list ("pseudo" is generated decoration of the
// default locale, so scanning it adds only duplicate findings).
const catalogues = walk("src/i18n/locales", (p) => p.endsWith(".json") && !p.endsWith("pseudo.json"));
// Values get the dead-end list plus the classic placeholder texts, NOT the code
// markers wholesale: "XXX"/"HACK" are legitimate words in user-facing copy
// ("life hacks"), while TODO/FIXME/lorem in a shipped string are placeholders.
const valueMarkers = [/\bTODO\b/i, /\bFIXME\b/i, /lorem ipsum/i, ...DEAD_END];
const scanValues = (file, node, path) => {
  if (typeof node === "string") {
    for (const re of valueMarkers) {
      if (re.test(node)) errors.push(`${file}: catalogue value "${path}" carries dead-end copy ${re} (BR-44)`);
    }
    return;
  }
  if (node !== null && typeof node === "object") {
    for (const [k, v] of Object.entries(node)) scanValues(file, v, path ? `${path}.${k}` : k);
  }
};
for (const f of catalogues) {
  try {
    scanValues(f, JSON.parse(read(f)), "");
  } catch {
    errors.push(`${f}: not parseable as JSON — a catalogue that does not parse cannot be scanned`);
  }
}

// Mocking a first-party module (relative / @/ / @jj/) is banned ANYWHERE — setup and
// helper files apply mocks globally, so scan all source, and catch vi.doMock + backticks.
const firstPartyMock = /(?:vi|jest)\.(?:do)?mock\(\s*[`"'](?:@\/|@jj\/|\.\.?\/)/;
for (const f of allSource) {
  if (firstPartyMock.test(read(f))) errors.push(`${f}: mocks a first-party module (BR-12)`);
}

// BR-08 has no eslint-disable escape hatch BY DESIGN — the fix is always t('...') — and
// the same goes for addressability and layering rules. A disable comment for any of
// them is a shortcut marker like TODO, and it is caught here for the same reason.
const GATED_RULES = /eslint-disable[^\n]*(no-user-facing-literal|no-literal-string|require-testid|unique-testid|boundaries\/element-types)/;
for (const f of prod) {
  if (GATED_RULES.test(read(f))) {
    errors.push(`${f}: disables a gated lint rule inline — these rules have no escape hatch; fix the code (BR-08/BR-02)`);
  }
}

// A __fixtures__ module may export only schema-checked factories (defineFactory), the
// zod schemas they parse against, and types. A bare literal export is exactly the
// hand-written fixture that drifts from the domain without anything failing (BR-12).
for (const f of allSource.filter((p) => p.includes("__fixtures__"))) {
  const b = read(f);
  for (const m of b.matchAll(/^export\s+(?!type\b)(?:const|let|var|function|class|default)\s*(\w*)\s*=?\s*([^;\n]*)/gm)) {
    const rhs = m[2] ?? "";
    if (/defineFactory\s*\(/.test(rhs)) continue;
    if (/\bz\s*\./.test(rhs)) continue; // the schema the factory parses against
    errors.push(
      `${f}: exports "${m[1]}" that is neither a defineFactory(...) nor a zod schema — ` +
        `a hand-written fixture drifts from the domain without anything failing (BR-12)`,
    );
  }
}

if (errors.length) fail("stub-scan FAILED", errors);
ok(`stub-scan: clean (${prod.length} prod, ${allSource.length} source files)`);
