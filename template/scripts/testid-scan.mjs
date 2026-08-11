import { walk, read, isCode } from "./lib.mjs";
import { gateOptions, gateResult } from "./config.mjs";

// @adr 009 - every element addressable by a unique testid
// BR-02, the cross-file half. ESLint owns the per-file rules (presence, in-file
// duplicates, interpolation inside .map()); the runtime half lives in
// src/test/setup.ts. What is left, and what this covers, is the collision no
// single file can see: two features that both call their button "submit". They
// never collide in a unit test — they collide the day both render on one page,
// and then getByTestId picks whichever came first. Namespacing is cheap; a flaky
// selector found three weeks later is not.
const opts = gateOptions("testid");
const errors = [];
const seen = new Map();

const files = [
  ...walk("src", (p) => isCode(p) && !/\.(test|e2e)\./.test(p)),
  ...walk("packages", (p) => isCode(p) && !/\.(test|e2e)\./.test(p)),
];

for (const file of files) {
  const src = read(file);
  // Static values only. `data-testid={`row-${id}`}` is interpolated by design and
  // its uniqueness is proven at runtime, not here.
  for (const m of src.matchAll(/data-testid\s*=\s*["']([^"']+)["']/g)) {
    const id = m[1];
    if (id.trim() === "") {
      errors.push(`${file}: empty data-testid`);
      continue;
    }
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(id)) {
      errors.push(`${file}: data-testid "${id}" — use lowercase kebab-case so selectors stay predictable`);
    }
    const previous = seen.get(id);
    if (opts.requireUnique && previous !== undefined && previous !== file) {
      errors.push(
        `data-testid "${id}" is defined in both ${previous} and ${file} — ` +
          `namespace it (e.g. "${id}" → "<feature>-${id}") so the two never collide on one page`,
      );
    }
    seen.set(id, file);
  }
}

gateResult("testid", `testid:scan: ${seen.size} static testids across ${files.length} files, all distinct`, errors);
