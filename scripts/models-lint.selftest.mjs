import { expect, report } from "./selftest.mjs";

// The model registry is a single source (NFR-31): its shape has to hold, and
// every template copy has to be the master byte for byte. Each case breaks one
// thing and asserts the gate names it.

const registry = (over = {}) => ({
  tiers: { frontier: { rank: 3 }, standard: { rank: 2 }, economy: { rank: 1 } },
  models: [
    { id: "frontier-x", provider: "t", displayName: "Frontier X", aliases: ["fx"], tier: "frontier", pricing: { input: 10, output: 50, asOf: "2026-09-17" }, coAuthor: { name: "Frontier X", email: "frontier@example.test" } },
    { id: "standard-x", provider: "t", displayName: "Standard X", aliases: [], tier: "standard", pricing: { input: 2, output: 10, asOf: "2026-09-17" }, coAuthor: { name: "Standard X", email: "standard@example.test" } },
    { id: "economy-x", provider: "t", displayName: "Economy X", aliases: ["ex"], tier: "economy", pricing: { input: 1, output: 5, asOf: "2026-09-17" }, coAuthor: { name: "Economy X", email: "economy@example.test" } },
  ],
  routing: { "feature-build": "standard", translation: "economy" },
  ...over,
});

const ROUTING_DOC =
  "# Routing\n\n| Activity | Tier | Why |\n| --- | --- | --- |\n| `feature-build` | standard | the loop |\n| `translation` | economy | catalogues |\n";

const files = (master = registry(), over = {}) => {
  const body = JSON.stringify(master, null, 2);
  return {
    "references/models.json": body,
    "references/model-routing.md": ROUTING_DOC,
    "references/templates.json": {
      templates: [
        { id: "web", dir: "templates/web", kind: "frontend", stack: "ts", notAGate: [] },
        { id: "api-node", dir: "templates/api-node", kind: "backend", stack: "node", notAGate: [] },
      ],
    },
    "templates/web/.proto-forge/models.json": body,
    "templates/api-node/.proto-forge/models.json": body,
    ...over,
  };
};

expect("models-lint: a well-formed registry with identical copies passes", "models-lint.mjs", files(), { pass: true });

expect("models-lint: a model on an unknown tier fails", "models-lint.mjs", files(registry({
  models: [...registry().models, { id: "odd-x", provider: "t", displayName: "Odd", aliases: [], tier: "premium", pricing: { input: 1, output: 1, asOf: "2026-09-17" }, coAuthor: { name: "Odd", email: "odd@example.test" } }],
})), { pass: false, matching: /tier "premium"/ });

expect("models-lint: an alias two models claim fails", "models-lint.mjs", files(registry({
  models: registry().models.map((m) => (m.id === "standard-x" ? { ...m, aliases: ["fx"] } : m)),
})), { pass: false, matching: /claimed by both/ });

expect("models-lint: a tier with no model fails", "models-lint.mjs", files(registry({
  models: registry().models.filter((m) => m.tier !== "economy"),
})), { pass: false, matching: /tier "economy" has no model/ });

expect("models-lint: a co-author without an address fails", "models-lint.mjs", files(registry({
  models: registry().models.map((m) => (m.id === "economy-x" ? { ...m, coAuthor: { name: "Economy X", email: "nobody" } } : m)),
})), { pass: false, matching: /not an address/ });

expect("models-lint: a price without a read date fails", "models-lint.mjs", files(registry({
  models: registry().models.map((m) => (m.id === "economy-x" ? { ...m, pricing: { input: 1, output: 5 } } : m)),
})), { pass: false, matching: /asOf/ });

expect("models-lint: an activity routed to no tier fails", "models-lint.mjs", files(registry({
  routing: { "feature-build": "standard", translation: "cheap" },
})), { pass: false, matching: /routes to "cheap"/ });

expect("models-lint: a routed activity with no documented row fails", "models-lint.mjs", files(registry({
  routing: { "feature-build": "standard", translation: "economy", "code-review": "standard" },
})), { pass: false, matching: /"code-review" is routed .* but has no row/ });

expect("models-lint: a documented row the table does not route fails", "models-lint.mjs", files(registry({
  routing: { "feature-build": "standard" },
})), { pass: false, matching: /"translation" has a row here/ });

expect("models-lint: a documented tier that disagrees with the table fails", "models-lint.mjs", files(registry({
  routing: { "feature-build": "economy", translation: "economy" },
})), { pass: false, matching: /documented as standard/ });

expect("models-lint: a template copy that drifted from the master fails", "models-lint.mjs", files(registry(), {
  "templates/api-node/.proto-forge/models.json": JSON.stringify(registry({ routing: { "feature-build": "economy", translation: "economy" } }), null, 2),
}), { pass: false, matching: /api-node: .* differs from/ });

const withoutCopy = files();
delete withoutCopy["templates/api-node/.proto-forge/models.json"];
expect("models-lint: a template with no registry copy fails", "models-lint.mjs", withoutCopy, {
  pass: false,
  matching: /api-node: .* is missing/,
});

report();
