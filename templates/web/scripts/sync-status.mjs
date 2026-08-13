import { loadConfig } from "./config.mjs";
import { atlassian } from "./outbox.mjs";
import { readRecords } from "./external.mjs";
import { fail, note, ok } from "./lib.mjs";

// @adr 009 - which external objects moved past us, and which files that touches
//   pnpm sync:status                  report per record: up to date | changed upstream
//   pnpm sync:status --fail-on-drift  ...and exit non-zero if anything drifted
//
// The report is the point: not "page 123 changed" but "page 123 changed, and these are
// the local files that change affects" — straight from the record's affectedFiles.
// Read-only, but a socket is a socket: the network guardrail applies.

const failOnDrift = process.argv.includes("--fail-on-drift");
const cfg = loadConfig();
const rails = cfg.guardrails ?? {};
const write = (s) => process.stdout.write(`${s}\n`);

const all = [
  ...readRecords("confluence").map((r) => ({ ...r, source: "confluence" })),
  ...readRecords("jira").map((r) => ({ ...r, source: "jira" })),
];
if (all.length === 0) {
  note("sync:status — no external records in docs/external/; nothing to compare");
  process.exit(0);
}

if (!rails.network?.allow) {
  fail("network access is disabled by guardrails.network.allow", [
    "Comparing against the remote opens a socket. Allow the network and allowlist the hosts first.",
  ]);
}

function credentials(source) {
  const integration = cfg.integrations?.[source] ?? {};
  const token = process.env[integration.tokenEnv];
  const user = process.env[integration.userEnv];
  if (integration.baseUrl === undefined || integration.baseUrl === "") {
    return { error: `integrations.${source}.baseUrl is not set` };
  }
  if (token === undefined || token === "" || user === undefined || user === "") {
    return { error: `${integration.tokenEnv} / ${integration.userEnv} not set in the environment` };
  }
  return { integration, auth: `Basic ${Buffer.from(`${user}:${token}`).toString("base64")}` };
}

/** The remote's current revision, normalised to { version, updatedAt } or { missing }. */
async function fetchRemote(source, record, creds) {
  if (source === "confluence") {
    const page = await atlassian(creds.auth, `${creds.integration.baseUrl}/wiki/api/v2/pages/${record.frontmatter.id}`).catch(() => null);
    if (page === null) return { missing: true };
    return { version: page.version?.number, updatedAt: page.version?.createdAt };
  }
  const issue = await atlassian(
    creds.auth,
    `${creds.integration.baseUrl}/rest/api/2/issue/${record.frontmatter.id}?fields=updated`,
  ).catch(() => null);
  if (issue === null) return { missing: true };
  return { version: undefined, updatedAt: issue.fields?.updated };
}

let drifted = 0;
for (const record of all) {
  const label = `${record.source}/${record.id}`;
  const creds = credentials(record.source);
  if (creds.error !== undefined) {
    note(`${label}: cannot compare — ${creds.error}`);
    continue;
  }

  const remote = await fetchRemote(record.source, record, creds);
  if (remote.missing) {
    drifted += 1;
    write(`✗ ${label}: MISSING upstream (was "${record.frontmatter.title}")`);
    continue;
  }

  const versionMoved =
    record.frontmatter.remoteVersion !== undefined && remote.version !== undefined
      ? remote.version > record.frontmatter.remoteVersion
      : false;
  const timeMoved =
    remote.updatedAt !== undefined && new Date(remote.updatedAt) > new Date(record.frontmatter.remoteUpdatedAt);

  if (!versionMoved && !timeMoved) {
    write(`✓ ${label}: up to date (${record.frontmatter.url})`);
    continue;
  }

  drifted += 1;
  const movement =
    remote.version !== undefined
      ? `local v${record.frontmatter.remoteVersion} → remote v${remote.version}`
      : `updated ${remote.updatedAt}`;
  write(`✗ ${label}: changed upstream (${movement})`);
  for (const file of record.frontmatter.affectedFiles ?? []) write(`    affects ${file}`);
}

if (drifted > 0 && failOnDrift) fail(`sync:status — ${drifted} record(s) drifted`);
ok(`sync:status: ${all.length} record(s), ${drifted} drifted`);
