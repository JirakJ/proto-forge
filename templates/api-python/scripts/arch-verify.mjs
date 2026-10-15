import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { read, walk, isProd, note } from "./lib.mjs";
import { gateResult } from "./config.mjs";

// @adr 005 - the architecture profile is derived, recorded, and re-proved (BR-21)
//
// "Chosen by complexity" stays true because the chooser is RE-EXECUTED here on
// every run, not remembered: the style is a pure function of the facets (T15-T17),
// and three things must agree with it —
//   (a) the derivation itself, from .proto-forge/facets.json
//   (b) the record, .proto-forge/architecture.json {style, inputs}
//   (c) the enforcement: import-linter's ACTIVE contract file is selected by THIS
//       gate from the record (importlinter/<style>.toml — data-driven, never
//       hardcoded) and executed through the native toolchain, and the gate
//       re-proves the dependency direction with its own standalone import scan —
//       so BR-21 does not depend on any single tool's configuration.

const errors = [];

// --- (a) derive the style from the facets ------------------------------------
const FACETS = ".proto-forge/facets.json";
const RECORD = ".proto-forge/architecture.json";

if (!existsSync(FACETS)) {
  gateResult("arch", "arch:verify", [`${FACETS} is missing — the derivation has no input`]);
  // Only reached when the gate is waived below "error": nothing else is checkable.
  process.exit(0);
}

const facets = JSON.parse(read(FACETS));
const entities = facets.entities ?? [];
const backend = facets.backend ?? {};
const E = entities.length;
const X = (backend.externalSystems ?? []).length;
const messaging = backend.messaging ?? "none";
const realtime = facets.nonFunctional?.realtime ?? false;

// C = connected components of the entity reference graph (undirected: a ref-typed
// field is a relation either way for the purpose of "does this decompose?").
function components() {
  const names = entities.map((e) => e.name);
  const parent = new Map(names.map((n) => [n, n]));
  const find = (n) => {
    while (parent.get(n) !== n) n = parent.get(n);
    return n;
  };
  for (const entity of entities) {
    for (const field of entity.fields ?? []) {
      if (field.type === "ref" && parent.has(field.of)) {
        parent.set(find(entity.name), find(field.of));
      }
    }
  }
  return new Set(names.map(find)).size;
}
const C = components();

// T15-T17, verbatim from the decision table.
const derived = X >= 3 || messaging === "broker" ? "hexagonal" : C >= 2 || E >= 8 ? "modular" : "layered";

// --- (b) the record must agree ------------------------------------------------
if (!existsSync(RECORD)) {
  errors.push(`${RECORD} is missing — the derivation was never recorded`);
} else {
  const record = JSON.parse(read(RECORD));
  if (record.style !== derived) {
    errors.push(
      `${RECORD} records style "${record.style}" but the facets derive "${derived}" ` +
        `(E=${E}, X=${X}, C=${C}, messaging=${messaging}) — the profile is a pure function of the facets, not a preference`,
    );
  }
  const recorded = record.inputs ?? {};
  const expected = { E, X, C, messaging, realtime };
  const actual = {
    E: recorded.E,
    X: recorded.X,
    C: recorded.C,
    messaging: recorded.flags?.messaging,
    realtime: recorded.flags?.realtime,
  };
  for (const [key, want] of Object.entries(expected)) {
    if (actual[key] !== want) {
      errors.push(`${RECORD} inputs.${key} records ${JSON.stringify(actual[key])} but the facets say ${JSON.stringify(want)}`);
    }
  }
}

// --- (c1) every profile exists; the ACTIVE one is selected by the record -------
// import-linter reads a static file, so the data-driven selection lives HERE:
// the gate names importlinter/<derived>.toml, and a missing profile file makes
// the derivation unenforceable exactly like a missing lint edge table would.
const PROFILE_DIR = "importlinter";
for (const style of ["layered", "modular", "hexagonal"]) {
  const profile = `${PROFILE_DIR}/${style}.toml`;
  if (!existsSync(profile)) {
    errors.push(`${profile} is missing — a missing profile makes the derivation unenforceable`);
  } else if (!/\[\[tool\.importlinter\.contracts\]\]/.test(read(profile))) {
    errors.push(`${profile} defines no contracts — an empty profile enforces nothing`);
  }
}

// The native run, tool-gated the sec-scan way: uv drives import-linter over the
// ACTIVE profile when the locked environment exists; a throwaway fixture (or a
// machine without uv) falls back to the standalone scan below, and CI hard-fails
// if the native half cannot run (gates-selftest-native proves the tool fires).
const activeProfile = `${PROFILE_DIR}/${derived}.toml`;
if (existsSync("uv.lock") && existsSync(activeProfile)) {
  const lint = spawnSync("uv", ["run", "lint-imports", "--config", activeProfile], { encoding: "utf8" });
  if (lint.error !== undefined) {
    if (process.env.CI) {
      errors.push("uv is not installed in CI — the native import-linter half of BR-21 is mandatory there");
    } else {
      note("uv not found — skipping the native import-linter run locally (CI enforces; the standalone scan below still runs)");
    }
  } else if (lint.status !== 0) {
    errors.push(
      `import-linter (${activeProfile}) reports broken contracts:`,
      ...`${lint.stdout}${lint.stderr}`.split("\n").filter((l) => l.trim() !== "").slice(-12),
    );
  }
}

