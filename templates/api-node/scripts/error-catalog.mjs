import { existsSync } from "node:fs";
import { read, walk, isProd } from "./lib.mjs";
import { gateResult } from "./config.mjs";
import { PROBLEMS_DOC } from "./docs-lib.mjs";

// @adr 004 - every error is a registered problem type (BR-23)
//
// The problem catalogue (src/platform/problems.ts) is the backend's i18n-catalogue
// equivalent: the single source a consumer programs against and a frontend
// translates FROM. This gate closes the catalogue from both sides — an error
// invented at a throw site is an unregistered contract change, and a catalogue
// entry no code can emit is documentation of fiction. Both fail.

const CATALOGUE = "src/platform/problems.ts";

// Framework-emitted codes: the kernel produces these itself — "validation-failed"
// for a zod boundary rejection, "route-not-found" for an unmatched path,
// "internal" for an unexpected throw — so no handler ever references them by
// hand. They are exempt from the "referenced at least once" rule and ONLY they are.
const FRAMEWORK_EMITTED = ["internal", "validation-failed", "route-not-found"];

const errors = [];

if (!existsSync(CATALOGUE)) {
  gateResult("errors", "error:catalog", [`${CATALOGUE} is missing — there is no problem catalogue to register against`]);
  process.exit(0);
}

// --- parse the catalogue ------------------------------------------------------
const src = read(CATALOGUE);
const body = /export const problems\s*=\s*\{([\s\S]*?)\n\}/.exec(src)?.[1];
if (body === undefined) {
  gateResult("errors", "error:catalog", [`${CATALOGUE}: could not find the \`export const problems = {...}\` literal`]);
  process.exit(0);
}

// Keys may be quoted ("route-not-found") or bare identifiers (internal).
const entries = [...body.matchAll(/(["']?)([\w-]+)\1:\s*\{[^}]*?code:\s*"([\w-]+)"[^}]*?status:\s*(\d+)[^}]*?title:\s*"([^"]*)"/g)].map(
  (m) => ({ key: m[2], code: m[3], status: Number(m[4]), title: m[5] }),
);
if (entries.length === 0) errors.push(`${CATALOGUE}: the catalogue is empty — parsing failed, or nothing is registered`);

const codes = new Set();
for (const e of entries) {
  if (e.key !== e.code) errors.push(`${CATALOGUE}: key "${e.key}" must equal its code "${e.code}" — one name per problem`);
  if (codes.has(e.code)) errors.push(`${CATALOGUE}: duplicate problem code "${e.code}" — codes are the contract, and a contract entry exists once`);
  codes.add(e.code);
}

// --- every referenced code is registered; every entry is referenced -----------
const prod = walk("src", isProd).filter(
  (p) => !p.startsWith("src/test/") && !p.startsWith("src/harness/") && !p.includes("__fixtures__") && p !== CATALOGUE,
);
const referenced = new Set();

for (const file of prod) {
  const text = read(file);
  // Throw sites: new AppProblem("<code>", ...)
  for (const m of text.matchAll(/new AppProblem\(\s*"([\w-]+)"/g)) {
    referenced.add(m[1]);
    if (!codes.has(m[1])) {
      errors.push(`${file}: new AppProblem("${m[1]}") is an unregistered error shape — register it in ${CATALOGUE} first (BR-23)`);
    }
  }
  // Route declarations: problems: ["<code>", ...]
  for (const m of text.matchAll(/problems:\s*\[([^\]]*)\]/g)) {
    for (const c of m[1].matchAll(/"([\w-]+)"/g)) {
      referenced.add(c[1]);
      if (!codes.has(c[1])) {
        errors.push(`${file}: route declares problem "${c[1]}", which ${CATALOGUE} does not register — an unregistered error shape (BR-23)`);
      }
    }
  }
}

for (const e of entries) {
  if (FRAMEWORK_EMITTED.includes(e.code)) continue;
  if (!referenced.has(e.code)) {
    errors.push(
      `${CATALOGUE}: "${e.code}" is a stale catalogue entry — no throw site and no route declares it, ` +
        `so consumers are being promised an error nothing can emit`,
    );
  }
}

// --- the catalogue's documentation names every code ---------------------------
if (!existsSync(PROBLEMS_DOC)) {
  errors.push(`${PROBLEMS_DOC} is missing — the problem catalogue is part of the documented API surface`);
} else {
  const doc = read(PROBLEMS_DOC);
  for (const e of entries) {
    if (!doc.includes(e.code)) errors.push(`${PROBLEMS_DOC}: does not mention "${e.code}" — every registered problem is documented`);
  }
}

gateResult(
  "errors",
  `error:catalog: ${entries.length} problem type(s), every reference registered, every entry emittable and documented`,
  errors,
);
