import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { ok, note } from "./lib.mjs";

// BRS §4/§16: secret scan (gitleaks) + dependency audit (osv-scanner over the
// LOCKED dependency graph — src/App/packages.lock.json, the same pinned
// resolution CI restores with --locked-mode; the deterministic CycloneDX SBOM
// the sbom step derives from it is the attested artefact, not the audit input,
// because every scanner build understands a lockfile while SBOM ingestion is
// version-dependent). Hard-stop gates — never auto-suppress. Both are external
// binaries; absent locally we warn (CI enforces both, with pinned installs),
// matching the gitleaks precedent recorded in the register's §19.
//
// Exit codes are read, not collapsed: for each tool, "found findings" (exit 1)
// and "could not run" (any other non-zero) are DIFFERENT failures — a scanner
// that could not complete is not a clean scan and is not a finding either.
const has = (cmd) => spawnSync("sh", ["-c", `command -v ${cmd}`], { stdio: "ignore" }).status === 0;

let failed = false;

if (has("gitleaks")) {
  // --no-git scans working files, so this works in and out of a git checkout.
  // Without a committed .gitleaks.toml the scan runs on gitleaks' built-in
  // config — stricter, not weaker: the project file only ADDS allowlists.
  const config = existsSync(".gitleaks.toml") ? ["-c", ".gitleaks.toml"] : [];
  const scan = spawnSync("gitleaks", ["detect", "--no-git", "--no-banner", "--redact", ...config], { stdio: "inherit" });
  if (scan.status === 1) {
    process.stderr.write("✗ gitleaks found secrets\n");
    failed = true;
  } else if (scan.status !== 0) {
    process.stderr.write(`✗ gitleaks could not complete the secret scan (exit ${scan.status}) — an unfinished scan is not a clean one\n`);
    failed = true;
  }
} else if (process.env.CI) {
  process.stderr.write("✗ gitleaks not installed in CI — the secret scan is mandatory (BRS §4 hard-stop)\n");
  failed = true;
} else {
  note("gitleaks not installed — skipping secret scan locally (CI enforces; install to enforce here)");
}

// The audit half: osv-scanner reads the locked NuGet graph directly — the
// shipped attack surface, resolved exactly as CI restores it (NFR-11).
if (has("osv-scanner")) {
  const audit = spawnSync("osv-scanner", ["scan", "--lockfile", "src/App/packages.lock.json"], { stdio: "inherit" });
  if (audit.status === 1) {
    process.stderr.write("✗ osv-scanner found known vulnerabilities in the locked dependency graph\n");
    failed = true;
  } else if (audit.status !== 0) {
    process.stderr.write(`✗ osv-scanner could not complete the audit (exit ${audit.status}) — the dependency audit did NOT run, which is not the same as a clean one\n`);
    failed = true;
  }
} else if (process.env.CI) {
  process.stderr.write("✗ osv-scanner not installed in CI — the dependency audit is mandatory (BRS §16 hard-stop)\n");
  failed = true;
} else {
  note("osv-scanner not installed — skipping dependency audit locally (CI enforces; install to enforce here)");
}

if (failed) process.exit(1);
ok("sec-scan: no secrets, no known-vulnerable locked dependencies");
