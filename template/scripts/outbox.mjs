import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadConfig } from "./config.mjs";
import { fail, note } from "./lib.mjs";

// @adr 009 - integrations stage their effects before they cause them
// Nothing in the pipeline calls JIRA or Confluence. Phases write a payload here;
// an operator reviews it and runs `pnpm sync:* --commit` to send it. That split is
// the whole design: generating a prototype should never, as a side effect, create
// tickets in a real project or overwrite a page someone is reading.
//
// The outbox is also the dry-run output, so "what would this send?" and "what did
// it send?" are the same artefact, diffable in review.

export const OUTBOX = ".proto-forge/outbox";

export function writeOutbox(kind, id, payload) {
  mkdirSync(OUTBOX, { recursive: true });
  const path = join(OUTBOX, `${kind}-${id}.json`);
  writeFileSync(path, `${JSON.stringify(payload, null, 2)}\n`);
  return path;
}

export function readOutbox(kind) {
  if (!existsSync(OUTBOX)) return [];
  return readdirSync(OUTBOX)
    .filter((f) => f.startsWith(`${kind}-`) && f.endsWith(".json"))
    .sort()
    .map((f) => ({ file: join(OUTBOX, f), payload: JSON.parse(readFileSync(join(OUTBOX, f), "utf8")) }));
}

const LEDGER = ".proto-forge/integrations.json";

export const readLedger = () => (existsSync(LEDGER) ? JSON.parse(readFileSync(LEDGER, "utf8")) : {});

export function recordLedger(kind, key, value) {
  const ledger = readLedger();
  ledger[kind] = { ...(ledger[kind] ?? {}), [key]: value };
  writeFileSync(LEDGER, `${JSON.stringify(ledger, null, 2)}\n`);
}

/**
 * Everything that must be true before a live write. Ordered cheapest-first, and
 * each failure says what to change — a guardrail that only says "denied" gets
 * disabled wholesale rather than adjusted.
 */
export function assertMayCommit(name, action) {
  const cfg = loadConfig();
  const integration = cfg.integrations?.[name] ?? {};
  const rails = cfg.guardrails ?? {};

  if (!integration.enabled) {
    fail(`${name} is disabled`, [`Set integrations.${name}.enabled = true in .proto-forge/config.json first.`]);
  }
  if (integration.dryRun) {
    fail(`${name} is in dry-run`, [
      `Payloads were written to ${OUTBOX}/ and nothing was sent.`,
      `Review them, then set integrations.${name}.dryRun = false to allow live writes.`,
    ]);
  }
  if (integration.baseUrl === undefined || integration.baseUrl === "") {
    fail(`integrations.${name}.baseUrl is not set`);
  }

  const host = new URL(integration.baseUrl).hostname;
  if (!rails.network?.allow) {
    fail("network access is disabled by guardrails.network.allow", [
      `Set guardrails.network = { "allow": true, "allowedHosts": ["${host}"] } to permit exactly this host.`,
    ]);
  }
  const allowed = rails.network.allowedHosts ?? [];
  if (allowed.length > 0 && !allowed.some((a) => host === a || host.endsWith(`.${a}`))) {
    fail(`${host} is not on guardrails.network.allowedHosts`, [`allowed: ${allowed.join(", ")}`]);
  }

  if ((rails.requireApproval ?? []).includes(action) && !process.argv.includes("--approve")) {
    fail(`"${action}" requires explicit approval`, [
      "This writes to a system other people use. Re-run with --approve once you have confirmed the payloads,",
      `or remove "${action}" from guardrails.requireApproval.`,
    ]);
  }

  const token = process.env[integration.tokenEnv];
  const user = process.env[integration.userEnv];
  if (token === undefined || token === "") fail(`${integration.tokenEnv} is not set in the environment`);
  if (user === undefined || user === "") fail(`${integration.userEnv} is not set in the environment`);

  return { integration, auth: `Basic ${Buffer.from(`${user}:${token}`).toString("base64")}` };
}

/** Uniform failure reporting for the Atlassian REST calls. */
export async function atlassian(auth, url, init = {}) {
  const res = await fetch(url, {
    ...init,
    headers: { Authorization: auth, Accept: "application/json", ...(init.headers ?? {}) },
  });
  if (!res.ok) {
    const body = await res.text();
    fail(`${init.method ?? "GET"} ${url} → ${res.status}`, [body.slice(0, 500)]);
  }
  return res.status === 204 ? null : res.json();
}

export function summarise(kind, entries) {
  if (entries.length === 0) {
    note(`${kind}: nothing staged in ${OUTBOX}/`);
    return;
  }
  process.stdout.write(`${entries.length} ${kind} payload(s) staged in ${OUTBOX}/:\n`);
}
