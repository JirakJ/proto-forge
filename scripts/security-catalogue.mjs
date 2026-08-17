import { existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { readJson, fail, ok } from "./lib.mjs";

// @adr 013 - the security bar is a named external standard, referenced not transcribed
//
// The gate that keeps references/security-controls.json honest (BR-38). Its whole
// reason for existing is one failure mode observed while the catalogue was being
// designed: the first draft of the design cited Trusted Types as an ASVS requirement
// (5.0 does not mention them anywhere), SRI at L2 (it is L3), and cookie attributes
// in V7 (they are in V3). Every one of those numbers looked plausible. A requirement
// id nobody can resolve is an id nobody checks, so this resolves all of them.
//
// Six checks:
//
//   1. the vendored standard is present and matches the sha256 the catalogue pins
//   2. every requires[].req resolves to a requirement in that standard
//   3. every cited requirement is IN the binding profile — citing an L3 requirement
//      while the default profile is L2 claims a bar we do not hold
//   4. every appliesTo kind/template exists in the template registry
//   5. an `enforced` control names a probe; a `planned` one names its stage and
//      never a probe — a probe that does not run is worse than an admitted gap
//   6. a control with no `requires` carries a `rationale` — our own strictness is
//      allowed, passing it off as the standard's is not
//
// Scope: plugin. The catalogue lives here because it binds ALL templates and no
// single template may hold the list the others are measured against.

const CATALOGUE = "references/security-controls.json";
const REGISTRY = "references/templates.json";

if (!existsSync(CATALOGUE)) fail("security-catalogue FAILED", [`${CATALOGUE} is missing`]);
const cat = readJson(CATALOGUE);
const errors = [];

// --- 1. the vendored standard is the one the catalogue pins ---------------------
const asvs = cat.standards?.asvs;
if (asvs === undefined) {
  fail("security-catalogue FAILED", [`${CATALOGUE}: standards.asvs is missing — the bar has no source`]);
}
const requirements = new Map();
if (!existsSync(asvs.vendored)) {
  errors.push(
    `${asvs.vendored} is missing — the catalogue references a standard the repository does not contain, ` +
      `so no requirement number in it can be resolved`,
  );
} else {
  const bytes = readFileSync(asvs.vendored);
  const actual = createHash("sha256").update(bytes).digest("hex");
  if (actual !== asvs.sha256) {
    errors.push(
      `${asvs.vendored} is not the pinned standard: expected ${asvs.sha256}, got ${actual}. ` +
        `The bar moving silently is the one thing a conformance claim may never do — ` +
        `a deliberate upgrade is an ADR plus a new pin.`,
    );
  } else {
    for (const r of readJson(asvs.vendored).requirements ?? []) requirements.set(r.req_id, Number(r.L));
  }
}

// --- the binding profile -------------------------------------------------------
// Level N binds every requirement at or below it: L2 means L1 ∪ L2.
const profile = Number(asvs.profile?.default);
if (!Number.isInteger(profile) || profile < 1 || profile > 3) {
  errors.push(`${CATALOGUE}: standards.asvs.profile.default must be 1, 2 or 3 — got ${JSON.stringify(asvs.profile?.default)}`);
}

// --- 4. the kinds a control may bind -------------------------------------------
const templates = existsSync(REGISTRY) ? (readJson(REGISTRY).templates ?? []) : [];
const kinds = new Set(templates.map((t) => t.kind));
const ids = new Set(templates.map((t) => t.id));

// --- per-control checks --------------------------------------------------------
const seen = new Set();
const controls = cat.controls ?? [];
if (controls.length === 0) errors.push(`${CATALOGUE}: lists no controls`);

for (const c of controls) {
  const where = `${CATALOGUE}: ${c.id ?? "(control with no id)"}`;
  if (c.id === undefined) errors.push(`${where} has no id`);
  else if (seen.has(c.id)) errors.push(`${where} is declared twice — a control id is its handle in the report`);
  else seen.add(c.id);

  if (!c.title) errors.push(`${where} has no title`);
  if (!c.control) errors.push(`${where} names no control — a requirement with nothing behind it is a wish`);

  // 2 + 3: every cited requirement resolves, and is inside the binding profile.
  const requires = c.requires ?? [];
  for (const r of requires) {
    if (r.standard !== "asvs") continue; // slsa/ssdf are prose specs, cited by level/practice
    if (requirements.size === 0) continue; // the standard failed to load; check 1 already said so
    const level = requirements.get(r.req);
    if (level === undefined) {
      errors.push(
        `${where} cites ${asvs.name} ${r.req}, which does not exist in ${asvs.vendored} — ` +
          `a requirement number nobody can resolve is a number nobody checks`,
      );
    } else if (level > profile) {
      errors.push(
        `${where} cites ${r.req}, which is Level ${level}, while the binding profile is Level ${profile} — ` +
          `either raise the profile or record the control as a ratchet with an empty requires and a rationale`,
      );
    }
  }

  // 6: strictness beyond the standard must say so.
  if (requires.length === 0 && !c.rationale) {
    errors.push(
      `${where} cites no standard requirement and gives no rationale — a control we invented must say ` +
        `why, so proto-forge's own strictness is never read as someone else's requirement`,
    );
  }

  // 4: appliesTo binds something real.
  const applies = c.appliesTo ?? {};
  for (const k of applies.kinds ?? []) {
    if (!kinds.has(k)) errors.push(`${where} applies to kind "${k}", which no template in ${REGISTRY} has`);
  }
  for (const t of applies.templates ?? []) {
    if (!ids.has(t)) errors.push(`${where} applies to template "${t}", which ${REGISTRY} does not register`);
  }
  if ((applies.kinds ?? []).length === 0 && (applies.templates ?? []).length === 0) {
    errors.push(`${where} binds no template — a control nothing applies to is a control nobody runs`);
  }

  // 5: status is a promise about what runs today.
  if (c.status === "enforced") {
    if (!c.probe) errors.push(`${where} is "enforced" but names no probe — the verdict would have nothing behind it`);
  } else if (c.status === "planned") {
    if (!c.stage) errors.push(`${where} is "planned" but names no stage — an undated gap is a gap nobody closes`);
    if (c.probe) {
      errors.push(
        `${where} is "planned" yet names probe "${c.probe}" — a probe that does not run reads as coverage. ` +
          `Drop the probe or promote the control to "enforced".`,
      );
    }
  } else {
    errors.push(`${where} has status ${JSON.stringify(c.status)} — expected "enforced" or "planned"`);
  }
}

if (errors.length > 0) fail("security-catalogue FAILED", errors);

const enforced = controls.filter((c) => c.status === "enforced").length;
const planned = controls.length - enforced;
const cited = new Set(controls.flatMap((c) => (c.requires ?? []).filter((r) => r.standard === "asvs").map((r) => r.req)));
const binding = [...requirements.values()].filter((l) => l <= profile).length;
process.stdout.write(
  `· security-catalogue: ${cited.size} of ${binding} ${asvs.name} L${profile} requirements are claimed by a control — ` +
    `the remainder are not yet mapped, which this line states rather than hides\n`,
);
ok(
  `security-catalogue: ${controls.length} control(s) — ${enforced} enforced, ${planned} planned — ` +
    `against ${asvs.name} ${asvs.version} (L${profile}), pinned by sha256`,
);
