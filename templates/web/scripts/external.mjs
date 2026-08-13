import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { read } from "./lib.mjs";

// @adr 009 - external objects are recorded as MDX with their provenance in front
//
// Everything pushed to (or pulled from) Confluence and JIRA exists locally as one MDX
// file whose frontmatter answers the questions an operator has when the remote moves:
// WHICH object (url, id), WHICH revision we last saw (remoteVersion, remoteUpdatedAt),
// WHEN we saw it (syncedAt), WHICH direction the truth flows (push | pull), and WHICH
// local files the object concerns (affectedFiles) — so `sync:status` can say not just
// "page 123 changed upstream" but "and these are the files that change affects".
//
// The records ARE the ledger. The previous design kept a JSON ledger beside the docs;
// two stores of the same facts violate BR-15, and the JSON one was the copy nobody
// read. The frontmatter is a fixed, flat shape — strings, one number, one string
// array — parsed by hand below. A YAML library for five key types is weight the
// template's own rules would reject, and a fixed shape cannot need one.

export const EXTERNAL_DIR = "docs/external";

/** Frontmatter keys, in the one order every record uses: determinism keeps diffs clean. */
const KEY_ORDER = [
  "source",
  "id",
  "url",
  "title",
  "remoteVersion",
  "remoteUpdatedAt",
  "syncedAt",
  "direction",
  "affectedFiles",
];

export const recordPath = (source, id) => join(EXTERNAL_DIR, source, `${id}.mdx`);

/** Serialise one frontmatter value. Arrays become YAML block lists; nothing else nests. */
function serialiseValue(value) {
  if (Array.isArray(value)) {
    if (value.length === 0) return " []";
    return `\n${value.map((v) => `  - ${JSON.stringify(String(v))}`).join("\n")}`;
  }
  if (typeof value === "number") return ` ${value}`;
  return ` ${JSON.stringify(String(value))}`;
}

/** frontmatter object -> the exact bytes between the --- fences, keys in KEY_ORDER. */
export function serialiseFrontmatter(data) {
  const lines = [];
  for (const key of KEY_ORDER) {
    if (data[key] === undefined) continue;
    lines.push(`${key}:${serialiseValue(data[key])}`);
  }
  // Unknown keys are an authoring error, not data to preserve silently.
  const unknown = Object.keys(data).filter((k) => !KEY_ORDER.includes(k));
  if (unknown.length > 0) throw new Error(`unknown frontmatter key(s): ${unknown.join(", ")}`);
  return lines.join("\n");
}

/** MDX text -> { data, body }. Inverse of serialiseFrontmatter for the shapes it emits. */
export function parseFrontmatter(mdx) {
  const match = /^---\n([\s\S]*?)\n---\n?/.exec(mdx);
  if (match === null) return { data: {}, body: mdx };
  const data = {};
  let pendingList = null;
  for (const line of match[1].split("\n")) {
    const item = /^ {2}- (.+)$/.exec(line);
    if (item !== null && pendingList !== null) {
      data[pendingList].push(JSON.parse(item[1]));
      continue;
    }
    const entry = /^(\w+):(.*)$/.exec(line);
    if (entry === null) continue;
    const [, key, raw] = entry;
    const value = raw.trim();
    if (value === "") {
      data[key] = [];
      pendingList = key;
    } else if (value === "[]") {
      data[key] = [];
      pendingList = null;
    } else if (/^\d+$/.test(value)) {
      data[key] = Number(value);
      pendingList = null;
    } else {
      data[key] = JSON.parse(value);
      pendingList = null;
    }
  }
  return { data, body: mdx.slice(match[0].length) };
}

export function readRecord(source, id) {
  const path = recordPath(source, id);
  if (!existsSync(path)) return null;
  const { data, body } = parseFrontmatter(read(path));
  return { frontmatter: data, body };
}

export function readRecords(source) {
  const dir = join(EXTERNAL_DIR, source);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".mdx"))
    .sort()
    .map((f) => {
      const id = f.replace(/\.mdx$/, "");
      const { data, body } = parseFrontmatter(read(join(dir, f)));
      return { id, frontmatter: data, body };
    });
}

export function writeRecord(source, id, frontmatter, body) {
  const path = recordPath(source, id);
  mkdirSync(dirname(path), { recursive: true });
  const text = `---\n${serialiseFrontmatter(frontmatter)}\n---\n\n${body.trim()}\n`;
  writeFileSync(path, text);
  return path;
}
