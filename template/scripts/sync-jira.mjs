import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { loadConfig, activeWaivers } from "./config.mjs";
import { assertMayCommit, atlassian, readLedger, recordLedger, writeOutbox } from "./outbox.mjs";
import { read, walk, ok, note } from "./lib.mjs";

// @adr 009 - JIRA tickets are staged, reviewed, then created by an operator
//   pnpm sync:jira             stage payloads and print what would be created
//   pnpm sync:jira --commit    create them (needs enabled + dryRun:false + network
//                              allowlist + --approve, and credentials from env)
// No pipeline phase calls this. Generating a prototype must not, as a side effect,
// file tickets in a project other people are working in.

const commit = process.argv.includes("--commit");
const cfg = loadConfig();
const jira = cfg.integrations?.jira ?? {};

if (!jira.enabled) {
  note("jira: disabled (integrations.jira.enabled = false) — nothing staged");
  process.exit(0);
}

const createFor = jira.createFor ?? [];
const ledger = readLedger().jira ?? {};
const staged = [];

// --- what deserves a ticket --------------------------------------------------
if (createFor.includes("adr")) {
  for (const path of walk("docs/adr", (p) => p.endsWith(".md")).sort()) {
    const body = read(path);
    if (!/- Status:\s*accepted/i.test(body)) continue;
    const number = path.match(/\/(\d+)-/)?.[1];
    const title = body.match(/# ADR \d+:\s*(.+)/)?.[1] ?? path;
    const id = `adr-${number}`;
    if (ledger[id] !== undefined) continue; // already filed; never file twice

    // Context + Decision only. Consequences and Alternatives are the record, and
    // pasting a whole ADR into a ticket description helps nobody read either.
    const section = (name) => body.match(new RegExp(`## ${name}\\n\\n([\\s\\S]*?)(?=\\n## |$)`))?.[1]?.trim() ?? "";
    staged.push({
      id,
      fields: {
        project: { key: jira.projectKey },
        issuetype: { name: jira.issueType ?? "Task" },
        summary: `ADR ${number}: ${title}`,
        description: [`*Context*`, section("Context"), "", `*Decision*`, section("Decision"), "", `Source: ${path}`].join("\n"),
      },
      source: path,
    });
  }
}

if (createFor.includes("blocked-gate") && existsSync(".proto-forge/snapshot.json")) {
  const snapshot = JSON.parse(read(".proto-forge/snapshot.json"));
  for (const gate of (snapshot.gates ?? []).filter((g) => g?.result === "blocked")) {
    const id = `blocked-${gate.name}`;
    if (ledger[id] !== undefined) continue;
    staged.push({
      id,
      fields: {
        project: { key: jira.projectKey },
        issuetype: { name: jira.issueType ?? "Task" },
        summary: `Blocked gate: ${gate.name}`,
        description: `The run halted on ${gate.name}. Last prompt-log entry: ${gate.promptLog ?? "unknown"}.`,
      },
      source: ".proto-forge/snapshot.json",
    });
  }
}

if (createFor.includes("waiver")) {
  for (const w of activeWaivers(cfg)) {
    const id = `waiver-${w.gate}`;
    if (ledger[id] !== undefined) continue;
    staged.push({
      id,
      fields: {
        project: { key: jira.projectKey },
        issuetype: { name: jira.issueType ?? "Task" },
        summary: `Remove the ${w.gate} waiver before ${w.expires}`,
        description: `${w.reason}\n\nRecorded in ADR ${w.adr}. The gate returns to "error" on ${w.expires}.`,
      },
      source: ".proto-forge/config.json",
    });
  }
}

for (const item of staged) writeOutbox("jira", item.id, item);

// --- report ------------------------------------------------------------------
const write = (s) => process.stdout.write(`${s}\n`);
if (staged.length === 0) {
  ok(`sync:jira: nothing new to file (${Object.keys(ledger).length} already tracked)`);
  process.exit(0);
}

write(`${staged.length} ticket(s) staged in .proto-forge/outbox/:`);
for (const item of staged) write(`  ${item.id.padEnd(18)} ${item.fields.summary}`);

if (!commit) {
  write("");
  write("Nothing was sent. Review the payloads, then: pnpm sync:jira --commit --approve");
  process.exit(0);
}

// --- live ---------------------------------------------------------------------
const { integration, auth } = assertMayCommit("jira", "jira.create");
const created = [];

for (const item of staged) {
  const result = await atlassian(auth, `${integration.baseUrl}/rest/api/2/issue`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fields: item.fields }),
  });
  recordLedger("jira", item.id, { key: result.key, summary: item.fields.summary });
  created.push({ ...item, key: result.key });

  // Write the key back where a reader of the decision will look for it.
  if (item.source.endsWith(".md") && existsSync(item.source)) {
    const body = readFileSync(item.source, "utf8");
    if (!/^- JIRA:/m.test(body)) {
      writeFileSync(item.source, body.replace(/^(- Status:.*)$/m, `$1\n- JIRA: ${result.key}`));
    }
  }
}

for (const c of created) write(`  created ${c.key}  ${c.fields.summary}`);
ok(`sync:jira: ${created.length} issue(s) created in ${integration.projectKey}`);
