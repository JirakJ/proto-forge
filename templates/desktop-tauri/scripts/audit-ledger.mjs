import { existsSync, readFileSync } from "node:fs";

// @adr 203 - one ledger, every scanner (BR-37)
//
// src-tauri/audit.toml is the single record of advisories this shell accepts and
// why (shell:verify enforces the `# reason: … until: YYYY-MM-DD` discipline on it).
// The auditing half lives here so it can be proven offline: parsing and
// subtraction are pure, and sec:scan supplies the scanner's report.
//
// The alias problem is the reason this is a function rather than a Set literal:
// one advisory carries different identifiers in different namespaces (glib's
// unsoundness is RUSTSEC-2024-0429 to cargo-audit and GHSA-wrw7-89jp-8q8g to
// osv-scanner). A ledger that only knows one namespace silently stops matching
// the day the scanner changes, so every identifier NAMED IN AN ENTRY — its own
// and any alias its reason cites — accepts that advisory.

const ADVISORY = /\b(RUSTSEC-\d{4}-\d{4}|GHSA-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4})\b/g;

/** id -> the entry's reason line, for every identifier an entry names. */
export function acceptedAdvisories(path) {
  const accepted = new Map();
  if (!existsSync(path)) return accepted;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const entry = /^\s*"([A-Za-z0-9-]+)"\s*,?\s*#\s*(reason:.*)$/.exec(line);
    if (entry === null) continue;
    const reason = entry[2].trim();
    accepted.set(entry[1], reason);
    for (const alias of reason.matchAll(ADVISORY)) accepted.set(alias[1], reason);
  }
  return accepted;
}

/**
 * Splits an osv-scanner JSON report into what the ledger accepts and what it does
 * not. `open` is the failure set; `suppressed` is printed, because a suppression
 * nobody reads is a hole rather than a decision.
 */
export function triageReport(report, accepted) {
  const open = [];
  const suppressed = [];
  for (const result of report.results ?? []) {
    for (const pkg of result.packages ?? []) {
      for (const vuln of pkg.vulnerabilities ?? []) {
        const at = `${pkg.package?.name ?? "?"}@${pkg.package?.version ?? "?"}`;
        const reason = [vuln.id, ...(vuln.aliases ?? [])].map((id) => accepted.get(id)).find((v) => v !== undefined);
        if (reason === undefined) open.push(`${vuln.id} ${at}`);
        else suppressed.push({ what: `${vuln.id} ${at}`, reason });
      }
    }
  }
  return { open, suppressed };
}
