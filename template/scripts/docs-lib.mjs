import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { hashFiles, isCode, read, walk } from "./lib.mjs";

// Shared vocabulary for the two documentation gates: what a component's source
// is, where its lock lives, and how "is this screenshot still current?" is answered.
export const CASES_FILE = "src/gallery/cases.tsx";

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
  const inputs = existsSync(CASES_FILE) ? [...sources, CASES_FILE] : sources;
  return hashFiles(inputs);
}

export const lockFor = (kind, name) => join("docs", kind, name, ".shot.lock");
export const docFor = (kind, name) => join("docs", kind, name, "README.md");
