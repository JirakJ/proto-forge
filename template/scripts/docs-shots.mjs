import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "@playwright/test";
import { componentSources, documentableComponents, lockFor, sourceHash } from "./docs-lib.mjs";
import { fail, note, ok } from "./lib.mjs";

// @adr 009 - documentation screenshots are generated, never hand-managed
// Builds gallery.html (a separate Rollup entry, so nothing here reaches the
// production bundle), serves it, and photographs one case per URL fragment. The
// per-component .shot.lock records the source hash the image was taken from, so
// `pnpm docs:verify` can tell a current screenshot from a flattering old one.
//
// Deliberately NOT a pixel-diff: comparing PNGs across machines and browser
// versions produces failures about font hinting, not about the product. Hashing
// the source answers the question that actually matters — "does this picture show
// the code we are shipping?"

const PORT = 4174;
const BASE = `http://localhost:${PORT}`;
const OUT = "docs/components";

const build = spawnSync("pnpm", ["exec", "vite", "build"], {
  stdio: "inherit",
  env: { ...process.env, VITE_GALLERY: "1" },
});
if (build.status !== 0) fail("docs:shots — the gallery build failed");

const server = spawn("pnpm", ["exec", "vite", "preview", "--port", String(PORT), "--strictPort"], {
  stdio: "ignore",
  env: { ...process.env, VITE_GALLERY: "1" },
});
const stop = () => server.kill();
process.on("exit", stop);

async function waitForServer(timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE}/gallery.html`);
      if (res.ok) return;
    } catch {
      // preview is not listening yet
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  fail(`docs:shots — the preview server never came up on ${BASE}`);
}

await waitForServer();

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 900, height: 600 }, deviceScaleFactor: 2 });

await page.goto(`${BASE}/gallery.html`);
const manifest = await page.$$eval("[data-testid^='gallery-link-']", (nodes) =>
  nodes.map((n) => ({
    id: n.dataset.case,
    component: n.dataset.component,
    name: n.dataset.name,
    note: n.dataset.note,
    click: n.dataset.click,
  })),
);
if (manifest.length === 0) fail("docs:shots — the gallery listed no cases");

const byComponent = new Map();
for (const c of manifest) {
  await page.goto(`${BASE}/gallery.html#/${c.id}`);
  const frame = page.getByTestId("gallery-case");
  await frame.waitFor({ state: "visible" });
  if (c.click !== "") {
    await page.getByTestId(c.click).click();
    // The overlay animates in from a portal; wait for it rather than sleeping.
    await page.locator("#proto-ui-overlay-root *").first().waitFor({ state: "visible" });
  }
  // Overlays live outside the case frame, so those cases are shot full-page —
  // otherwise the screenshot would show the trigger and none of the popup.
  const target = c.click === "" && c.component !== "Dialog" ? frame : page;
  const dir = join(OUT, c.component);
  mkdirSync(dir, { recursive: true });
  await target.screenshot({ path: join(dir, `${c.name}.png`) });

  const list = byComponent.get(c.component) ?? [];
  list.push({ file: `${c.name}.png`, note: c.note });
  byComponent.set(c.component, list);
}

await browser.close();
stop();

for (const [component, shots] of byComponent) {
  const sources = componentSources(component);
  if (sources.length === 0) note(`docs:shots — no source file found for ${component}; lock will hash the gallery only`);
  writeFileSync(
    lockFor("components", component),
    `${JSON.stringify({ source: sourceHash(sources), shots: shots.sort((a, b) => a.file.localeCompare(b.file)), capturedBy: "docs:shots" }, null, 2)}\n`,
  );
}

// A component folder for something that no longer exists is worse than no folder:
// it documents a thing that is gone. Keyed on what the library still exports —
// NOT on "did this run photograph it", since a component can be legitimately
// documented without a screenshot (Portal renders nothing of its own).
if (existsSync(OUT)) {
  const exported = new Set(documentableComponents());
  for (const dir of readdirSync(OUT)) {
    if (!exported.has(dir)) {
      rmSync(join(OUT, dir), { recursive: true, force: true });
      note(`docs:shots — removed docs/components/${dir} (component no longer exists)`);
    }
  }
}

ok(`docs:shots: ${manifest.length} screenshots across ${byComponent.size} components`);
