import { loadConfig } from "./config.mjs";
import { atlassian } from "./outbox.mjs";
import { readRecords, writeRecord } from "./external.mjs";
import { storageToMd } from "./storage-to-md.mjs";
import { fail, ok } from "./lib.mjs";

// @adr 009 - pulling a Confluence page produces a record, and a record needs an owner
//   pnpm sync:pull --page <id>                  fetch one page into docs/external/
//   pnpm sync:pull --page <id> --affects a,b    ...declaring the local files it concerns
//
// Reading is not an outward-facing effect, so no --approve — but it still opens a
// socket, so the network guardrail must be open and the host allowlisted, exactly as
// for a live write.
//
// affectedFiles is the one field a machine cannot fill on a pull. On a push it is
// derived — we know which documents built the page. An upstream page's relationship to
// local files is a human judgement, so it is REUSED from an existing record for the
// same page when there is one, and otherwise must be declared with --affects. A pull
// that declared nothing fails AFTER writing the body to disk, so the operator loses no
// work: the record exists, external:verify names it, and one re-run with --affects
// completes it.

const args = process.argv.slice(2);
const flag = (name) => {
  const index = args.indexOf(`--${name}`);
  return index === -1 ? undefined : args[index + 1];
};

const pageId = flag("page");
if (pageId === undefined) fail("sync:pull — name the page: pnpm sync:pull --page <id> [--affects a,b]");

const cfg = loadConfig();
const integration = cfg.integrations?.confluence ?? {};
const rails = cfg.guardrails ?? {};

if (integration.baseUrl === undefined || integration.baseUrl === "") {
  fail("integrations.confluence.baseUrl is not set");
}
if (!rails.network?.allow) {
  fail("network access is disabled by guardrails.network.allow", [
    "Reading still opens a socket. Allow the network and allowlist the host first.",
  ]);
}
const host = new URL(integration.baseUrl).hostname;
const allowed = rails.network.allowedHosts ?? [];
if (allowed.length > 0 && !allowed.some((a) => host === a || host.endsWith(`.${a}`))) {
  fail(`${host} is not on guardrails.network.allowedHosts`, [`allowed: ${allowed.join(", ")}`]);
}

const token = process.env[integration.tokenEnv];
const user = process.env[integration.userEnv];
if (token === undefined || token === "") fail(`${integration.tokenEnv} is not set in the environment`);
if (user === undefined || user === "") fail(`${integration.userEnv} is not set in the environment`);
const auth = `Basic ${Buffer.from(`${user}:${token}`).toString("base64")}`;

const page = await atlassian(
  auth,
  `${integration.baseUrl}/wiki/api/v2/pages/${pageId}?body-format=storage`,
);

// Existing record for this REMOTE id — searched by frontmatter.id across ALL local
// records, because the push side writes under payload names ("architecture"), not
// page-<id>. A match donates its affectedFiles AND its local file name, so a pull
// refreshes the pushed record instead of forking a second one for the same page.
// --affects overrides; no match and no flag means the record is written but the run
// fails, telling the operator exactly what to declare.
const previous = readRecords("confluence").find((r) => String(r.frontmatter.id) === String(pageId));
const localId = previous?.id ?? `page-${pageId}`;
const declared = flag("affects")?.split(",").map((s) => s.trim()).filter((s) => s !== "");
const affectedFiles = declared ?? previous?.frontmatter.affectedFiles ?? [];

const path = writeRecord(
  "confluence",
  localId,
  {
    source: "confluence",
    id: String(page.id),
    url: `${integration.baseUrl}/wiki${page._links?.webui ?? `/pages/${page.id}`}`,
    title: page.title,
    remoteVersion: page.version?.number,
    remoteUpdatedAt: page.version?.createdAt ?? new Date().toISOString(),
    syncedAt: new Date().toISOString(),
    direction: "pull",
    affectedFiles,
  },
  storageToMd(page.body?.storage?.value ?? ""),
);

if (affectedFiles.length === 0) {
  fail(`sync:pull — ${path} written, but it declares no affected files`, [
    "An upstream page's relationship to local files is a human judgement, and an empty",
    "list would assert the page concerns nothing here. Re-run with:",
    `  pnpm sync:pull --page ${pageId} --affects <file>[,<file>...]`,
  ]);
}

ok(`sync:pull: ${path} — "${page.title}" v${page.version?.number}, affects ${affectedFiles.length} file(s)`);
