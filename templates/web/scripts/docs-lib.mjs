import { existsSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { hashFiles, isCode, read, walk } from "./lib.mjs";

const sha256 = (s) => createHash("sha256").update(s).digest("hex");

// Shared vocabulary for the two documentation gates: what a component's source
// is, where its lock lives, and how "is this screenshot still current?" is answered.
export const CASES_FILE = "src/harness/cases.ts";
/** A mount edit changes the picture as surely as a case edit changes the framing. */
export const MOUNTS_FILE = "src/harness/mounts.tsx";

/** PascalCase exports of the library — SCREAMING_CASE constants are not components. */
export function documentableComponents(indexPath = "packages/proto-ui/src/index.ts") {
  // Missing index = no library to document. Returning [] beats an ENOENT stack
  // trace: callers are gates and sync tools, and "nothing to document" is a valid
  // state (a fixture project, a run before Phase 3).
  if (!existsSync(indexPath)) return [];
  const src = read(indexPath);
  const names = new Set();
  for (const m of src.matchAll(/export\s*\{([^}]*)\}/g)) {
    for (const spec of m[1].split(",")) {
      const trimmed = spec.trim();
      if (trimmed === "" || trimmed.startsWith("type ")) continue;
      const name = trimmed.split(/\s+as\s+/).pop().trim();
      if (/^[A-Z][a-zA-Z0-9]*$/.test(name)) names.add(name);
    }
  }
  return [...names].sort();
}

/** Every feature directory that a prototype has built. */
export function features(root = "src/features") {
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
}

/**
 * The file(s) whose content decides whether a component's screenshots are stale.
 * File name first, then the export declaration — several components legitimately
 * live in a file named after something else (ToastProvider is in Toast.tsx,
 * ProtoUIProvider in providers/index.tsx), and matching only on file name would
 * silently report "no source", which reads like "nothing to keep fresh".
 */
export function componentSources(component) {
  const candidates = [
    ...walk("packages/proto-ui", isCode),
    ...walk("src/shared", isCode),
  ].filter((p) => !/\.(test|e2e)\./.test(p));

  const byFilename = candidates.filter((p) => p.endsWith(`/${component}.tsx`) || p.endsWith(`/${component}.ts`));
  if (byFilename.length > 0) return byFilename.sort();

  const declares = new RegExp(`export\\s+(?:function|const|class)\\s+${component}\\b`);
  return candidates.filter((p) => declares.test(read(p))).sort();
}

export function featureSources(feature) {
  return walk(join("src/features", feature), (p) => isCode(p) && !/\.(test|e2e)\./.test(p)).sort();
}

/**
 * A screenshot is current when the component's source AND the case that produced
 * it are unchanged — a case edit changes framing and state, which changes the image.
 */
export function sourceHash(sources) {
  const registry = [CASES_FILE, MOUNTS_FILE].filter((f) => existsSync(f));
  return hashFiles([...sources, ...registry]);
}

export const lockFor = (kind, name) => join("docs", kind, name, ".shot.lock");
export const docFor = (kind, name) => join("docs", kind, name, "README.md");

// --- the decision half of the lock (BR-42) --------------------------------------
// A page can be a perfect description of code that implements a decision nobody
// holds any more: change the ADR alone and the source hash above does not move,
// because the source did not. So the lock also records the DECISIONS the subject
// implements, discovered from the `// @adr NNN` anchors already in its sources —
// never from a hand-written list, which would be a second source of truth and
// would drift the moment an anchor moved.

/** ADR numbers anchored in these sources, sorted, deduplicated. */
export function anchoredAdrs(sources) {
  const found = new Set();
  for (const p of sources) {
    for (const m of read(p).matchAll(/@adr\s+(\d{3})\b/g)) found.add(m[1]);
  }
  return [...found].sort();
}

/**
 * `{ "030": <sha256 of the decision> }` for each anchored ADR.
 *
 * The hash covers the ADR from its first `## ` heading down, NOT the whole file.
 * Frontmatter moves when the status flips proposed → accepted and when a
 * prompt-log link is backfilled; both are changes to the EVIDENCE for a decision,
 * not to the decision, and staling every page in the repository over them would
 * train people to re-lock without reading. What is left is the decision itself.
 */
export function adrDigests(numbers) {
  const digests = {};
  for (const n of numbers) {
    const dir = "docs/adr";
    const file = existsSync(dir) ? readdirSync(dir).find((f) => f.startsWith(`${n}-`)) : undefined;
    // A missing ADR is adr:lint's finding, not this gate's: recording it as absent
    // keeps the two gates from reporting the same defect in different words.
    digests[n] = file === undefined ? "absent" : sha256(body(read(join(dir, file))));
  }
  return digests;
}

const body = (markdown) => {
  const i = markdown.indexOf("\n## ");
  return i === -1 ? markdown : markdown.slice(i);
};
