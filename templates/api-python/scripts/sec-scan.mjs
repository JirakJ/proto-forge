import { execSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ok, note } from "./lib.mjs";

// BRS §4/§16: secret scan (gitleaks) + dependency audit (pip-audit over the
// locked production set). Hard-stop gates — never auto-suppress. gitleaks is an
// external binary; if absent we warn (CI enforces). The SAST half of §16 is
// ruff's flake8-bandit (S) rules, running inside `lint`.
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

// The audit covers the SHIPPED attack surface: uv exports the locked production
// set (no dev group, no local project) and pip-audit checks it against the
// advisory databases. Dev-tooling advisories are triaged separately.
if (has("uv")) {
  const dir = mkdtempSync(join(tmpdir(), "proto-forge-audit-"));
  const requirements = join(dir, "requirements.txt");
  try {
    execSync(`uv export --frozen --no-dev --no-emit-project --format requirements-txt -o ${requirements}`, {
      stdio: ["ignore", "ignore", "inherit"],
    });
    execSync(`uv run pip-audit --strict --disable-pip --no-deps -r ${requirements}`, { stdio: "inherit" });
  } catch {
    process.stderr.write("✗ pip-audit found advisories (or could not audit) the locked production deps\n");
    failed = true;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
} else if (process.env.CI) {
  process.stderr.write("✗ uv not installed in CI — the dependency audit is mandatory (BRS §4 hard-stop)\n");
  failed = true;
} else {
  note("uv not installed — skipping dependency audit locally (CI enforces)");
}

if (failed) process.exit(1);
ok("sec-scan: no secrets, no known advisories in the locked production deps");
