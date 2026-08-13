import { walk, read, isCode } from "./lib.mjs";
import { gateResult } from "./config.mjs";

// @adr 008 - one stacking scale, one portal, one owner per concern
// BR-16. A popup that renders "on top" only until someone adds `transform` to a parent
// is not on top, and a composition that is merely conventional is one edit from being
// abandoned. Nine mechanical rules:
//   1. every zIndex comes from tokens.layer.* or from the stack — a literal number is
//      one component's opinion about the whole page, and it always loses eventually
//   2. anything positioned out of flow declares its layer, so paint order is stated
//   3. anything rendering a fixed surface goes through <Portal>
//   4. an overlay surface claims a slot, instead of keeping its own open/close books
//   5. exactly ONE document keydown listener in the library, in useDismiss
//   6. exactly ONE reader of the overlay layer base, in OverlayStack
//   7. fixed surfaces in the library live under overlay/
//   8. the scale stays ordered and grows no per-kind overlay entry
//   9. platform top-layer calls happen only in the adapter
// 4-9 exist because the composition IS the guarantee: a primitive that quietly grows
// its own keydown listener reintroduces "Escape closes everything", and nothing else
// would notice.
const TOKENS_FILE = "packages/proto-ui/tokens.ts";
const OUT_OF_FLOW = ["fixed", "absolute", "sticky"];
const LIB = "packages/proto-ui/src/";
const DISMISS_OWNER = `${LIB}overlay/useDismiss.ts`;
const SCALE_READER = `${LIB}overlay/OverlayStack.tsx`;
const PLATFORM_ADAPTERS = [`${LIB}overlay/topLayer.ts`, `${LIB}overlay/useInertBackground.ts`];
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

// src/harness/** is excluded BY DESIGN, not for convenience: the adversarial fixtures
// exist to violate these rules — a sibling at z-index 2147483647, unportalled fixed
// surfaces — so the browser suite can prove the library survives them. The catalogue
// never enters a production build (vite adds harness.html only under VITE_HARNESS=1),
// so nothing it does can reach a user.
const scannable = (p) => isCode(p) && !/\.(test|e2e)\./.test(p) && !p.startsWith("src/harness/");
const files = [...walk("src", scannable), ...walk("packages", scannable)];

for (const file of files) {
  const src = read(file);

  // 1. zIndex must come from the scale or from the stack — never from a number.
  // `slot.fallbackZIndex` is the stack's computed value for the no-top-layer path: it is
  // derived from tokens.layer inside OverlayStack (rule 6), and a surface is allowed to
  // sit one step above it so a scrim can go underneath its own dialog.
  if (file !== TOKENS_FILE) {
    for (const m of src.matchAll(/zIndex\s*:\s*([^,\n}]+)/g)) {
      const value = m[1].trim();
      const allowed = /^tokens\.layer\.[a-zA-Z]+$/.test(value) || /^slot\.fallbackZIndex(\s*\+\s*1)?$/.test(value);
      if (!allowed) {
        errors.push(
          `${file}: zIndex ${value} — use tokens.layer.* or slot.fallbackZIndex so the page has one stacking scale (BR-16)`,
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
  const portals = /<Portal[\s>]/.test(src) || /createPortal\(/.test(src);
  if (rendersFixedSurface && !portals) {
    errors.push(
      `${file}: renders a fixed-position surface without <Portal> — an ancestor transform/filter/` +
        `overflow would trap or clip it (BR-16)`,
    );
  }

  // Rules 4-9 read STRUCTURE, so comments are stripped first: capabilities.ts documents
  // `<dialog>.showModal()` in a doc comment, and a gate that fails on prose about a rule
  // teaches people to stop writing the prose.
  const code = src.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
  const inLibrary = file.startsWith(LIB);
  const inOverlay = file.startsWith(`${LIB}overlay/`);

  // 4. a surface claims a slot rather than keeping its own books. Without a slot it
  // cannot know whether it is topmost, so it cannot dismiss correctly.
  if (inLibrary && !inOverlay && (/promote\(/.test(code) || /popover=/.test(code)) && !/useOverlaySlot\(/.test(code)) {
    errors.push(
      `${file}: renders or promotes a surface without useOverlaySlot — a surface that does not ` +
        `claim a slot cannot know whether it is topmost (BR-16)`,
    );
  }

  // 5. one dismiss owner. This is the rule that keeps "Escape closes one thing" true.
  if (inLibrary && file !== DISMISS_OWNER && /document\.addEventListener\(\s*["']keydown["']/.test(code)) {
    errors.push(
      `${file}: installs a document keydown listener — only ${DISMISS_OWNER} may, or Escape ` +
        `dismisses every open surface at once (BR-16)`,
    );
  }

  // 6. one reader of the overlay base. Everything else consumes slot.fallbackZIndex.
  if (file !== TOKENS_FILE && file !== SCALE_READER && /tokens\.layer\.overlay\b/.test(code)) {
    errors.push(
      `${file}: reads tokens.layer.overlay — only ${SCALE_READER} may; consume slot.fallbackZIndex ` +
        `so no component holds an opinion about the whole page (BR-16)`,
    );
  }

  // 7. fixed surfaces in the library belong to the overlay subsystem.
  if (inLibrary && !inOverlay && /position\s*:\s*["']fixed["']/.test(code) && !/useOverlaySlot\(/.test(code)) {
    errors.push(`${file}: a fixed-position surface outside overlay/ that claims no slot (BR-16)`);
  }

  // 9. platform calls only in the adapter, so a browser that changes an API changes one file.
  if (inLibrary && !PLATFORM_ADAPTERS.includes(file)) {
    for (const m of code.matchAll(/\.(showModal|showPopover|hidePopover)\(|\.inert\s*=/g)) {
      errors.push(
        `${file}: calls ${m[0]} directly — top-layer and inertness calls belong to ` +
          `${PLATFORM_ADAPTERS.join(" / ")} (BR-16)`,
      );
    }
  }
}

// The scale itself must stay ordered, and must NOT grow a per-kind overlay entry: that
// is the shape ADR 008 removed, because it inverts as soon as two surfaces are open.
// Surfaces are ordered by when they opened; the scale supplies one base and nothing more.
const tokensSrc = read(TOKENS_FILE);
const layer = Object.fromEntries(
  [...(tokensSrc.match(/layer:\s*\{([^}]*)\}/s)?.[1] ?? "").matchAll(/(\w+)\s*:\s*(\d+)/g)].map((m) => [
    m[1],
    Number(m[2]),
  ]),
);
const ORDER = ["base", "raised", "sticky", "overlay"];
for (const name of ORDER) {
  if (layer[name] === undefined) errors.push(`${TOKENS_FILE}: tokens.layer.${name} is missing`);
}
for (let i = 1; i < ORDER.length; i += 1) {
  const [lower, higher] = [ORDER[i - 1], ORDER[i]];
  if (layer[lower] !== undefined && layer[higher] !== undefined && layer[higher] <= layer[lower]) {
    errors.push(`${TOKENS_FILE}: tokens.layer.${higher} (${layer[higher]}) must sit above ${lower} (${layer[lower]})`);
  }
}

const RETIRED = ["modal", "popover", "toast", "tooltip"];
for (const name of RETIRED) {
  if (layer[name] !== undefined) {
    errors.push(
      `${TOKENS_FILE}: tokens.layer.${name} is back — a per-kind overlay scale inverts once two ` +
        `surfaces are open (ADR 008). Order by when a surface opened, via OverlayStack.`,
    );
  }
}

gateResult("layer", `layer:scan: ${files.length} files, one stacking scale, every overlay portalled`, errors);
