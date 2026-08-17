import { createHash } from "node:crypto";
import { expect, report } from "./selftest.mjs";

// Proves security-catalogue.mjs rejects what BR-38 claims it does.
//
// The vendored standard in these fixtures is a three-requirement stand-in, not the
// real 345-entry file: the gate resolves ids and levels out of whatever it is
// pinned to, so a full copy here would prove only that the harness can write 163 kB.

const STANDARD = {
  requirements: [
    { chapter_id: "V1", req_id: "V1.3.1", req_description: "sanitize untrusted HTML", L: "1" },
    { chapter_id: "V3", req_id: "V3.4.3", req_description: "send a Content-Security-Policy", L: "2" },
    { chapter_id: "V3", req_id: "V3.6.1", req_description: "host external assets with integrity", L: "3" },
  ],
};
const STANDARD_JSON = JSON.stringify(STANDARD, null, 2);
const SHA = createHash("sha256").update(STANDARD_JSON).digest("hex");

const REGISTRY = {
  templates: [
    { id: "web", dir: "templates/web", kind: "frontend", stack: "ts" },
    { id: "api-node", dir: "templates/api-node", kind: "backend", stack: "node" },
  ],
};

const CONTROL = {
  id: "SEC-001",
  title: "Untrusted HTML is sanitized by one library at one sink",
  requires: [{ standard: "asvs", req: "V1.3.1" }],
  appliesTo: { kinds: ["frontend"] },
  control: "SafeHtml.tsx is the only sink",
  status: "enforced",
  probe: "safeHtmlIsSoleSink",
};

/** The passing repo, with `over` merged into the catalogue and `files` on top. */
const base = (over = {}, files = {}) => ({
  "references/templates.json": REGISTRY,
  "references/standards/asvs.flat.json": STANDARD_JSON,
  "references/security-controls.json": {
    standards: {
      asvs: {
        name: "OWASP ASVS",
        version: "5.0.0",
        vendored: "references/standards/asvs.flat.json",
        sha256: SHA,
        profile: { default: 2 },
      },
    },
    controls: [CONTROL],
    ...over,
  },
  ...files,
});

/** The passing repo with exactly one control replaced. */
const withControl = (patch) => base({ controls: [{ ...CONTROL, ...patch }] });

expect("catalogue: the shipped shape passes", "security-catalogue.mjs", base(), { pass: true });

// 1 — the pinned standard is the standard on disk
expect(
  "catalogue: a vendored standard that is not the pinned one fails",
  "security-catalogue.mjs",
  base({}, { "references/standards/asvs.flat.json": `${STANDARD_JSON}\n` }),
  { pass: false, matching: /not the pinned standard/ },
);

expect(
  "catalogue: a missing vendored standard fails",
  "security-catalogue.mjs",
  { "references/templates.json": REGISTRY, "references/security-controls.json": base()["references/security-controls.json"] },
  { pass: false, matching: /is missing/ },
);

// 2 — every cited requirement resolves. The case the design's first draft failed.
expect(
  "catalogue: a requirement id the standard does not contain fails",
  "security-catalogue.mjs",
  withControl({ requires: [{ standard: "asvs", req: "V3.4.99" }] }),
  { pass: false, matching: /does not exist in/ },
);

// 3 — a cited requirement above the binding profile claims a bar we do not hold
expect(
  "catalogue: citing an L3 requirement under an L2 profile fails",
  "security-catalogue.mjs",
  withControl({ requires: [{ standard: "asvs", req: "V3.6.1" }] }),
  { pass: false, matching: /Level 3, while the binding profile is Level 2/ },
);

// 4 — appliesTo binds something real
expect(
  "catalogue: a control bound to a kind no template has fails",
  "security-catalogue.mjs",
  withControl({ appliesTo: { kinds: ["mainframe"] } }),
  { pass: false, matching: /no template in/ },
);

expect(
  "catalogue: a control bound to nothing fails",
  "security-catalogue.mjs",
  withControl({ appliesTo: {} }),
  { pass: false, matching: /binds no template/ },
);

// 5 — status is a promise about what runs today
expect(
  "catalogue: an enforced control with no probe fails",
  "security-catalogue.mjs",
  withControl({ probe: undefined }),
  { pass: false, matching: /names no probe/ },
);

expect(
  "catalogue: a planned control carrying a probe fails",
  "security-catalogue.mjs",
  withControl({ status: "planned", stage: "E3" }),
  { pass: false, matching: /reads as coverage/ },
);

expect(
  "catalogue: a planned control with no stage fails",
  "security-catalogue.mjs",
  withControl({ status: "planned", stage: undefined, probe: undefined }),
  { pass: false, matching: /names no stage/ },
);

// 6 — our own strictness has to admit that it is ours
expect(
  "catalogue: a control citing no standard and giving no rationale fails",
  "security-catalogue.mjs",
  withControl({ requires: [] }),
  { pass: false, matching: /never read as someone else's requirement/ },
);

expect(
  "catalogue: a control citing no standard but stating its rationale passes",
  "security-catalogue.mjs",
  withControl({ requires: [], rationale: "ASVS 5.0 does not mention Trusted Types; this is our own tightening." }),
  { pass: true },
);

// housekeeping the report depends on
expect(
  "catalogue: a duplicate control id fails",
  "security-catalogue.mjs",
  base({ controls: [CONTROL, { ...CONTROL, title: "another" }] }),
  { pass: false, matching: /declared twice/ },
);

expect(
  "catalogue: a control naming no control fails",
  "security-catalogue.mjs",
  withControl({ control: undefined }),
  { pass: false, matching: /a wish/ },
);

report();
