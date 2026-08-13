import { mkdtempSync, rmSync, cpSync, appendFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fail, note, ok } from "./lib.mjs";

// @adr 009 - Tier 2 of the gate selftests (BRS §18/§19): the NATIVE gates fire.
//
// Tier 1 (gates-selftest.mjs) proves every .mjs gate rejects what it claims to
// reject, in fixture directories, in seconds, with no python environment. What
// it cannot prove is that the NATIVE toolchain half actually bites: that
// import-linter fails an illegal import, that the pytest coverage floor fails
// an untested branch, and that `alembic check` fails a model the migrations do
// not produce. This tier builds REAL throwaway uv projects — copies of this
// template resolved from the committed lock — breaks exactly one thing in
// each, and asserts the native exit code. CI-only by design: it needs uv (and
// Docker for the alembic case), which the Tier-1 fixtures deliberately do
// without. Locally it runs wherever the tools exist and says so where they
// do not; in CI a missing tool is a hard failure, never a silent skip.

const results = [];
const has = (cmd) => spawnSync(cmd, ["--version"], { stdio: "ignore" }).status === 0;

if (!has("uv")) {
  if (process.env.CI) fail("gates:selftest:native — uv is not installed; the native tier is mandatory in CI");
  note("gates:selftest:native SKIPPED — uv is not installed (CI enforces)");
  process.exit(0);
}

const TEMPLATE = process.cwd();
const COPIED = ["pyproject.toml", "uv.lock", ".python-version", "alembic.ini", "src", "alembic", "importlinter", "tests"];

function throwawayProject() {
  const dir = mkdtempSync(join(tmpdir(), "proto-forge-native-"));
  for (const entry of COPIED) {
    cpSync(join(TEMPLATE, entry), join(dir, entry), {
      recursive: true,
      filter: (src) => !/__pycache__|\.venv|mutants/.test(src),
    });
  }
  return dir;
}

function uvRun(dir, args, env = {}) {
  const r = spawnSync("uv", ["run", "--frozen", ...args], {
    cwd: dir,
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
}

function expectNative(name, { code, out }, { pass, matching }) {
  const passed = code === 0;
  if (passed !== pass) {
    results.push(`${name}: expected ${pass ? "PASS" : "FAIL"}, got ${passed ? "PASS" : "FAIL"} — ${out.trim().slice(-600)}`);
  } else if (matching !== undefined && !matching.test(out)) {
    results.push(`${name}: correct verdict but the output never mentions ${matching}`);
  }
}

// --- native: import-linter ------------------------------------------------------
{
  const dir = throwawayProject();
  try {
    expectNative(
      "native: the shipped tree keeps every import-linter contract",
      uvRun(dir, ["lint-imports", "--config", "importlinter/layered.toml"]),
      { pass: true, matching: /Contracts: \d+ kept, 0 broken/ },
    );
    appendFileSync(join(dir, "src", "app", "domain", "note", "model.py"), "\nimport fastapi  # an illegal framework import\n");
    expectNative(
      "native: import-linter fires on a framework import in the domain",
      uvRun(dir, ["lint-imports", "--config", "importlinter/layered.toml"]),
      { pass: false, matching: /broken/i },
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// --- native: the pytest coverage floor -------------------------------------------
{
  const dir = throwawayProject();
  try {
    appendFileSync(
      join(dir, "src", "app", "application", "validation.py"),
      '\n\ndef untested_branch(flag: bool) -> str:\n    if flag:\n        return "a"\n    return "b"\n',
    );
    expectNative(
      "native: the pytest coverage floor fires on an untested branch",
      uvRun(dir, ["pytest", "tests/unit", "-q", "--cov", "--cov-report=term"]),
      { pass: false, matching: /Required test coverage of 100.0% not reached|FAIL Required test coverage/ },
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// --- native: alembic check against a real Postgres --------------------------------
// The schema-level half of BR-24: after `alembic upgrade head`, autogenerate must
// find NOTHING; a model column the migrations do not produce must make
// `alembic check` exit non-zero. Needs a real database, hence Docker.
const dockerReady = has("docker") && spawnSync("docker", ["info"], { stdio: "ignore" }).status === 0;
if (!dockerReady) {
  if (process.env.CI) {
    results.push("native: docker is not available in CI — the alembic check tier is mandatory there (BRS §15/§19)");
  } else {
    note("native: alembic-check case SKIPPED — no Docker daemon for Postgres (CI enforces)");
  }
} else {
  const container = spawnSync(
    "docker",
    ["run", "-d", "--rm", "-e", "POSTGRES_PASSWORD=selftest", "-e", "POSTGRES_DB=notes", "-p", "127.0.0.1:0:5432", "postgres:16.6-alpine"],
    { encoding: "utf8" },
  ).stdout.trim();
  const dir = throwawayProject();
  try {
    const portOut = spawnSync("docker", ["port", container, "5432/tcp"], { encoding: "utf8" }).stdout;
    const port = /:(\d+)\s*$/m.exec(portOut)?.[1];
    const env = { DATABASE_URL: `postgresql+psycopg://postgres:selftest@127.0.0.1:${port}/notes` };
    // Wait for the engine to accept connections (up to ~30s).
    let up = false;
    for (let i = 0; i < 60 && !up; i += 1) {
      up = spawnSync("docker", ["exec", container, "pg_isready", "-U", "postgres"], { stdio: "ignore" }).status === 0;
      if (!up) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 500);
    }
    if (!up) {
      results.push("native: the throwaway Postgres never became ready");
    } else {
      expectNative("native: alembic upgrade head applies the committed history", uvRun(dir, ["alembic", "upgrade", "head"], env), { pass: true });
      expectNative("native: alembic check is clean when model and migrations agree", uvRun(dir, ["alembic", "check"], env), {
        pass: true,
        matching: /No new upgrade operations detected/i,
      });
      appendFileSync(
        join(dir, "src", "app", "adapters", "outbound", "persistence", "db.py"),
        '\n    ghost: Mapped[str] = mapped_column(Text, nullable=True)  # a column no migration produces\n',
      );
      expectNative("native: alembic check fires on a model the migrations do not produce", uvRun(dir, ["alembic", "check"], env), {
        pass: false,
        matching: /New upgrade operations detected|upgrade/i,
      });
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
    spawnSync("docker", ["rm", "-f", container], { stdio: "ignore" });
  }
}

if (results.length) fail(`gates:selftest:native FAILED (${results.length})`, results);
ok("gates:selftest:native: the native toolchain gates (import-linter, coverage floor, alembic check) fire");
