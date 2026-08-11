import { existsSync, readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { walk, fail, ok } from "./lib.mjs";

// @adr 007 - performance budget on the built bundle.
// Ceilings are gzipped bytes of dist/ (what the user actually downloads). Raising
// one is a design decision: it needs an accepted ADR, never a quiet edit here.
const LIMITS = { js: 300_000, css: 60_000, chunk: 250_000 };

if (!existsSync("dist")) fail("no dist/ — run: pnpm build");

// The gallery is a test fixture built into dist only when VITE_GALLERY=1 (E2E and
// `docs:shots` do that). Measuring it would report weight no user downloads, so
// refuse the measurement rather than quietly produce a wrong — and flattering or
// alarming — number.
if (existsSync("dist/gallery.html")) {
  fail("dist/ contains the component gallery, which never ships — re-measure a production build: pnpm build");
}

const assets = walk("dist", (p) => /\.(js|css)$/.test(p))
  .map((p) => ({ p, gz: gzipSync(readFileSync(p)).length }))
  .sort((a, b) => b.gz - a.gz);

if (!assets.length) fail("dist/ has no .js or .css assets — the build produced nothing to measure");

const kb = (n) => `${(n / 1000).toFixed(1)} kB`;
const total = (ext) => assets.filter((a) => a.p.endsWith(ext)).reduce((n, a) => n + a.gz, 0);
const js = total(".js");
const css = total(".css");
const largest = assets[0];

const errors = [];
if (js > LIMITS.js) errors.push(`JS ${kb(js)} gz exceeds ${kb(LIMITS.js)}`);
if (css > LIMITS.css) errors.push(`CSS ${kb(css)} gz exceeds ${kb(LIMITS.css)}`);
if (largest.gz > LIMITS.chunk) errors.push(`largest chunk ${largest.p} ${kb(largest.gz)} gz exceeds ${kb(LIMITS.chunk)}`);

if (errors.length) {
  fail("budget FAILED", [...errors, ...assets.map((a) => `${kb(a.gz)}  ${a.p}`)]);
}
ok(`budget: JS ${kb(js)} / CSS ${kb(css)} gz, largest chunk ${kb(largest.gz)} — within budget`);
