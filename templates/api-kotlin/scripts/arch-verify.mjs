import { existsSync } from "node:fs";
import { read, walk, isProd, unquote } from "./lib.mjs";
import { gateResult } from "./config.mjs";

// @adr 005 - the architecture profile is derived, recorded, and re-proved (BR-21)
//
// "Chosen by complexity" stays true because the chooser is RE-EXECUTED here on
// every run, not remembered: the style is a pure function of the facets (T15-T17),
// and three things must agree with it —
//   (a) the derivation itself, from .proto-forge/facets.json
//   (b) the record, .proto-forge/architecture.json {style, inputs}
//   (c) the enforcement: the ArchUnit suite selects its edge table FROM the record
//       (data-driven, never hardcoded), and this gate re-proves the dependency
//       direction with its own import scan — ArchUnit enforces it in the JVM
//       build; this scan is the same edge table standing alone, so no JVM is
//       needed to trust BR-21.

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

// --- (c1) the ArchUnit suite derives from the record, mechanically ------------
const ARCH_SUITE = "src/test/kotlin/app/arch/ArchitectureTest.kt";
if (!existsSync(ARCH_SUITE)) {
  errors.push(`${ARCH_SUITE} is missing — nothing enforces the profile in the JVM build`);
} else {
  const suiteSrc = read(ARCH_SUITE);
  if (!suiteSrc.includes(".proto-forge/architecture.json")) {
    errors.push(`${ARCH_SUITE} does not read ${RECORD} — the active profile must be selected by the record, never hardcoded`);
  }
  for (const style of ["layered", "modular", "hexagonal"]) {
    if (!new RegExp(`"${style}"\\s*to`).test(suiteSrc)) {
      errors.push(`${ARCH_SUITE} defines no edge table for "${style}" — a missing profile makes the derivation unenforceable`);
    }
  }
}

// --- (c2) the standalone dependency-direction proof ---------------------------
// The SAME edge tables as ArchitectureTest.kt, duplicated here as data on
// purpose: ArchUnit enforces them inside `./gradlew test`; this scan re-proves
// them standalone so BR-21 does not depend on a JVM or a compiled classpath.
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

// Which external package prefixes each element may import. kotlinx.serialization is
// ALLOWED in the domain — the descriptors ARE the schema (BRS §12.2), and the
// library is a codec with no I/O. The platform kernel additionally sees ktor and
// slf4j: it owns the framework-integration surface (problem pages, security
// headers, health) per BRS §16, and it is byte-pinned. Everything else
// framework-shaped stays in the adapters. org.jetbrains.annotations is not listed
// anywhere because it never appears in Kotlin SOURCE — the compiler stamps it into
// bytecode, which is ArchUnit's problem, not this scan's.
const ALLOWED_EXTERNALS = {
  domain: ["java.", "kotlin.", "kotlinx.serialization."],
  application: ["java.", "kotlin."],
  platform: ["java.", "kotlin.", "kotlinx.", "io.ktor.", "org.slf4j."],
  config: ["java.", "kotlin."],
  "adapter-in": ["*"],
  "adapter-out": ["*"],
  main: ["*"],
};

function elementOf(path) {
  if (!path.startsWith("src/main/kotlin/app/")) return null;
  const rest = path.slice("src/main/kotlin/app/".length);
  if (rest.startsWith("domain/")) return "domain";
  if (rest.startsWith("application/")) return "application";
  if (rest.startsWith("adapters/in/")) return "adapter-in";
  if (rest.startsWith("adapters/out/")) return "adapter-out";
  if (rest.startsWith("platform/")) return "platform";
  if (rest.startsWith("config/")) return "config";
  if (!rest.includes("/")) return "main"; // composition root files in the app package
  return null;
}

function elementOfPackage(spec) {
  if (spec.startsWith("app.domain.")) return "domain";
  if (spec.startsWith("app.application.")) return "application";
  if (spec.startsWith("app.adapters.in.")) return "adapter-in";
  if (spec.startsWith("app.adapters.out.")) return "adapter-out";
  if (spec.startsWith("app.platform.")) return "platform";
  if (spec.startsWith("app.config.")) return "config";
  if (spec.startsWith("app.")) return "main";
  return null;
}

const externalAllowed = (element, spec) => {
  const allowed = ALLOWED_EXTERNALS[element] ?? [];
  if (allowed.includes("*")) return true;
  return allowed.some((prefix) => spec.startsWith(prefix));
};

const edges = { ...EDGES[derived], ...SHARED_EDGES };
const prodFiles = walk("src", isProd);
// Kotlin imports carry no trailing semicolon and may escape keyword segments with
// backticks (app.adapters.`in`.http.RouteDef); unquote() strips them before the
// package mapping so the escaping never leaks into a rule.
const IMPORT = /^import\s+([\w.`]+(?:\.\*)?)\s*(?:as\s+\w+)?\s*$/gm;

for (const file of prodFiles) {
  const from = elementOf(file);
  if (from === null) continue;
  for (const m of read(file).matchAll(IMPORT)) {
    const spec = unquote(m[1]);
    if (!spec.startsWith("app.")) {
      if (!externalAllowed(from, spec)) {
        errors.push(
          `${file}: ${from} imports "${spec}" — the ${from} layer is framework-free; ` +
            `only [${(ALLOWED_EXTERNALS[from] ?? []).join(", ")}] may appear here (BR-21)`,
        );
      }
      continue;
    }
    const to = elementOfPackage(spec);
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
  `arch:verify: facets derive "${derived}" (E=${E}, X=${X}, C=${C}, messaging=${messaging}); record, ArchUnit profile and ${prodFiles.length} scanned imports agree`,
  errors,
);
