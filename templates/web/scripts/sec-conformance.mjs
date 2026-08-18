import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { read, fail, ok } from "./lib.mjs";
import { gateResult } from "./config.mjs";

// @adr 100 - the security claim is derived from this repository, and reproducible
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

const KIND = "frontend"; // this template's kind in references/templates.json
const CATALOGUE = ".proto-forge/security/controls.json";
const REPORT = ".proto-forge/security/conformance.json";

const sha256 = (s) => createHash("sha256").update(s).digest("hex");
const readIf = (p) => (existsSync(p) ? read(p) : "");

// --- the probes ----------------------------------------------------------------
// Each answers exactly one control. Kept small and literal on purpose: a probe that
// needs interpretation is a probe whose verdict nobody can check.

const NGINX = "deploy/nginx/default.conf";
const VITE = "vite.config.ts";

/** A header counts as set only where BOTH the shipped runtime and the preview set it. */
const headerEverywhere = (name, value) => {
  const nginx = readIf(NGINX);
  const vite = readIf(VITE);
  if (nginx === "" && vite === "") return null;
  const inNginx = nginx.includes(`add_header ${name} "${value}"`);
  const inVite = vite.includes(`"${name}": "${value}"`);
  return inNginx && inVite;
};

const cspDirective = (directive) => {
  const nginx = readIf(NGINX);
  const vite = readIf(VITE);
  if (nginx === "" && vite === "") return null;
  return nginx.includes(directive) && vite.includes(directive);
};

const PROBES = {
  // V1.3.1 — one sanitized sink, and lint that forbids every other one.
  safeHtmlIsSoleSink() {
    if (!existsSync("src/shared/SafeHtml.tsx")) return false;
    const sanitizes = /DOMPurify|dompurify/.test(read("src/shared/SafeHtml.tsx"));
    const lint = readIf("eslint.config.js");
    return sanitizes && lint.includes("react/no-danger") && lint.includes("no-unsanitized");
  },
  // V3.4.3 — a policy is sent at all, and the shipped one is not the dev relaxation.
  cspHeaderPresent() {
    const nginx = readIf(NGINX);
    const vite = readIf(VITE);
    if (nginx === "" && vite === "") return null;
    const shipped = nginx.includes("add_header Content-Security-Policy");
    const strict = vite.includes("script-src 'self'\"") || vite.includes('STRICT_HEADERS');
    return shipped && strict && !nginx.includes("unsafe-eval");
  },
  headerNosniff: () => headerEverywhere("X-Content-Type-Options", "nosniff"),
  headerReferrerPolicy: () => headerEverywhere("Referrer-Policy", "strict-origin-when-cross-origin"),
  cspFrameAncestors: () => cspDirective("frame-ancestors 'none'"),
  // V15.1.2 — the inventory exists and was produced from this tree, not typed.
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
const applies = (c) => (c.appliesTo?.kinds ?? []).includes(KIND) || (c.appliesTo?.templates ?? []).includes("web");

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
