import { execSync } from "node:child_process";
import { ok, note } from "./lib.mjs";

// BR §4: secret scan (gitleaks) + dependency audit. Hard-stop gates — never
// auto-suppress. gitleaks is an external binary; if absent we warn (CI enforces).
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

if (failed) process.exit(1);
ok("sec-scan: no secrets, no high/critical advisories");