// --- (c2) the standalone dependency-direction proof ---------------------------
// The SAME edge tables as the import-linter profiles, duplicated here as data on
// purpose: import-linter enforces them through the native toolchain; this scan
// re-proves them standalone so BR-21 does not depend on lint configuration.
const EDGES = {
  layered: {
    domain: ["domain"],
    application: ["application", "domain", "platform"],
    "adapter-in": ["adapter-in", "application", "domain", "platform", "config"],
    "adapter-out": ["adapter-out", "application", "domain", "platform", "config"],
  },
  modular: {
    domain: ["domain"],
    application: ["application", "domain", "platform"],
    "adapter-in": ["adapter-in", "application", "domain", "platform", "config"],
    "adapter-out": ["adapter-out", "application", "domain", "platform", "config"],
  },
  hexagonal: {
    domain: ["domain"],
    application: ["application", "domain", "platform"],
    // Strict profile: an inbound adapter may not import an outbound one or vice
    // versa — everything crosses through the application's ports.
    "adapter-in": ["application", "domain", "platform", "config"],
    "adapter-out": ["application", "domain", "platform", "config"],
  },
};
const SHARED_EDGES = {
  platform: ["platform"],
  config: ["config"],
  main: ["main", "adapter-in", "adapter-out", "platform", "config", "application", "domain"],
};

// Which external (installed) packages each element may import. pydantic is
// ALLOWED in the domain — the model IS the schema (BRS §12.2), and pydantic has
// no I/O. The platform kernel additionally sees fastapi/starlette/structlog: it
// owns the framework-integration surface (error handler, security headers,
// health) per BRS §16, and it is byte-pinned. Everything else framework-shaped
// stays in the adapters. Pure stdlib modules are allowed everywhere.
const PURE_STDLIB = [
  "typing", "dataclasses", "datetime", "uuid", "abc", "collections", "enum",
  "decimal", "re", "math", "functools", "itertools", "json", "pathlib",
];
const ALLOWED_EXTERNALS = {
  domain: ["pydantic"],
  application: ["pydantic"],
  platform: ["pydantic", "structlog", "fastapi", "starlette", "logging"],
  config: ["pydantic", "os"],
  "adapter-in": ["*"],
  "adapter-out": ["*"],
  main: ["*"],
};

function elementOf(path) {
  if (path === "src/app/main.py") return "main";
  if (path.startsWith("src/app/domain/")) return "domain";
  if (path.startsWith("src/app/application/")) return "application";
  if (path.startsWith("src/app/adapters/inbound/")) return "adapter-in";
  if (path.startsWith("src/app/adapters/outbound/")) return "adapter-out";
  if (path.startsWith("src/app/platform/")) return "platform";
  if (path.startsWith("src/app/config/")) return "config";
  return null;
}

/** app.domain.note.model -> the element its file path would map to. */
function elementOfModule(moduleName) {
  if (moduleName === "app.main") return "main";
  const asPath = `src/${moduleName.split(".").join("/")}/`;
  return elementOf(asPath);
}

const externalAllowed = (element, moduleName) => {
  const allowed = ALLOWED_EXTERNALS[element] ?? [];
  if (allowed.includes("*")) return true;
  const top = moduleName.split(".")[0];
  return allowed.includes(top) || PURE_STDLIB.includes(top);
};

const prodFiles = walk("src", isProd).filter(
  (p) => !p.startsWith("src/app/harness/") && !p.startsWith("src/app/e2e/") && !p.includes("__fixtures__"),
);
// `import x.y` and `from x.y import z` — one imported module per match.
const IMPORT = /^\s*(?:import\s+([\w.]+)|from\s+([\w.]+)\s+import\b)/gm;

for (const file of prodFiles) {
  const from = elementOf(file);
  if (from === null) continue;
  for (const m of read(file).matchAll(IMPORT)) {
    const spec = m[1] ?? m[2];
    if (!spec.startsWith("app.") && spec !== "app") {
      if (!externalAllowed(from, spec)) {
        errors.push(
          `${file}: ${from} imports "${spec}" — the ${from} layer is framework-free; ` +
            `only [${(ALLOWED_EXTERNALS[from] ?? []).join(", ")}] may appear here (BR-21)`,
        );
      }
      continue;
    }
    const to = elementOfModule(spec);
    if (to === null || to === from) continue;
    if (!({ ...EDGES[derived], ...SHARED_EDGES }[from] ?? []).includes(to)) {
      errors.push(
        `${file}: ${from} imports ${to} (${spec}) — the "${derived}" profile does not allow that edge (BR-21)`,
      );
    }
  }
}

gateResult(
  "arch",
  `arch:verify: facets derive "${derived}" (E=${E}, X=${X}, C=${C}, messaging=${messaging}); record, importlinter profile and ${prodFiles.length} scanned imports agree`,
  errors,
);
