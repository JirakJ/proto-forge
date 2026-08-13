import { existsSync } from "node:fs";
import { read } from "./lib.mjs";

// @adr 001 - the documented quality status is a derivation, never a claim (BR-36)
//
// The shared vocabulary of the quality-status pair: `quality:report` (the
// producer) derives the workspace's facts — how many parts the manifest
// declares, how many are materialized on this machine, and the verify chain —
// into .proto-forge/quality.json and regenerates the STATUS.md block from it;
// `status:verify` (the gate) re-derives everything here and fails on any
// disagreement. The present-count is machine state on purpose: parts arrive by
// clone/generation, and the report restates what THIS run saw — the producer
// runs right before the gate, so the pair always agrees within one verify.
// No wall-clock anywhere: freshness is the bond to the same verify run.

export const QUALITY_FILE = ".proto-forge/quality.json";
export const STATUS_DOC = "docs/STATUS.md";
export const STATUS_BEGIN = "<!-- quality:begin -->";
export const STATUS_END = "<!-- quality:end -->";

// The derivation source — the same manifest ws:verify holds the tree to.
export const MANIFEST = "workspace.json";

/** The verify chain as package.json declares it: split on &&, strip `pnpm run`. */
export function verifyChain(pkg = JSON.parse(read("package.json"))) {
  return (pkg.scripts?.verify ?? "")
    .split("&&")
    .map((s) => s.trim().replace(/^pnpm run\s+/, ""))
    .filter((s) => s !== "");
}

/**
 * Part counts from the manifest and the tree — null when the manifest is
 * missing or unreadable, so the caller can name exactly what vanished
 * instead of reporting zero.
 */
export function partCounts() {
  if (!existsSync(MANIFEST)) return null;
  let manifest;
  try {
    manifest = JSON.parse(read(MANIFEST));
  } catch {
    return null;
  }
  const parts = Array.isArray(manifest.parts) ? manifest.parts : [];
  const present = parts.filter((p) => typeof p.dir === "string" && existsSync(p.dir)).length;
  return { declared: parts.length, present };
}

/**
 * The STATUS.md block, derived from quality.json ALONE — status:verify
 * re-renders from the same input and compares byte-wise, so a hand edit
 * anywhere between the markers is a caught drift.
 */
export function renderStatusBlock(q) {
  const rows = [
    ["workspace parts", `${q.parts.present}/${q.parts.declared} present`, "manifest ↔ tree (ws:verify)"],
    ["verify gates", String(q.gates.count), "fail-fast chain"],
  ];
  const table = [
    "| measure | value | enforced by |",
    "| --- | --- | --- |",
    ...rows.map((r) => `| ${r[0]} | ${r[1]} | ${r[2]} |`),
  ].join("\n");
  return `${table}\n\nGate chain: ${q.gates.chain.join(" → ")}`;
}
