import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { ok, note } from "./lib.mjs";

// BRS §4/§16: secret scan (gitleaks) + dependency audit (osv-scanner over the
// CycloneDX SBOM built from gradle.lockfile). Hard-stop gates — never
// auto-suppress. Both are external binaries; absent locally we warn (CI enforces
// both, with pinned installs), matching the gitleaks precedent recorded in the
// register's §19.
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

// The audit half: osv-scanner reads the deterministic SBOM the sbom step just
// wrote from gradle.lockfile — the shipped attack surface, not the dev tooling.
if (has("osv-scanner")) {
  try {
    execSync("osv-scanner scan --lockfile .proto-forge/sbom.cdx.json", { stdio: "inherit" });
  } catch {
    process.stderr.write("✗ osv-scanner found known vulnerabilities in the locked dependency graph\n");
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
