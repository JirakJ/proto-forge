import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync, spawn } from "node:child_process";
import { fail, note, ok } from "./lib.mjs";

// @adr 001 - orchestration support: bring the demo pair up for the e2e part
//
// Support script, NOT a gate (registered notAGate), and TOOL-GATED on docker:
// without `docker compose` it prints what it would do and exits 0 — the runtime
// pair is the operator's environment, never a verify precondition. DRY by
// default; `--exec` runs compose for the backend and starts the built web
// preview detached. The URLs it prints are what the e2e part's suites read
// (E2E_API_URL / E2E_WEB_URL).

const exec = process.argv.includes("--exec");
const write = (s) => process.stdout.write(`${s}\n`);
const API_URL = process.env.WS_API_URL ?? "http://localhost:3000";
const WEB_URL = process.env.WS_WEB_URL ?? "http://localhost:4173";

if (!existsSync("workspace.json")) fail("ws-up: workspace.json is missing");
let manifest;
try {
  manifest = JSON.parse(readFileSync("workspace.json", "utf8"));
} catch (e) {
  fail(`ws-up: workspace.json does not parse: ${e.message}`);
}
const parts = Array.isArray(manifest.parts) ? manifest.parts : [];
const backend = parts.find((p) => p.role === "backend");
const frontend = parts.find((p) => p.role === "frontend");

if (!parts.some((p) => typeof p.dir === "string" && existsSync(p.dir))) {
  note("ws-up: no part directories present — run `pnpm ws:bootstrap` first");
  process.exit(0);
}

const docker = spawnSync("docker", ["compose", "version"], { stdio: "ignore" });
if (docker.status !== 0) {
  note("ws-up: docker compose is not available — tool-gated support, nothing attempted");
  note("       install Docker, or start each part by hand (see README.md)");
  process.exit(0);
}

const planned = [];

if (backend !== undefined && existsSync(backend.dir)) {
  const composeFile = [join(backend.dir, "deploy", "compose", "docker-compose.yml"), join(backend.dir, "docker-compose.yml")].find(
    (f) => existsSync(f),
  );
  if (composeFile === undefined) {
    note(`ws-up: ${backend.dir}/ ships no compose file yet — start it by hand: cd ${backend.dir} && pnpm dev`);
  } else {
    planned.push({ what: `backend "${backend.id}" via compose`, cmd: "docker", args: ["compose", "-f", composeFile, "up", "--wait", "-d"] });
  }
} else {
  note("ws-up: no backend part present — the api half of the pair is missing");
}

if (frontend !== undefined && existsSync(frontend.dir)) {
  if (existsSync(join(frontend.dir, "dist"))) {
    planned.push({
      what: `frontend "${frontend.id}" preview (detached)`,
      cmd: "pnpm",
      args: ["--dir", frontend.dir, "preview", "--port", "4173", "--strictPort"],
      detached: true,
    });
  } else {
    note(`ws-up: ${frontend.dir}/dist is missing — build first: pnpm --dir ${frontend.dir} install && pnpm --dir ${frontend.dir} build`);
  }
} else {
  note("ws-up: no frontend part present — the web half of the pair is missing");
}

if (planned.length === 0) {
  note("ws-up: nothing runnable yet");
  process.exit(0);
}

for (const step of planned) {
  write(`${exec ? "running" : "would run"}: ${step.cmd} ${step.args.join(" ")}`);
  if (!exec) continue;
  if (step.detached === true) {
    const child = spawn(step.cmd, step.args, { detached: true, stdio: "ignore" });
    child.unref();
    write(`  detached, pid ${child.pid}`);
  } else {
    const r = spawnSync(step.cmd, step.args, { stdio: "inherit" });
    if (r.status !== 0) fail(`ws-up: "${step.cmd} ${step.args.join(" ")}" failed`);
  }
}

write("");
write(`api: ${API_URL}`);
write(`web: ${WEB_URL}`);
write(`e2e: E2E_API_URL=${API_URL} E2E_WEB_URL=${WEB_URL} pnpm --dir e2e test:e2e`);
if (!exec) ok("ws-up: dry run — re-run with --exec to start the pair");
