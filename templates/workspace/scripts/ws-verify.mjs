import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { gateResult } from "./config.mjs";

// @adr 001 - the workspace manifest is the single source of parts
//
// Gate "ws" (BR-34). A workspace is a small git repo whose whole job is to keep
// three claims true at once:
//
//   1. workspace.json is well-formed — non-empty parts, unique ids and dirs,
//      known roles, and a pairedBrief that is a real sha256 (the identity every
//      part's facets.json must repeat). The SHIPPED sample pins the sha256 of
//      the sample brief quoted verbatim in README.md, so the strict shape holds
//      from the first clone — "PENDING" is not a hash.
//   2. Every part directory that EXISTS is a scaffolded proto-forge repo whose
//      .proto-forge/facets.json agrees on pairedBrief. Absent dirs are fine:
//      the workspace repo is cloned before its parts (pre-clone state).
//   3. .gitignore covers every parts[].dir as /<dir>/ — the parts are separate
//      git repositories and must never leak into this repo's history (T14).
//
// Deterministic on purpose: no clock, no network — only the manifest and the tree.

const MANIFEST = "workspace.json";
const ROLES = ["backend", "frontend", "e2e", "other"];
const SHA256 = /^[0-9a-f]{64}$/;
const SEGMENT = /^[a-z][a-z0-9-]*$/;

const errors = [];

let manifest;
if (!existsSync(MANIFEST)) {
  errors.push(`${MANIFEST} is missing — the manifest is the single source of parts`);
} else {
  try {
    manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));
  } catch (e) {
    errors.push(`${MANIFEST} does not parse: ${e.message}`);
  }
}

const parts = Array.isArray(manifest?.parts) ? manifest.parts : [];

if (manifest !== undefined) {
  checkManifestShape(manifest);
  checkGitignoreCoverage(parts);
  checkPresentParts(manifest, parts);
  checkContract(manifest, parts);
}

const present = parts.filter((p) => typeof p.dir === "string" && existsSync(p.dir)).length;
gateResult(
  "ws",
  `ws: manifest lists ${parts.length} part(s) — ${present} present, ${parts.length - present} awaiting clone/generation; gitignore covers every part dir`,
  errors,
);

function checkManifestShape(m) {
  if (typeof m.pairedBrief !== "string" || !SHA256.test(m.pairedBrief)) {
    errors.push(
      `pairedBrief must be the lowercase sha256 hex of the shared brief, got ${JSON.stringify(m.pairedBrief)} — ` +
        "the brief record lives in .prompts/0002-brief.md on a generated workspace; the shipped sample pins the sample brief quoted in README.md",
    );
  }
  if (!Array.isArray(m.parts) || m.parts.length === 0) {
    errors.push("parts[] must be a non-empty array — a workspace with no parts is not a workspace");
    return;
  }
  const ids = new Set();
  const dirs = new Set();
  for (const [i, p] of m.parts.entries()) {
    const at = `parts[${i}]`;
    if (typeof p.id !== "string" || !SEGMENT.test(p.id)) errors.push(`${at}: id must be a kebab-case string, got ${JSON.stringify(p.id)}`);
    if (typeof p.template !== "string" || p.template === "") {
      errors.push(`${at}: names no template — every part is generated from a registry template (references/templates.json)`);
    }
    if (typeof p.dir !== "string" || !SEGMENT.test(p.dir)) {
      errors.push(`${at}: dir must be a single kebab-case path segment (the /<dir>/ gitignore convention needs it), got ${JSON.stringify(p.dir)}`);
    }
    if (!ROLES.includes(p.role)) errors.push(`${at}: role must be one of ${ROLES.join("|")}, got ${JSON.stringify(p.role)}`);
    if (p.repo !== undefined && typeof p.repo !== "string") errors.push(`${at}: repo, when present, must be a clone URL string`);
    if (typeof p.id === "string") {
      if (ids.has(p.id)) errors.push(`${at}: duplicate part id "${p.id}" — ids are the manifest's primary key`);
      ids.add(p.id);
    }
    if (typeof p.dir === "string") {
      if (dirs.has(p.dir)) errors.push(`${at}: duplicate part dir "${p.dir}" — two parts cannot share a checkout`);
      dirs.add(p.dir);
    }
  }
}

function checkGitignoreCoverage(list) {
  if (!existsSync(".gitignore")) {
    errors.push(".gitignore is missing — part directories are separate git repositories and must be ignored here");
    return;
  }
  const lines = new Set(
    readFileSync(".gitignore", "utf8")
      .split("\n")
      .map((l) => l.trim()),
  );
  for (const p of list) {
    if (typeof p.dir !== "string" || !SEGMENT.test(p.dir)) continue;
    if (!lines.has(`/${p.dir}/`)) {
      errors.push(`.gitignore does not cover part dir "${p.dir}" — add the line "/${p.dir}/" (each part is its own git repo, T14)`);
    }
  }
}

function checkPresentParts(m, list) {
  for (const p of list) {
    if (typeof p.dir !== "string" || !existsSync(p.dir)) continue; // pre-clone state is legal
    if (!statSync(p.dir).isDirectory()) {
      errors.push(`part dir "${p.dir}" exists but is not a directory`);
      continue;
    }
    const facetsPath = join(p.dir, ".proto-forge", "facets.json");
    if (!existsSync(facetsPath)) {
      errors.push(`part dir "${p.dir}" exists but has no .proto-forge/facets.json — a part is a scaffolded proto-forge repo (incomplete clone?)`);
      continue;
    }
    let facets;
    try {
      facets = JSON.parse(readFileSync(facetsPath, "utf8"));
    } catch (e) {
      errors.push(`${facetsPath} does not parse: ${e.message}`);
      continue;
    }
    if (facets.pairedBrief === undefined) {
      errors.push(`${facetsPath} records no pairedBrief — every part repeats the workspace's brief hash (T14)`);
    } else if (facets.pairedBrief !== m.pairedBrief) {
      errors.push(
        `part "${p.id ?? p.dir}": pairedBrief disagrees with ${MANIFEST} — the parts answer different briefs ` +
          `(workspace ${String(m.pairedBrief).slice(0, 12)}…, ${p.dir} ${String(facets.pairedBrief).slice(0, 12)}…)`,
      );
    }
  }
}

function checkContract(m, list) {
  if (m.contract === undefined) return; // legal for a workspace with no backend part
  const source = m.contract?.source;
  if (typeof source !== "string" || source === "") {
    errors.push("contract.source must be a non-empty relative path when contract is declared");
    return;
  }
  if (source.startsWith("/") || source.split("/").includes("..") || !/^[A-Za-z0-9._/-]+$/.test(source)) {
    errors.push(`contract.source "${source}" must be a plain relative path inside the workspace (no leading /, no ..)`);
    return;
  }
  const owner = source.split("/")[0];
  if (!list.some((p) => p.dir === owner)) {
    errors.push(`contract.source "${source}" does not live inside any part dir — the contract is owned by a part (BR-22)`);
  }
}
