import { walk, read, fail, ok } from "./lib.mjs";

// BR-13: prompt-log entries are well-formed, uniquely + strictly-increasingly
// numbered, and correctly named. Append-only is enforced in CI by a git-history
// diff; here we validate structure (works with or without a git repo).
const all = walk(".prompts", (p) => p.endsWith(".md")).sort();
const errors = [];
const ids = [];

for (const f of all) {
  const name = f.split("/").pop();
  const nm = name.match(/^(\d{4})-[a-z0-9-]+\.md$/);
  if (!nm) {
    errors.push(`${f}: filename must be NNNN-slug.md`);
    continue;
  }
  const b = read(f);
  const id = b.match(/^id:\s*(\d+)/m)?.[1];
  if (!id) errors.push(`${f}: missing frontmatter id`);
  else if (id !== nm[1]) errors.push(`${f}: id ${id} != filename ${nm[1]}`);
  else ids.push(Number(id));
  if (!/^timestamp:/m.test(b)) errors.push(`${f}: missing timestamp`);
  if (!/^phase:/m.test(b)) errors.push(`${f}: missing phase`);
  if (!/##\s*Prompt/.test(b)) errors.push(`${f}: missing ## Prompt section`);
}

if (!all.length) errors.push("no prompt-log entries found in .prompts/");
for (let i = 1; i < ids.length; i++) {
  if (ids[i] <= ids[i - 1]) errors.push(`ids not strictly increasing: ${ids[i - 1]} then ${ids[i]}`);
}

if (errors.length) fail("prompt-log-lint FAILED", errors);
ok(`prompt-log-lint: ${all.length} entries, ids strictly increasing`);
