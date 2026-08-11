import { existsSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { loadConfig } from "./config.mjs";
import { assertMayCommit, atlassian, readLedger, recordLedger, writeOutbox } from "./outbox.mjs";
import { documentableComponents, features } from "./docs-lib.mjs";
import { mdToStorage } from "./md-to-storage.mjs";
import { read, walk, ok, note } from "./lib.mjs";

// @adr 009 - Confluence pages are staged, reviewed, then published by an operator
//   pnpm sync:confluence            build page payloads and print what would change
//   pnpm sync:confluence --commit   create/update the pages and upload screenshots
// Same contract as JIRA: no pipeline phase publishes anything. Overwriting a page
// somebody is reading is not a side effect a generator gets to have.

const commit = process.argv.includes("--commit");
const cfg = loadConfig();
const conf = cfg.integrations?.confluence ?? {};

if (!conf.enabled) {
  note("confluence: disabled (integrations.confluence.enabled = false) — nothing staged");
  process.exit(0);
}

const wanted = conf.publish ?? [];
const pages = [];

/** One page = a title, storage-format body, and the images it references. */
function page(id, title, markdown, imageBase) {
  const { storage, attachments } = mdToStorage(markdown);
  pages.push({
    id,
    title,
    body: storage,
    attachments: attachments.map((a) => join(imageBase, a)).filter((p) => existsSync(p)),
  });
}

if (wanted.includes("architecture") && existsSync("docs/ARCHITECTURE.md")) {
  page("architecture", "Architecture", read("docs/ARCHITECTURE.md"), "docs");
}

if (wanted.includes("security") && existsSync("docs/SECURITY.md")) {
  page("security", "Security baseline", read("docs/SECURITY.md"), "docs");
}

if (wanted.includes("adr-index")) {
  const rows = walk("docs/adr", (p) => p.endsWith(".md"))
    .sort()
    .map((p) => {
      const b = read(p);
      return {
        number: p.match(/\/(\d+)-/)?.[1] ?? "?",
        title: b.match(/# ADR \d+:\s*(.+)/)?.[1] ?? basename(p),
        status: b.match(/- Status:\s*(\w+)/)?.[1] ?? "unknown",
        date: b.match(/- Date:\s*(\S+)/)?.[1] ?? "",
        jira: b.match(/- JIRA:\s*(\S+)/)?.[1] ?? "",
      };
    });
  const md = [
    "# Decision record index",
    "",
    "Generated from `docs/adr/`. The records themselves live in the repository; this page is the index.",
    "",
    "| ADR | Title | Status | Date | JIRA |",
    "| --- | --- | --- | --- | --- |",
    ...rows.map((r) => `| ${r.number} | ${r.title} | ${r.status} | ${r.date} | ${r.jira} |`),
  ].join("\n");
  page("adr-index", "Decision record index", md, "docs");
}

if (wanted.includes("component-catalog")) {
  for (const component of documentableComponents()) {
    const doc = join("docs/components", component, "README.md");
    if (existsSync(doc)) page(`component-${component}`, `Component: ${component}`, read(doc), join("docs/components", component));
  }
  for (const feature of features()) {
    const doc = join("docs/features", feature, "README.md");
    if (existsSync(doc)) page(`feature-${feature}`, `Feature: ${feature}`, read(doc), join("docs/features", feature));
  }
}

for (const p of pages) writeOutbox("confluence", p.id, p);

const write = (s) => process.stdout.write(`${s}\n`);
if (pages.length === 0) {
  note("confluence: nothing to publish — check integrations.confluence.publish");
  process.exit(0);
}

const ledger = readLedger().confluence ?? {};
write(`${pages.length} page(s) staged in .proto-forge/outbox/:`);
for (const p of pages) {
  const known = ledger[p.id];
  const verb = known === undefined ? "create" : `update ${known.pageId}`;
  write(`  ${verb.padEnd(20)} ${p.title}  (${p.attachments.length} image(s))`);
}

if (!commit) {
  write("");
  write("Nothing was sent. Review the payloads, then: pnpm sync:confluence --commit --approve");
  process.exit(0);
}

// --- live ---------------------------------------------------------------------
const { integration, auth } = assertMayCommit("confluence", "confluence.publish");
const api = `${integration.baseUrl}/wiki/api/v2`;

for (const p of pages) {
  const known = ledger[p.id];
  let pageId;

  if (known === undefined) {
    const created = await atlassian(auth, `${api}/pages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        spaceId: integration.spaceKey,
        status: "current",
        title: p.title,
        parentId: integration.parentPageId === "" ? undefined : integration.parentPageId,
        body: { representation: "storage", value: p.body },
      }),
    });
    pageId = created.id;
    recordLedger("confluence", p.id, { pageId, title: p.title, version: created.version?.number ?? 1 });
  } else {
    // Confluence versions are optimistic: send the next number or the write is
    // rejected. Read the current one rather than trusting the ledger, so a page
    // edited by a human in the meantime fails loudly instead of being clobbered.
    const current = await atlassian(auth, `${api}/pages/${known.pageId}`);
    const updated = await atlassian(auth, `${api}/pages/${known.pageId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: known.pageId,
        status: "current",
        title: p.title,
        body: { representation: "storage", value: p.body },
        version: { number: current.version.number + 1, message: "proto-forge sync" },
      }),
    });
    pageId = known.pageId;
    recordLedger("confluence", p.id, { pageId, title: p.title, version: updated.version?.number });
  }

  for (const file of p.attachments) {
    const form = new FormData();
    form.append("file", new Blob([readFileSync(file)]), basename(file));
    form.append("minorEdit", "true");
    // Attachments are still v1; v2 has no upload endpoint.
    await atlassian(auth, `${integration.baseUrl}/wiki/rest/api/content/${pageId}/child/attachment`, {
      method: "PUT",
      headers: { "X-Atlassian-Token": "no-check" },
      body: form,
    });
  }

  write(`  published ${pageId}  ${p.title}`);
}

ok(`sync:confluence: ${pages.length} page(s) published to ${integration.spaceKey}`);
