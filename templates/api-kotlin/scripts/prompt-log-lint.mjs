import { walk, read, fail, ok } from "./lib.mjs";

// @adr 002 - the append-only prompt log is the provenance record
// BR-13: prompt-log entries are well-formed, uniquely + strictly-increasingly
// numbered, correctly named, and written in ENGLISH — a prompt that arrived in
// another language is recorded as its faithful English rendering, with no
// translation annotation. Append-only is enforced in CI by a git-history diff;
// here we validate structure (works with or without a git repo).
const all = walk(".prompts", (p) => p.endsWith(".md")).sort();
const errors = [];
const ids = [];

// A word carrying a non-ASCII LETTER is not English prose. Frontmatter (author
// names) is exempt; backtick-quoted product strings and fenced blocks are code,
// not prose; punctuation (— « ») and emoji are not letters and never trigger.
const nonEnglishWords = (body) => {
  const prose = body
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`\n]*`/g, " ")
    .replace(/«redacted:[^»]*»/g, " ");
  const hits = [];
  for (const word of prose.split(/\s+/)) {
    for (const ch of word) {
      if (ch.codePointAt(0) > 127 && /\p{L}|\p{M}/u.test(ch)) {
        hits.push(word);
        break;
      }
    }
  }
  return hits;
};

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

  const fmEnd = b.indexOf("---", b.indexOf("---") + 3);
  const body = fmEnd === -1 ? b : b.slice(fmEnd + 3);
  const foreign = nonEnglishWords(body);
  if (foreign.length > 0) {
    errors.push(
      `${f}: non-English prompt text (${foreign.slice(0, 3).map((w) => JSON.stringify(w)).join(", ")}` +
        `${foreign.length > 3 ? `, +${foreign.length - 3} more` : ""}) — the prompt log is English; ` +
        `record the English rendering, and quote non-English product strings in backticks (BR-13)`,
    );
  }
}

if (!all.length) errors.push("no prompt-log entries found in .prompts/");
for (let i = 1; i < ids.length; i++) {
  if (ids[i] <= ids[i - 1]) errors.push(`ids not strictly increasing: ${ids[i - 1]} then ${ids[i]}`);
}

if (errors.length) fail("prompt-log-lint FAILED", errors);
ok(`prompt-log-lint: ${all.length} entries, ids strictly increasing`);
