import { existsSync } from "node:fs";
import { read, walk, isProd } from "./lib.mjs";
import { gateResult } from "./config.mjs";

// @adr 005 - the architecture profile is derived, recorded, and re-proved (BR-21)
//
// "Chosen by complexity" stays true because the chooser is RE-EXECUTED here on
// every run, not remembered: the style is a pure function of the facets (T15-T17),
// and three things must agree with it —
//   (a) the derivation itself, from .proto-forge/facets.json
//   (b) the record, .proto-forge/architecture.json {style, inputs}
//   (c) the enforcement: the ArchUnitNET suite selects its edge table FROM the
//       record (data-driven, never hardcoded), and this gate re-proves the
//       dependency direction with its own using-directive scan — ArchUnitNET
//       enforces it in the dotnet build; this scan is the same edge table
//       standing alone, so no dotnet toolchain is needed to trust BR-21.

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

// --- (c1) the ArchUnitNET suite derives from the record, mechanically ---------
const ARCH_SUITE = "tests/App.Tests/Arch/ArchitectureTest.cs";
if (!existsSync(ARCH_SUITE)) {
  errors.push(`${ARCH_SUITE} is missing — nothing enforces the profile in the dotnet build`);
} else {
  const suiteSrc = read(ARCH_SUITE);
  if (!suiteSrc.includes(".proto-forge/architecture.json")) {
    errors.push(`${ARCH_SUITE} does not read ${RECORD} — the active profile must be selected by the record, never hardcoded`);
  }
  for (const style of ["layered", "modular", "hexagonal"]) {
    if (!new RegExp(`\\["${style}"\\]\\s*=`).test(suiteSrc)) {
      errors.push(`${ARCH_SUITE} defines no edge table for "${style}" — a missing profile makes the derivation unenforceable`);
    }
  }
}

// --- (c2) the standalone dependency-direction proof ---------------------------
// The SAME edge tables as ArchitectureTest.cs, duplicated here as data on
// purpose: ArchUnitNET enforces them inside `dotnet test`; this scan re-proves
// them standalone so BR-21 does not depend on a dotnet toolchain or a compiled
// assembly.
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

// Which external namespace prefixes each element may import. DataAnnotations is
// ALLOWED in the domain — the constraints ARE the schema (BRS §12.2), and the
// namespace is BCL-only with no I/O. The platform kernel additionally sees the
// hosting framework: it owns the framework-integration surface (problem
// middleware, security headers, health) per BRS §16, and it is byte-pinned.
// Everything else framework-shaped stays in the adapters. The scan reads
// explicit using directives; ArchUnitNET closes the implicit-usings gap in the
// dotnet build.
const ALLOWED_EXTERNALS = {
  domain: ["System"],
  application: ["System"],
  platform: ["System", "Microsoft"],
  config: ["System"],
  "adapter-in": ["*"],
  "adapter-out": ["*"],
  main: ["*"],
};

function elementOf(path) {
  if (!path.startsWith("src/App/")) return null;
  const rest = path.slice("src/App/".length);
  if (rest.startsWith("Domain/")) return "domain";
  if (rest.startsWith("Application/")) return "application";
  if (rest.startsWith("Adapters/In/")) return "adapter-in";
  if (rest.startsWith("Adapters/Out/")) return "adapter-out";
  if (rest.startsWith("Platform/")) return "platform";
  if (rest.startsWith("Config/")) return "config";
  if (!rest.includes("/")) return "main"; // composition root files next to the csproj
  return null;
}

const inNamespace = (spec, prefix) => spec === prefix || spec.startsWith(`${prefix}.`);

function elementOfNamespace(spec) {
  if (inNamespace(spec, "App.Domain")) return "domain";
  if (inNamespace(spec, "App.Application")) return "application";
  if (inNamespace(spec, "App.Adapters.In")) return "adapter-in";
  if (inNamespace(spec, "App.Adapters.Out")) return "adapter-out";
  if (inNamespace(spec, "App.Platform")) return "platform";
  if (inNamespace(spec, "App.Config")) return "config";
  if (inNamespace(spec, "App")) return "main";
  return null;
}

const externalAllowed = (element, spec) => {
  const allowed = ALLOWED_EXTERNALS[element] ?? [];
  if (allowed.includes("*")) return true;
  return allowed.some((prefix) => inNamespace(spec, prefix));
};

const edges = { ...EDGES[derived], ...SHARED_EDGES };
const prodFiles = walk("src", isProd);
const IMPORT = /^using\s+(?:static\s+)?(?:\w+\s*=\s*)?([\w.]+)\s*;/gm;

for (const file of prodFiles) {
  const from = elementOf(file);
  if (from === null) continue;
  for (const m of read(file).matchAll(IMPORT)) {
    const spec = m[1];
    if (!inNamespace(spec, "App")) {
      if (!externalAllowed(from, spec)) {
        errors.push(
          `${file}: ${from} imports "${spec}" — the ${from} layer is framework-free; ` +
            `only [${(ALLOWED_EXTERNALS[from] ?? []).join(", ")}] may appear here (BR-21)`,
        );
      }
      continue;
    }
    const to = elementOfNamespace(spec);
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
  `arch:verify: facets derive "${derived}" (E=${E}, X=${X}, C=${C}, messaging=${messaging}); record, ArchUnitNET profile and ${prodFiles.length} scanned imports agree`,
  errors,
);
