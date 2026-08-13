import { walk, read, isCode, fail, ok } from "./lib.mjs";

// BR-10: features must compose @jj/proto-ui primitives, not re-implement them.
// Scans ALL of src/** (proto-ui itself, in packages/, legitimately owns raw
// intrinsics). Catches raw form controls AND raw elements wearing a primitive role.
const EQUIV = { button: "Button", input: "Field", select: "Field", textarea: "Field" };
const PRIMITIVE_ROLE = /role=["'](dialog|alertdialog|menu|tooltip|listbox|tablist|tab|combobox)["']/;
const errors = [];

for (const f of walk("src", (p) => isCode(p) && !/\.(test|e2e)\./.test(p))) {
  const b = read(f);
  for (const [tag, comp] of Object.entries(EQUIV)) {
    if (new RegExp(`<${tag}[\\s/>]`).test(b)) errors.push(`${f}: raw <${tag}> — use ${comp} from @jj/proto-ui (BR-10)`);
  }
  if (PRIMITIVE_ROLE.test(b)) errors.push(`${f}: raw element with a primitive role — use the matching @jj/proto-ui primitive (BR-10)`);
}

if (errors.length) fail("component-dup-scan FAILED", errors);
ok("component-dup-scan: features compose proto-ui primitives");
