import { createHash } from "node:crypto";
import { expect, report } from "./selftest.mjs";

// Proves the discovery gate (skills/discovery/template/.discovery/lint.mjs)
// rejects what BR-30..BR-33 claim it does. The lint is standalone by design —
// copied per run next to a brief — so it is exercised here exactly as it runs
// there: spawned against a throwaway discovery directory, argv[2] = the target.
//
// The fixture "image" is a text stand-in: the lint judges bytes by sha256, not by
// format, and a real PNG here would only prove the harness can write binary.

const LINT = "../skills/discovery/template/.discovery/lint.mjs";
const sha = (s) => createHash("sha256").update(s).digest("hex");

const IMG = "png stand-in bytes for the fixture image\n";

const QUESTIONS = {
  version: 1,
  questions: [
    { id: "Q1", kind: "screen", topic: "error behavior", question: "?", defaultHint: "inline error" },
    { id: "Q2", kind: "screen", topic: "empty state", question: "?", defaultHint: "designed empty state" },
    { id: "Q6", kind: "screen", topic: "destructive confirmation", question: "?", defaultHint: "confirm destructive" },
  ],
};

const INVENTORY = JSON.stringify(
  {
    version: 1,
    units: [
      {
        id: "orders-screen",
        kind: "screen",
        order: 1,
        sources: [{ type: "figma", fileKey: "F123", nodeId: "1:2", fileVersion: "42" }],
      },
      {
        id: "checkout-feature",
        kind: "feature",
        order: 2,
        sources: [{ type: "brief", path: ".inputs/brief.md", sha256: "a".repeat(64) }],
      },
    ],
  },
  null,
  2,
);

const DOC1 = `---
id: orders-screen
kind: screen
status: open
gapsOpen: 1
gapsTotal: 2
sources:
  - type: figma
    fileKey: F123
    nodeId: "1:2"
    fileVersion: "42"
---

# orders-screen

## Situation

The pinned frame shows an order list with a refresh action.

## Problem

The failure state is not designed anywhere.

## Implication

Gap 2 leaves the failure path undefined.

## Need-payoff

Answering the gaps makes the screen buildable without guesses.

## DAPA

### Definition

An order-list screen.

### Acceptance criteria

The list renders and every gap row below is answered.

### Prerequisites

An orders data source exists.

### Assumptions

Open gaps stand on their proposed defaults.

## Elements

| Element | Testid | Figma node | Image | Notes |
| --- | --- | --- | --- | --- |
| Order list | orders-screen-order-list | 1:5 | ![Order list](images/order-list.png) | Primary region. |
| Refresh button | orders-screen-refresh | 1:6 | — <!-- no-image: captured inside the order-list image above --> | Reloads the list. |

## Gap table

| # | Q | Element | Question | Evidence | Proposed default | Answer | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Q2 | orders-screen-order-list | What shows when there are no orders? | The frame has an empty variant (node 1:7). | Show the designed empty variant. | The designed empty variant ships. | answered |
| 2 | Q1 | orders-screen-order-list | What shows when loading fails? | Neither brief nor frame shows a failure state. | Inline error with a retry action. | | open |
`;

const DOC2 = `---
id: checkout-feature
kind: feature
status: open
gapsOpen: 1
gapsTotal: 1
sources:
  - type: brief
    path: .inputs/brief.md
    sha256: ${"a".repeat(64)}
---

# checkout-feature

## Situation

The brief names a checkout flow.

## Problem

The confirmation interaction is unstated.

## Implication

Gap 1 leaves the submit interaction ambiguous.

## Need-payoff

An answered gap means one checkout, built once.

## DAPA

### Definition

The checkout flow.

### Acceptance criteria

Submitting completes the flow and the gap row is answered.

### Prerequisites

An order exists to check out.

### Assumptions

Open gaps stand on their proposed defaults.

## Elements

| Element | Testid | Figma node | Image | Notes |
| --- | --- | --- | --- | --- |
| Checkout action | checkout-feature-submit | — | — <!-- no-image: this run had no Figma source --> | Starts the flow. |

## Gap table

| # | Q | Element | Question | Evidence | Proposed default | Answer | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Q6 | checkout-feature-submit | Does submitting need confirmation? | The brief does not state the interaction. | Submit immediately with an undo affordance. | | open |
`;

const LOCK1 = {
  "images/order-list.png": {
    fileKey: "F123",
    nodeId: "1:5",
    fileVersion: "42",
    sha256: sha(IMG),
    capturedAt: "2026-08-13T00:00:00Z",
  },
};

const bridge = (inventory, mutate = (b) => b) =>
  mutate({
    version: 1,
    discoveryHash: sha(inventory),
    units: [
      { id: "orders-screen", kind: "screen", doc: "docs/orders-screen/README.md", status: "open", gapsOpen: 1, gapsTotal: 2 },
      { id: "checkout-feature", kind: "feature", doc: "docs/checkout-feature/README.md", status: "open", gapsOpen: 1, gapsTotal: 1 },
    ],
    testids: [
      { unit: "orders-screen", testid: "orders-screen-order-list", figmaNodeId: "1:5" },
      { unit: "orders-screen", testid: "orders-screen-refresh", figmaNodeId: "1:6" },
      { unit: "checkout-feature", testid: "checkout-feature-submit" },
    ],
    gaps: [
      { unit: "orders-screen", q: "Q2", status: "answered", proposedDefault: "Show the designed empty variant.", answer: "The designed empty variant ships." },
      { unit: "orders-screen", q: "Q1", status: "open", proposedDefault: "Inline error with a retry action.", answer: null },
      { unit: "checkout-feature", q: "Q6", status: "open", proposedDefault: "Submit immediately with an undo affordance.", answer: null },
    ],
    facets: {},
  });

