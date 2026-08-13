// @adr 202 - the smoke test is the deploy's exit criterion
// Usage: node deploy/smoke.mjs --url <base> [--expect-sha <gitSha>]
//
// Asks the ONE question a deploy job must answer before it reports success:
// is the thing that should be running actually running, with its promised
// security posture? Three assertions against <base>/version.json:
//   1. it answers 200 with JSON carrying a gitSha
//   2. that gitSha is the one this release deployed (when --expect-sha is given)
//   3. the strict header set from docs/SECURITY.md is present on the response
// Self-contained on purpose — CI and an operator's laptop run it byte-identical,
// with nothing to install. Exits 1 with an expected/actual diff, never a stack.

const args = process.argv.slice(2);
const argOf = (flag) => {
  const i = args.indexOf(flag);
  return i === -1 ? undefined : args[i + 1];
};

const base = argOf("--url");
const expectSha = argOf("--expect-sha");
if (base === undefined || base === "") {
  process.stderr.write("usage: node deploy/smoke.mjs --url <base> [--expect-sha <gitSha>]\n");
  process.exit(1);
}

// Header set = the strict production set docs/SECURITY.md documents and
// deploy/nginx/default.conf ships. Values are matched as substrings so an edge
// that appends directives does not fail the smoke for being stricter.
const REQUIRED_HEADERS = [
  ["content-security-policy", "default-src 'self'"],
  ["x-content-type-options", "nosniff"],
  ["referrer-policy", "strict-origin-when-cross-origin"],
  ["x-frame-options", "DENY"],
];

const url = `${base.replace(/\/$/, "")}/version.json`;
const failures = [];

let res;
try {
  res = await fetch(url, { redirect: "follow" });
} catch (e) {
  process.stderr.write(`✗ smoke: GET ${url} failed — ${e.cause?.code ?? e.message}\n`);
  process.exit(1);
}

if (res.status !== 200) failures.push(`status: expected 200, got ${res.status}`);

let body = null;
try {
  body = await res.json();
} catch {
  failures.push("body: expected JSON, got something else");
}
if (body !== null && typeof body.gitSha !== "string") {
  failures.push(`body.gitSha: expected a string, got ${JSON.stringify(body?.gitSha)}`);
}
if (expectSha !== undefined && body !== null && body.gitSha !== expectSha) {
  failures.push(`gitSha: expected ${expectSha}, got ${body.gitSha} — the old release is still answering`);
}

for (const [name, needle] of REQUIRED_HEADERS) {
  const actual = res.headers.get(name);
  if (actual === null) failures.push(`header ${name}: expected to contain "${needle}", got (absent)`);
  else if (!actual.includes(needle)) failures.push(`header ${name}: expected to contain "${needle}", got "${actual}"`);
}

if (failures.length > 0) {
  process.stderr.write(`✗ smoke FAILED against ${url}\n`);
  for (const f of failures) process.stderr.write(`    ${f}\n`);
  process.exit(1);
}
process.stdout.write(`✓ smoke: ${url} answers 200, gitSha ${body.gitSha}${expectSha !== undefined ? " (matches)" : ""}, headers strict\n`);
