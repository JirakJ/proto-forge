import { execSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { ok, note } from "./lib.mjs";

// BRS §4/§16: secret scan (gitleaks) + dependency audit (osv-scanner over the
// locked dependency graph). Hard-stop gates — never auto-suppress. Both are
// external binaries; absent locally we warn (CI enforces both, with pinned
// installs), matching the gitleaks precedent recorded in the register's §19.
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
    // Without a committed .gitleaks.toml the scan runs on gitleaks' built-in
    // config — stricter, not weaker: the project file only ADDS allowlists.
    const config = existsSync(".gitleaks.toml") ? " -c .gitleaks.toml" : "";
    execSync(`gitleaks detect --no-git --no-banner --redact${config}`, { stdio: "inherit" });
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

// The audit half reads `gradle.lockfile` — every locked coordinate, test and tool
// classpaths included, because a scanner reads the file whether or not we call that
// surface "shipped". It is also the input EVERY osv-scanner build understands:
// SBOM auto-detection is version-dependent (2.0.2 answered "could not determine
// extractor suitable to this file" and the gate reported it as a finding), and a
// gate that only works on the scanner version you happen to have is not a gate.
//
// Exit codes are read, not lumped together: 1 means vulnerabilities, anything else
// means the audit did not run. Both fail — with the message that is true.
if (has("osv-scanner")) {
  const audit = spawnSync("osv-scanner", ["scan", "--lockfile", "gradle.lockfile"], { stdio: "inherit" });
  if (audit.status === 1) {
    process.stderr.write("✗ osv-scanner found known vulnerabilities in the locked dependency graph\n");
    failed = true;
  } else if (audit.status !== 0) {
    process.stderr.write(
      `✗ osv-scanner could not complete the audit (exit ${String(audit.status)}) — the dependency ` +
        "audit did NOT run, which is not the same as a clean one\n",
    );
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
