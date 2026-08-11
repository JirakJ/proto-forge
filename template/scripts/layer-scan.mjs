import { walk, read, isCode } from "./lib.mjs";
import { gateResult } from "./config.mjs";

// @adr 008 - one stacking scale, one portal, no exceptions
// BR-16. A popup that renders "on top" only until someone adds `transform` to a
// parent is not on top. Three mechanical rules keep the guarantee real:
//   1. every zIndex comes from tokens.layer.* — a literal number is an opinion
//      about the whole page held by one component, and it always loses eventually
//   2. anything positioned out of flow (fixed/absolute/sticky) declares its layer,
//      so paint order is stated rather than inherited from source order
//   3. anything that renders a fixed-position surface goes through <Portal>, so no
//      ancestor stacking context or overflow:hidden can trap or clip it
const TOKENS_FILE = "packages/proto-ui/tokens.ts";
const OUT_OF_FLOW = ["fixed", "absolute", "sticky"];
const errors = [];

// Walks back to the `{` that opens the object literal containing `index`, then
// forward to its match. Template holes (`${…}`) stay balanced, so a naive counter
// is accurate here and needs no parser.
function enclosingObject(src, index) {
  let depth = 0;
  let start = -1;
  for (let i = index; i >= 0; i--) {
    if (src[i] === "}") depth += 1;
    else if (src[i] === "{") {
      if (depth === 0) {
        start = i;
        break;
      }
      depth -= 1;
    }
  }
  if (start === -1) return null;
  depth = 0;
  for (let i = start; i < src.length; i += 1) {
    if (src[i] === "{") depth += 1;
    else if (src[i] === "}") {
      depth -= 1;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  return null;
}

const files = [
  ...walk("src", (p) => isCode(p) && !/\.(test|e2e)\./.test(p)),
  ...walk("packages", (p) => isCode(p) && !/\.(test|e2e)\./.test(p)),
];

for (const file of files) {
  const src = read(file);

  // 1. zIndex must name a layer token.
  if (file !== TOKENS_FILE) {
    for (const m of src.matchAll(/zIndex\s*:\s*([^,\n}]+)/g)) {
      const value = m[1].trim();
      if (!/^tokens\.layer\.[a-zA-Z]+$/.test(value)) {
        errors.push(
          `${file}: zIndex ${value} — use tokens.layer.* so the page has one stacking scale (BR-16)`,
        );
      }
    }
  }

  // 2. out-of-flow positioning declares its layer.
  for (const m of src.matchAll(/position\s*:\s*["'](fixed|absolute|sticky)["']/g)) {
    if (!OUT_OF_FLOW.includes(m[1])) continue;
    const object = enclosingObject(src, m.index);
    if (object === null) {
      errors.push(`${file}: position:${m[1]} outside a style object — cannot verify its layer`);
      continue;
    }
    if (!/zIndex\s*:/.test(object)) {
      errors.push(
        `${file}: position:${m[1]} without a zIndex — declare tokens.layer.* or paint order is source order (BR-16)`,
      );
    }
  }

  // 3. a fixed surface escapes the app tree through a portal.
  const rendersFixedSurface = /position\s*:\s*["']fixed["']/.test(src) && /<[a-z]/.test(src);
  const portals = /<Portal[\s>]/.test(src) || /RadixDialog\.Portal/.test(src) || /createPortal\(/.test(src);
  if (rendersFixedSurface && !portals) {
    errors.push(
      `${file}: renders a fixed-position surface without <Portal> — an ancestor transform/filter/` +
        `overflow would trap or clip it (BR-16)`,
    );
  }
}

// The scale itself must stay ordered: popups above modals, toasts above popups.
// A reordering here silently changes every overlay in the app, so state it once.
const tokensSrc = read(TOKENS_FILE);
const layer = Object.fromEntries(
  [...(tokensSrc.match(/layer:\s*\{([^}]*)\}/s)?.[1] ?? "").matchAll(/(\w+)\s*:\s*(\d+)/g)].map((m) => [
    m[1],
    Number(m[2]),
  ]),
);
const ORDER = ["base", "raised", "sticky", "overlay", "modal", "popover", "toast", "tooltip"];
for (const name of ORDER) {
  if (layer[name] === undefined) errors.push(`${TOKENS_FILE}: tokens.layer.${name} is missing`);
}
for (let i = 1; i < ORDER.length; i += 1) {
  const [lower, higher] = [ORDER[i - 1], ORDER[i]];
  if (layer[lower] !== undefined && layer[higher] !== undefined && layer[higher] <= layer[lower]) {
    errors.push(`${TOKENS_FILE}: tokens.layer.${higher} (${layer[higher]}) must sit above ${lower} (${layer[lower]})`);
  }
}

gateResult("layer", `layer:scan: ${files.length} files, one stacking scale, every overlay portalled`, errors);