const files = (over = {}) => {
  const inventory = over.inventory ?? INVENTORY;
  const out = {
    ".discovery/questions.json": QUESTIONS,
    "inventory.json": inventory,
    "discovery.json": over.bridge ?? bridge(inventory),
    "docs/orders-screen/README.md": over.doc1 ?? DOC1,
    "docs/orders-screen/images.lock": over.lock1 ?? LOCK1,
    "docs/checkout-feature/README.md": over.doc2 ?? DOC2,
  };
  if (over.img !== null) out["docs/orders-screen/images/order-list.png"] = over.img ?? IMG;
  return out;
};

const run = (name, fixtureFiles, opts) => expect(name, LINT, fixtureFiles, { args: ["."], ...opts });

run("discovery: the complete sample shape passes", files(), { pass: true });

run(
  "discovery: a missing SPIN section fails",
  files({ doc1: DOC1.replace("## Problem\n\nThe failure state is not designed anywhere.\n\n", "") }),
  { pass: false, matching: /## Problem/ },
);

run(
  "discovery: a missing DAPA subsection fails",
  files({ doc1: DOC1.replace("### Prerequisites\n\nAn orders data source exists.\n\n", "") }),
  { pass: false, matching: /Prerequisites/ },
);

run(
  "discovery: a malformed gap table header fails",
  files({ doc1: DOC1.replace("| # | Q | Element | Question | Evidence | Proposed default | Answer | Status |", "| # | Q | Element | Question | Evidence | Default | Answer | Status |") }),
  { pass: false, matching: /gap table header/ },
);

run(
  "discovery: an empty proposed default fails",
  files({ doc1: DOC1.replace("| Inline error with a retry action. | | open |", "| | | open |") }),
  { pass: false, matching: /Proposed default/ },
);

run(
  "discovery: empty evidence fails",
  files({ doc1: DOC1.replace("| Neither brief nor frame shows a failure state. |", "| |") }),
  { pass: false, matching: /Evidence/ },
);

run(
  "discovery: a non-kebab testid fails",
  files({ doc1: DOC1.replaceAll("orders-screen-refresh", "orders-screen-Refresh") }),
  { pass: false, matching: /kebab/ },
);

run(
  "discovery: a testid duplicated across documents fails",
  files({ doc2: DOC2.replaceAll("checkout-feature-submit", "orders-screen-order-list") }),
  { pass: false, matching: /defined in both/ },
);

run(
  "discovery: a gap citing an unknown Q-id fails",
  files({ doc1: DOC1.replace("| 2 | Q1 |", "| 2 | Q99 |") }),
  { pass: false, matching: /Q99/ },
);

run(
  "discovery: a gap naming an element the document does not list fails",
  files({ doc1: DOC1.replace("| 2 | Q1 | orders-screen-order-list |", "| 2 | Q1 | orders-screen-ghost |") }),
  { pass: false, matching: /orders-screen-ghost/ },
);

run(
  "discovery: an image the document references but the disk lacks fails",
  files({ img: null }),
  { pass: false, matching: /not on disk/ },
);

run(
  "discovery: an image whose bytes disagree with images.lock fails",
  files({ img: "different bytes entirely\n" }),
  { pass: false, matching: /sha256/ },
);

run(
  "discovery: a bare — image cell without a stated reason fails",
  files({ doc1: DOC1.replace("— <!-- no-image: captured inside the order-list image above -->", "—") }),
  { pass: false, matching: /no-image/ },
);

run(
  "discovery: frontmatter counts disagreeing with the gap table fail",
  files({ doc1: DOC1.replace("gapsOpen: 1", "gapsOpen: 2") }),
  { pass: false, matching: /gapsOpen/ },
);

run(
  "discovery: status answered with an empty Answer cell fails",
  files({ doc1: DOC1.replace("| The designed empty variant ships. | answered |", "| | answered |") }),
  { pass: false, matching: /marked answered/ },
);

run(
  "discovery: a bridge that disagrees with its documents fails",
  files({ bridge: bridge(INVENTORY, (b) => ({ ...b, testids: b.testids.slice(0, 2) })) }),
  { pass: false, matching: /discovery\.json/ },
);

run(
  "discovery: a figma source with no fileVersion pin fails",
  files({ doc1: DOC1.replace('    fileVersion: "42"\n', "") }),
  { pass: false, matching: /fileVersion/ },
);

run(
  "discovery: a unit in the inventory with no document fails",
  files({
    inventory: INVENTORY.replace(
      '"id": "checkout-feature"',
      '"id": "billing-screen"',
    ),
  }),
  { pass: false, matching: /billing-screen/ },
);

report();
