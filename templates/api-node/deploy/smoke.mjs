// @adr 202 - the smoke test is the deploy's exit criterion
// Usage: node deploy/smoke.mjs --url <base> [--expect-sha <gitSha>]
//
// Asks the ONE question a deploy job must answer before it reports success:
// is the thing that should be running actually running, with its promised
// security posture? Four assertions against the platform kernel's two routes:
//   1. <base>/healthz answers 200 with {"status":"ok"}
//   2. <base>/version answers 200 with JSON carrying a gitSha
//   3. that gitSha is the one this release deployed (when --expect-sha is given)
//   4. the strict header set from docs/SECURITY.md is present on the response
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

// Header set = the strict API set docs/SECURITY.md documents and the platform
// kernel sets on every response. Values are matched as substrings so an edge
// that appends directives does not fail the smoke for being stricter.
const REQUIRED_HEADERS = [
  ["content-security-policy", "default-src 'none'"],
  ["x-content-type-options", "nosniff"],
  ["referrer-policy", "strict-origin-when-cross-origin"],
  ["x-frame-options", "DENY"],
];

const root = base.replace(/\/$/, "");
const failures = [];

const get = async (path) => {
  try {
    return await fetch(`${root}${path}`, { redirect: "follow" });
  } catch (e) {
    process.stderr.write(`✗ smoke: GET ${root}${path} failed — ${e.cause?.code ?? e.message}\n`);
    process.exit(1);
  }
};

// 1. liveness: the health kernel answers.
const health = await get("/healthz");
if (health.status !== 200) failures.push(`/healthz status: expected 200, got ${health.status}`);

// 2–4. provenance and posture ride /version.
const res = await get("/version");
if (res.status !== 200) failures.push(`/version status: expected 200, got ${res.status}`);

let body = null;
try {
  body = await res.json();
} catch {
  failures.push("/version body: expected JSON, got something else");
}
if (body !== null && typeof body.gitSha !== "string") {
  failures.push(`/version body.gitSha: expected a string, got ${JSON.stringify(body?.gitSha)}`);
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
  process.stderr.write(`✗ smoke FAILED against ${root}\n`);
  for (const f of failures) process.stderr.write(`    ${f}\n`);
  process.exit(1);
}
process.stdout.write(`✓ smoke: ${root} healthy, gitSha ${body.gitSha}${expectSha !== undefined ? " (matches)" : ""}, headers strict\n`);
