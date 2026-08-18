import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { read, fail, ok } from "./lib.mjs";
import { gateResult } from "./config.mjs";

// @adr 009 - the security claim is derived from this repository, and reproducible
//
// Two artefacts, because conformance has two halves that behave differently:
//
//   conformance.json  the CLAIM — which requirement of a named standard is met,
//                     by which control, proven by which probe. Derived ONLY from
//                     files in this repository, so it is byte-reproducible: run it
//                     twice, or in a year from a clean checkout, and the bytes are
//                     identical. Its digest is pinned in .proto-forge/snapshot.json.
//
//   findings.sarif    the OBSERVATION — what the scanners saw at one moment. NOT
//                     produced here and deliberately not hashed: CVE feeds move
//                     under a fixed commit, so any report embedding findings stops
//                     being reproducible the moment it is honest. sec:scan owns
//                     that half, gated by threshold.
//
// Mixing the two would force a choice between lying about determinism and omitting
// findings. Splitting them is the whole reason this file exists separately.
//
// A probe is a PURE FUNCTION OF REPOSITORY CONTENT: no network, no clock, no env
// (NFR-16). It returns true, false, or null for "not applicable to this repo".

const KIND = "backend"; // this template's kind in references/templates.json
const CATALOGUE = ".proto-forge/security/controls.json";
const REPORT = ".proto-forge/security/conformance.json";

const sha256 = (s) => createHash("sha256").update(s).digest("hex");
const readIf = (p) => (existsSync(p) ? read(p) : "");

// --- the probes ----------------------------------------------------------------
// A service sets its headers from the byte-pinned platform kernel, on an onRequest
// hook (or its per-stack equivalent) so error responses carry them too. The probe
// therefore reads that one file: if the kernel stops setting a header, no route
// sets it, which is precisely the blast radius worth gating on.

const KERNEL = "src/App/Platform/SecurityHeadersMiddleware.cs";

const kernelSets = (header) => {
  const src = readIf(KERNEL);
  if (src === "") return null;
  return new RegExp(header, "i").test(src);
};

const PROBES = {
  cspHeaderPresent: () => kernelSets("content-security-policy"),
  headerNosniff: () => {
    const src = readIf(KERNEL);
    if (src === "") return null;
    return /x-content-type-options/i.test(src) && /nosniff/i.test(src);
  },
  headerReferrerPolicy: () => {
    const src = readIf(KERNEL);
    if (src === "") return null;
    return /referrer-policy/i.test(src) && /strict-origin-when-cross-origin/i.test(src);
  },
  sbomIsCurrent() {
    if (!existsSync(".proto-forge/sbom.cdx.json")) return false;
    const sbom = JSON.parse(read(".proto-forge/sbom.cdx.json"));
    return sbom.bomFormat === "CycloneDX" && Array.isArray(sbom.components) && sbom.components.length > 0;
  },
};

// --- derive the claim ----------------------------------------------------------
if (!existsSync(CATALOGUE)) {
  fail("sec:conformance FAILED", [
    `${CATALOGUE} is missing — there is no catalogue to measure against, so no claim can be made`,
  ]);
}
const catalogue = JSON.parse(read(CATALOGUE));
const asvs = catalogue.standards?.asvs ?? {};
const standardPath = `.proto-forge/standards/${(asvs.vendored ?? "").split("/").pop()}`;
const levels = new Map();
if (existsSync(standardPath)) {
  for (const r of JSON.parse(read(standardPath)).requirements ?? []) levels.set(r.req_id, Number(r.L));
}

const errors = [];
const TEMPLATE_ID = "api-dotnet"; // this template's id in references/templates.json
const applies = (c) =>
  (c.appliesTo?.kinds ?? []).includes(KIND) || (c.appliesTo?.templates ?? []).includes(TEMPLATE_ID);

const rows = [];
for (const c of (catalogue.controls ?? []).filter(applies)) {
  let verdict;
  let detail;
  if (c.status === "planned") {
    // An identified gap is reported as one. Not a failure — the catalogue's own
    // gate already refuses a planned control that pretends to have a probe.
    verdict = "gap";
    detail = `planned for ${c.stage}`;
  } else {
    const probe = PROBES[c.probe];
    if (probe === undefined) {
      errors.push(`${c.id}: the catalogue names probe "${c.probe}", which this template does not implement`);
      continue;
    }
    const result = probe();
    verdict = result === null ? "not-applicable" : result ? "pass" : "fail";
    detail = c.probe;
    if (verdict === "fail") {
      errors.push(`${c.id} (${c.title}): probe "${c.probe}" does not hold — ${c.control}`);
    }
  }
  rows.push({
    id: c.id,
    title: c.title,
    requires: (c.requires ?? []).map((r) => ({
      standard: r.standard,
      req: r.req ?? null,
      level: r.standard === "asvs" ? (levels.get(r.req) ?? null) : null,
    })),
    verdict,
    evidence: detail,
  });
}

// Determinism, stated as code rather than hoped for: sorted by id, no timestamp,
// no absolute path, no tool version, no environment. Everything below is a
// function of files in this repository.
rows.sort((a, b) => a.id.localeCompare(b.id));
const body = {
  standard: { name: asvs.name ?? null, version: asvs.version ?? null, tag: asvs.tag ?? null, sha256: asvs.sha256 ?? null },
  profile: asvs.profile?.default ?? null,
  kind: KIND,
  summary: {
    pass: rows.filter((r) => r.verdict === "pass").length,
    fail: rows.filter((r) => r.verdict === "fail").length,
    gap: rows.filter((r) => r.verdict === "gap").length,
    notApplicable: rows.filter((r) => r.verdict === "not-applicable").length,
  },
  controls: rows,
};
const rendered = `${JSON.stringify(body, null, 2)}\n`;
const digest = sha256(rendered);

if (process.argv.includes("--write")) {
  if (errors.length > 0) {
    fail("sec:conformance FAILED — the claim was not written", errors);
  }
  writeFileSync(REPORT, rendered);
  ok(`sec:conformance: wrote ${REPORT} — ${body.summary.pass} met, ${body.summary.gap} gap(s), digest ${digest.slice(0, 12)}…`);
  process.exit(0);
}

// The claim must be committed, and must be the one this repository derives today.
// Same mechanic as snapshot:diff, for the same reason: a claim nobody re-derives
// is a claim that stays green while becoming false.
if (!existsSync(REPORT)) {
  errors.push(`${REPORT} is missing — run \`pnpm sec:conformance:write\``);
} else if (readFileSync(REPORT, "utf8") !== rendered) {
  errors.push(
    `${REPORT} is not what this repository derives — the committed conformance claim and the code have ` +
      `diverged. Re-read what changed, then run \`pnpm sec:conformance:write\`.`,
  );
}

gateResult(
  "security",
  `sec:conformance: ${body.summary.pass}/${rows.length} control(s) met against ${body.standard.name} ` +
    `${body.standard.version} L${body.profile}, ${body.summary.gap} declared gap(s), digest ${digest.slice(0, 12)}…`,
  errors,
);
