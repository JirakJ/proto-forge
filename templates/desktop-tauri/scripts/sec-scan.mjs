import { execSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { acceptedAdvisories, triageReport } from "./audit-ledger.mjs";
import { ok, note } from "./lib.mjs";

// BR §4: secret scan (gitleaks) + dependency audit over BOTH graphs — npm's and
// the shell's Cargo.lock, which pnpm audit cannot see. Hard-stop gates — never
// auto-suppress. External binaries; if absent we warn (CI enforces).
const has = (cmd) => {
  try {
    execSync(`command -v ${cmd}`, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
};

let failed = false;

if (has("gitleaks")) {
  try {
    // --no-git scans working files, so this works in and out of a git checkout.
    execSync("gitleaks detect --no-git --no-banner --redact -c .gitleaks.toml", { stdio: "inherit" });
  } catch {
    process.stderr.write("✗ gitleaks found secrets\n");
    failed = true;
  }
} else if (process.env.CI) {
  process.stderr.write("✗ gitleaks not installed in CI — the secret scan is mandatory (BRS §4 hard-stop)\n");
  failed = true;
} else {
  note("gitleaks not installed — skipping secret scan locally (CI enforces; install to enforce here)");
}

try {
  // --prod: the shipped attack surface. Dev-tooling advisories don't reach users
  // and are triaged separately (run `pnpm audit --dev` to see them).
  execSync("pnpm audit --prod --audit-level=high", { stdio: "inherit" });
} catch {
  process.stderr.write("✗ pnpm audit found high/critical advisories in production deps\n");
  failed = true;
}

// The Rust half. `pnpm audit` cannot see Cargo.lock, so without this the shell's
// entire dependency graph — the half with machine access — would go unaudited
// while src-tauri/audit.toml sat there looking like triage. The ledger is the
// SINGLE source of accepted advisories (BR-15, BR-37): read it, subtract it from
// what the scanner reports, fail on the rest, and PRINT every suppression with
// its reason and expiry, because a suppression nobody reads is a hole.
const LEDGER = "src-tauri/audit.toml";
const CARGO_LOCK = "src-tauri/Cargo.lock";

if (existsSync(CARGO_LOCK)) {
  if (has("osv-scanner")) {
    const scan = spawnSync("osv-scanner", ["scan", "--lockfile", CARGO_LOCK, "--format", "json"], {
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
    });
    if (scan.status !== 0 && scan.status !== 1) {
      process.stderr.write(
        `✗ osv-scanner could not audit ${CARGO_LOCK} (exit ${String(scan.status)}) — the audit did NOT run\n`,
      );
      failed = true;
    } else {
      const { open, suppressed } = triageReport(
        JSON.parse(scan.stdout || '{"results":[]}'),
        acceptedAdvisories(LEDGER),
      );
      for (const { what, reason } of suppressed) process.stdout.write(`  accepted: ${what} — ${reason}\n`);
      if (open.length > 0) {
        process.stderr.write(
          `✗ ${open.length} advisory/advisories in ${CARGO_LOCK} are on no ledger entry: ${open.join(", ")}\n` +
            `    Either upgrade, or add a dated "# reason: … until: YYYY-MM-DD" entry to ${LEDGER} (BR-37).\n`,
        );
        failed = true;
      }
    }
  } else if (process.env.CI) {
    process.stderr.write("✗ osv-scanner not installed in CI — the Rust dependency audit is mandatory (BRS §16)\n");
    failed = true;
  } else {
    note("osv-scanner not installed — skipping the Rust dependency audit locally (CI enforces)");
  }
}

if (failed) process.exit(1);
ok("sec-scan: no secrets, no high/critical advisories, the Rust graph audited against its ledger");
