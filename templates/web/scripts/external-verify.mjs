import { existsSync } from "node:fs";
import { loadConfig } from "./config.mjs";
import { gateResult } from "./config.mjs";
import { EXTERNAL_DIR, readRecords } from "./external.mjs";

// @adr 009 - an external record is provenance, and provenance has required fields
//
// A record in docs/external/** claims "this local repository and that remote object
// are related, and this is the revision we last agreed on". Every field the claim
// needs is required, and the emptiest field is the one this gate exists for:
// affectedFiles=[] would assert "this object concerns nothing here", which is worse
// than no record at all — sync:status would report drift against nothing.

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;
const SOURCES = ["confluence", "jira"];
const DIRECTIONS = ["push", "pull"];

const cfg = loadConfig();
const errors = [];
let total = 0;

for (const source of SOURCES) {
  const configuredBase = cfg.integrations?.[source]?.baseUrl ?? "";

  for (const record of readRecords(source)) {
    total += 1;
    const at = `${EXTERNAL_DIR}/${source}/${record.id}.mdx`;
    const f = record.frontmatter;

    for (const key of ["source", "id", "url", "title", "remoteUpdatedAt", "syncedAt", "direction"]) {
      if (f[key] === undefined || f[key] === "") errors.push(`${at}: missing required frontmatter "${key}"`);
    }
    if (f.source !== undefined && f.source !== source) {
      errors.push(`${at}: source "${f.source}" disagrees with its directory "${source}"`);
    }
    if (f.direction !== undefined && !DIRECTIONS.includes(f.direction)) {
      errors.push(`${at}: direction must be push|pull, got "${f.direction}"`);
    }
    for (const key of ["remoteUpdatedAt", "syncedAt"]) {
      if (f[key] !== undefined && f[key] !== "" && !ISO.test(String(f[key]))) {
        errors.push(`${at}: ${key} "${f[key]}" is not an ISO-8601 instant`);
      }
    }

    if (f.url !== undefined && f.url !== "") {
      let host = null;
      try {
        host = new URL(f.url).hostname;
      } catch {
        errors.push(`${at}: url "${f.url}" is not an absolute URL`);
      }
      if (host !== null && configuredBase !== "") {
        const expected = new URL(configuredBase).hostname;
        if (host !== expected) {
          errors.push(`${at}: url host "${host}" is not the configured ${source} host "${expected}"`);
        }
      }
    }

    // Confluence versions are the drift oracle; a record without one cannot answer
    // "did the page move past us?".
    if (source === "confluence" && typeof f.remoteVersion !== "number") {
      errors.push(`${at}: remoteVersion is required for a Confluence record`);
    }

    const affected = f.affectedFiles;
    if (!Array.isArray(affected) || affected.length === 0) {
      errors.push(
        `${at}: affectedFiles is empty — a record that affects nothing is worse than no record; ` +
          `declare the local files this object concerns`,
      );
    } else {
      for (const file of affected) {
        if (!existsSync(file)) errors.push(`${at}: affectedFiles names "${file}", which does not exist`);
      }
    }
  }
}

gateResult("external", `external:verify: ${total} record(s), each with provenance, a host and non-empty affected files`, errors);
