import { execSync, spawnSync } from "node:child_process";
import { copyFileSync, existsSync } from "node:fs";
import { loadConfig } from "./config.mjs";
import { fail, note, ok } from "./lib.mjs";

// @adr 201 - the local environment is the same image, one host, zero doors
//   pnpm env:local init     write .env from .env.example (never overwrites)
//   pnpm env:local up       docker compose up --build --wait, then print the urls
//   pnpm env:local down     stop and remove the stack
//   pnpm env:local status   what compose believes is running
//   pnpm env:local seed     apply the schema migrations to the compose database
//
// `local` is a developer convenience, never part of promotion (ENV_ORDER), so
// there are no approval doors and no network guardrail: nothing here leaves
// the machine. What it shares with the chain is the artefact — the same
// Dockerfile, the same read-only-root constraints, the same /version answer.

const COMPOSE = "deploy/compose/docker-compose.yml";
const [command] = process.argv.slice(2);

// ─── stack block — the ONLY section that differs between backend templates ───
// api-kotlin: the service listens on 8080. Seeding is printed guidance rather
// than an unattended run: the Flyway runner rides the Gradle wrapper, whose
// first invocation may resolve the toolchain — that belongs in the operator's
// terminal, not hidden behind a compose helper. The password default mirrors
// docker-compose.yml's ${POSTGRES_PASSWORD:-app} — a local-only compose
// default, never a deployed credential (BR-29).
const APP_URL = "http://localhost:8080";

function cmdSeed() {
  // Migrations ARE the seed step for a service: the schema is the state a
  // fresh environment needs before it can hold any data.
  process.stdout.write("seed: apply the Flyway history to the compose database yourself:\n");
  process.stdout.write(
    "    DATABASE_URL='jdbc:postgresql://localhost:5432/app?user=app&password='\"${POSTGRES_PASSWORD:-app}\" pnpm db:migrate\n",
  );
  process.stdout.write("    # equivalently: ./gradlew dbMigrate with the same DATABASE_URL exported\n");
  process.stdout.write("Inspect the result:\n");
  process.stdout.write("    psql 'postgres://app:'\"${POSTGRES_PASSWORD:-app}\"'@localhost:5432/app' -c '\\dt'\n");
  ok("seed: guidance printed — the migration run stays in your terminal");
}
// ─── end stack block ─────────────────────────────────────────────────────────

const has = (cmd) => {
  try {
    execSync(`command -v ${cmd}`, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
};

const requireDocker = () => {
  if (!has("docker")) {
    fail("docker is not installed — the local environment runs on docker compose", [
      "Install Docker Desktop (or colima + docker CLI) and re-run. Nothing else in verify needs it locally.",
    ]);
  }
};

const compose = (...args) => {
  // An honest /version even locally: stamp the real sha when git can name one.
  let sha = "unknown";
  try {
    sha = execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
  } catch {
    /* not a git checkout — "unknown" is the truthful stamp */
  }
  return spawnSync("docker", ["compose", "-f", COMPOSE, ...args], {
    stdio: "inherit",
    env: { ...process.env, GIT_SHA: sha },
  }).status ?? 1;
};

function cmdInit() {
  if (existsSync(".env")) {
    ok("init: .env already exists — left untouched");
    return;
  }
  if (!existsSync(".env.example")) fail(".env.example is missing — the documented environment surface ships with the template");
  try {
    copyFileSync(".env.example", ".env");
    ok("init: .env written from .env.example — fill in your local values (it is gitignored)");
  } catch (e) {
    // A guard hook (or filesystem policy) may refuse writes to .env — the
    // fallback is the same effect by the operator's own hand.
    note(`init: could not write .env (${e.code ?? e.message}) — run it yourself:`);
    process.stdout.write("    cp .env.example .env\n");
  }
}

function cmdUp() {
  requireDocker();
  if (compose("up", "--build", "--wait", "-d") !== 0) {
    fail("docker compose up failed — the healthcheck did not go green", [
      `Inspect with: docker compose -f ${COMPOSE} logs`,
    ]);
  }
  const localUrl = loadConfig().environments?.local?.url ?? APP_URL;
  ok("up: the stack is healthy");
  process.stdout.write(`    app (compose, the production image):  ${localUrl}\n`);
  process.stdout.write(`    dev loop (stop compose first, same port): pnpm dev\n`);
  process.stdout.write(`    prove it: node deploy/smoke.mjs --url ${localUrl}\n`);
}

function cmdDown() {
  requireDocker();
  if (compose("down") !== 0) fail("docker compose down failed");
  ok("down: the stack is stopped and removed");
}

function cmdStatus() {
  requireDocker();
  if (compose("ps") !== 0) fail("docker compose ps failed");
  ok("status: shown above");
}

const commands = { init: cmdInit, up: cmdUp, down: cmdDown, status: cmdStatus, seed: cmdSeed };
if (commands[command] === undefined) {
  fail("usage: pnpm env:local <init|up|down|status|seed>");
}
commands[command]();
