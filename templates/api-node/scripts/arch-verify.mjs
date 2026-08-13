import { existsSync } from "node:fs";
import { dirname, join, normalize } from "node:path";
import { read, walk, isProd } from "./lib.mjs";
import { gateResult } from "./config.mjs";

// @adr 005 - the architecture profile is derived, recorded, and re-proved (BR-21)
//
// "Chosen by complexity" stays true because the chooser is RE-EXECUTED here on
// every run, not remembered: the style is a pure function of the facets (T15-T17),
// and three things must agree with it —
//   (a) the derivation itself, from .proto-forge/facets.json
//   (b) the record, .proto-forge/architecture.json {style, inputs}
//   (c) the enforcement: eslint.config.js selects its edge table FROM the record
//       (data-driven, never hardcoded), and this gate re-proves the dependency
//       direction with its own import scan — eslint enforces it in-editor; this
//       scan is the same edge table standing alone, so CI needs no lint rerun to
//       trust BR-21.

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

// --- (c1) the lint config derives from the record, mechanically ---------------
const ESLINT = "eslint.config.js";
if (!existsSync(ESLINT)) {
  errors.push(`${ESLINT} is missing — nothing enforces the profile in-editor`);
} else {
  const lintSrc = read(ESLINT);
  if (!lintSrc.includes(".proto-forge/architecture.json")) {
    errors.push(`${ESLINT} does not read ${RECORD} — the active profile must be selected by the record, never hardcoded`);
  }
  for (const style of ["layered", "modular", "hexagonal"]) {
    if (!new RegExp(`${style}\\s*:`).test(lintSrc)) {
      errors.push(`${ESLINT} defines no edge table for "${style}" — a missing profile makes the derivation unenforceable`);
    }
  }
}

// --- (c2) the standalone dependency-direction proof ---------------------------
// The SAME edge tables as eslint.config.js, duplicated here as data on purpose:
// eslint enforces them in-editor through eslint-plugin-boundaries; this scan
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

// Which bare (package) imports each element may reach. zod is ALLOWED in the
// domain — the schema IS the model (BRS §12.2), and zod has no I/O. The platform
// kernel additionally sees fastify: it owns the framework-integration surface
// (error handler, security headers, health) per BRS §16, and it is byte-pinned.
// Everything else framework-shaped stays in the adapters.
const ALLOWED_EXTERNALS = {
  domain: ["zod"],
  application: ["zod"],
  platform: ["pino", "zod", "fastify", "node:*"],
  config: ["zod", "node:*"],
  "adapter-in": ["*"],
  "adapter-out": ["*"],
  main: ["*"],
};

function elementOf(path) {
  const p = normalize(path);
  if (p === "src/main.ts") return "main";
  if (p.startsWith("src/domain/")) return "domain";
  if (p.startsWith("src/application/")) return "application";
  if (p.startsWith("src/adapters/in/")) return "adapter-in";
  if (p.startsWith("src/adapters/out/")) return "adapter-out";
  if (p.startsWith("src/platform/")) return "platform";
  if (p.startsWith("src/config/")) return "config";
  return null;
}

const externalAllowed = (element, spec) => {
  const allowed = ALLOWED_EXTERNALS[element] ?? [];
  if (allowed.includes("*")) return true;
  const pkg = spec.split("/").slice(0, spec.startsWith("@") ? 2 : 1).join("/");
  if (allowed.includes(pkg)) return true;
  return spec.startsWith("node:") && allowed.includes("node:*");
};

const edges = { ...EDGES[derived], ...SHARED_EDGES };
const prodFiles = walk("src", isProd).filter(
  (p) => !p.startsWith("src/test/") && !p.startsWith("src/harness/") && !p.includes("__fixtures__"),
);
const IMPORT = /^(?:import|export)[^;'"]*from\s*["']([^"']+)["']|^import\s*["']([^"']+)["']/gm;

for (const file of prodFiles) {
  const from = elementOf(file);
  if (from === null) continue;
  for (const m of read(file).matchAll(IMPORT)) {
    const spec = m[1] ?? m[2];
    if (!spec.startsWith(".")) {
      if (!externalAllowed(from, spec)) {
        errors.push(
          `${file}: ${from} imports "${spec}" — the ${from} layer is framework-free; ` +
            `only [${(ALLOWED_EXTERNALS[from] ?? []).join(", ")}] may appear here (BR-21)`,
        );
      }
      continue;
    }
    // Relative import: resolve to a repo path and map it to an element. TS under
    // NodeNext imports with a .js suffix; strip any extension before mapping.
    const resolved = normalize(join(dirname(file), spec)).replace(/\.(js|ts)$/, "");
    const to = elementOf(`${resolved}.ts`) ?? elementOf(`${resolved}/index.ts`);
    if (to === null || to === from) continue;
    if (!(edges[from] ?? []).includes(to)) {
      errors.push(
        `${file}: ${from} imports ${to} (${spec}) — the "${derived}" profile does not allow that edge (BR-21)`,
      );
    }
  }
}

gateResult(
  "arch",
  `arch:verify: facets derive "${derived}" (E=${E}, X=${X}, C=${C}, messaging=${messaging}); record, lint profile and ${prodFiles.length} scanned imports agree`,
  errors,
);
