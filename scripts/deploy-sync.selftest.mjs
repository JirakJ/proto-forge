import { expect, report } from "./selftest.mjs";

// One design, N copies: the shareable delivery files must stay byte-identical
// across the templates that carry them, and a drifted byte must name itself.

const REGISTRY = {
  templates: [
    { id: "web", dir: "templates/web", kind: "frontend", stack: "ts", notAGate: [] },
    { id: "api-x", dir: "templates/api-x", kind: "backend", stack: "node", notAGate: [] },
    { id: "api-y", dir: "templates/api-y", kind: "backend", stack: "python", notAGate: [] },
  ],
};

const LIB = "export const doors = 6;\n";
const SMOKE = "process.exit(0);\n";

const files = (over = {}) => ({
  "references/templates.json": REGISTRY,
  // The app-template corpus (canonical: web) — one representative file per shape.
  "templates/web/scripts/deploy-lib.mjs": LIB,
  "templates/api-x/scripts/deploy-lib.mjs": LIB,
  "templates/api-y/scripts/deploy-lib.mjs": LIB,
  "templates/web/scripts/deploy-cli.mjs": LIB,
  "templates/api-x/scripts/deploy-cli.mjs": LIB,
  "templates/api-y/scripts/deploy-cli.mjs": LIB,
  "templates/web/scripts/env-remote.mjs": LIB,
  "templates/api-x/scripts/env-remote.mjs": LIB,
  "templates/api-y/scripts/env-remote.mjs": LIB,
  "templates/web/scripts/deploy-verify.mjs": LIB,
  "templates/api-x/scripts/deploy-verify.mjs": LIB,
  "templates/api-y/scripts/deploy-verify.mjs": LIB,
  "templates/web/deploy/schemas/deployment.json": "{}\n",
  "templates/api-x/deploy/schemas/deployment.json": "{}\n",
  "templates/api-y/deploy/schemas/deployment.json": "{}\n",
  "templates/web/deploy/chart/templates/deployment.yaml": "kind: Deployment\n",
  "templates/api-x/deploy/chart/templates/deployment.yaml": "kind: Deployment\n",
  "templates/api-y/deploy/chart/templates/deployment.yaml": "kind: Deployment\n",
  "templates/web/deploy/chart/values/dev.yaml": "replicas: 1\n",
  "templates/api-x/deploy/chart/values/dev.yaml": "replicas: 1\n",
  "templates/api-y/deploy/chart/values/dev.yaml": "replicas: 1\n",
  "templates/web/.github/workflows/package.yml": "name: package\n",
  "templates/api-x/.github/workflows/package.yml": "name: package\n",
  "templates/api-y/.github/workflows/package.yml": "name: package\n",
  "templates/web/.github/workflows/cd.yml": "name: cd\n",
  "templates/api-x/.github/workflows/cd.yml": "name: cd\n",
  "templates/api-y/.github/workflows/cd.yml": "name: cd\n",
  // The backend corpus (canonical: api-x by registry order? canonical is api-node
  // in the live gate; the fixture uses api-x as first backend — the gate names
  // api-node explicitly, so give the fixture that id instead where it matters.
  "templates/api-x/deploy/smoke.mjs": SMOKE,
  "templates/api-y/deploy/smoke.mjs": SMOKE,
  "templates/api-x/deploy/chart/Chart.yaml": "name: svc\n",
  "templates/api-y/deploy/chart/Chart.yaml": "name: svc\n",
  ...over,
});

// The live gate's backend canonical is "api-node"; the fixture registry must carry
// that id for the backend set to engage.
const withApiNode = (over = {}) => {
  const f = files(over);
  f["references/templates.json"] = {
    templates: [
      { id: "web", dir: "templates/web", kind: "frontend", stack: "ts", notAGate: [] },
      { id: "api-node", dir: "templates/api-x", kind: "backend", stack: "node", notAGate: [] },
      { id: "api-y", dir: "templates/api-y", kind: "backend", stack: "python", notAGate: [] },
    ],
  };
  return f;
};

expect("deploy-sync: byte-identical shareable sets pass", "deploy-sync.mjs", withApiNode(), { pass: true });

expect("deploy-sync: a drifted byte names the file and the canonical", "deploy-sync.mjs",
  withApiNode({ "templates/api-y/scripts/deploy-lib.mjs": "export const doors = 5;\n" }),
  { pass: false, matching: /api-y\/scripts\/deploy-lib\.mjs drifts/ });

expect("deploy-sync: a template missing a shareable file fails", "deploy-sync.mjs",
  (() => {
    const f = withApiNode();
    delete f["templates/api-y/.github/workflows/cd.yml"];
    return f;
  })(),
  { pass: false, matching: /cd\.yml is missing/ });

expect("deploy-sync: drift inside a shared directory is found file by file", "deploy-sync.mjs",
  withApiNode({ "templates/api-x/deploy/chart/templates/deployment.yaml": "kind: Deployment\nreplicas: 9\n" }),
  { pass: false, matching: /deployment\.yaml drifts/ });

report();
