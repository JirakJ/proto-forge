import { walk, read, fail, ok } from "./lib.mjs";
import { frontmatter, loadModels, resolveModel, tierRank } from "./models.mjs";

// @adr 002 - the append-only prompt log is the provenance record
// BR-13: prompt-log entries are well-formed, uniquely + strictly-increasingly
// numbered, correctly named, and written in ENGLISH — a prompt that arrived in
// another language is recorded as its faithful English rendering, with no
// translation annotation. Append-only is enforced in CI by a git-history diff;
// here we validate structure (works with or without a git repo).
//
// BR-50: every entry names the model that executed it (`model:` — a registered
// id or alias), and a DELEGATED entry (`delegated-by: <earlier id>` +
// `activity: <routing key>`) sits on the tier the registry routes its activity
// to — unless it records a `routing-override:` reason — and, when the
// orchestrating entry's model is frontier-tier, on a STRICTLY lower tier. The
// frontier rule has no override: it is the operator's standing cost policy.
const all = walk(".prompts", (p) => p.endsWith(".md")).sort();
const errors = [];
const ids = [];

const { registry, errors: registryErrors } = loadModels();
errors.push(...registryErrors);

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

// Pass one: structure, and the model each entry ran on (by id, for pass two).
const entries = new Map(); // id (number) -> { file, fm, model }
for (const f of all) {
  const name = f.split("/").pop();
  const nm = name.match(/^(\d{4})-[a-z0-9-]+\.md$/);
  if (!nm) {
    errors.push(`${f}: filename must be NNNN-slug.md`);
    continue;
  }
  const b = read(f);
  const fm = frontmatter(b) ?? {};
  const id = b.match(/^id:\s*(\d+)/m)?.[1];
  if (!id) errors.push(`${f}: missing frontmatter id`);
  else if (id !== nm[1]) errors.push(`${f}: id ${id} != filename ${nm[1]}`);
  else ids.push(Number(id));
  if (!/^timestamp:/m.test(b)) errors.push(`${f}: missing timestamp`);
  if (!/^phase:/m.test(b)) errors.push(`${f}: missing phase`);
  if (!/##\s*Prompt/.test(b)) errors.push(`${f}: missing ## Prompt section`);

  let model;
  if (registry !== null) {
    if (fm.model === undefined || fm.model === "") {
      errors.push(`${f}: missing model — every entry names the model that executed it (BR-50)`);
    } else {
      model = resolveModel(registry, fm.model);
      if (model === undefined) {
        errors.push(`${f}: model "${fm.model}" is not in the registry (.proto-forge/models.json) — BR-50`);
      }
    }
  }
  if (id !== undefined && id === nm[1]) entries.set(Number(id), { file: f, fm, model });

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

// Pass two: delegation — the routing rule and the frontier rule (BR-50).
if (registry !== null) {
  for (const [id, { file, fm, model }] of entries) {
    if (fm["delegated-by"] === undefined) continue;
    const parentId = /^\d{4}$/.test(fm["delegated-by"]) ? Number(fm["delegated-by"]) : NaN;
    const parent = entries.get(parentId);
    if (parent === undefined || parentId >= id) {
      errors.push(`${file}: delegated-by ${fm["delegated-by"]} is not an earlier entry — the orchestrating prompt is written first (BR-50)`);
      continue;
    }
    const activity = fm.activity;
    const routed = activity === undefined ? undefined : registry.routing[activity];
    if (routed === undefined) {
      errors.push(
        `${file}: activity "${activity ?? ""}" is not a routed activity — one of ${Object.keys(registry.routing).join(", ")} (BR-50)`,
      );
    }
    if (model === undefined || parent.model === undefined) continue; // already reported above
    const mine = tierRank(registry, model.tier);
    const theirs = tierRank(registry, parent.model.tier);
    if (mine === undefined || theirs === undefined) {
      errors.push(`${file}: tier "${model.tier}" or "${parent.model.tier}" is not defined by the registry`);
      continue;
    }
    const parentIsFrontier = theirs === Math.max(...Object.values(registry.tiers).map((t) => t.rank));
    if (parentIsFrontier && mine >= theirs) {
      errors.push(
        `${file}: ${model.id} (${model.tier}) delegated by ${parent.file} on ${parent.model.id} (${parent.model.tier}) — ` +
          `a frontier orchestrator delegates to a strictly cheaper tier, no override (BR-50)`,
      );
      continue;
    }
    if (routed !== undefined && model.tier !== routed) {
      const override = fm["routing-override"];
      if (override === undefined || override.trim() === "") {
        errors.push(
          `${file}: ${model.id} is ${model.tier}, but "${activity}" is routed to ${routed} — ` +
            `use the routed tier, or record why with routing-override: <reason> (BR-50)`,
        );
      }
    }
  }
}

if (!all.length) errors.push("no prompt-log entries found in .prompts/");
for (let i = 1; i < ids.length; i++) {
  if (ids[i] <= ids[i - 1]) errors.push(`ids not strictly increasing: ${ids[i - 1]} then ${ids[i]}`);
}

if (errors.length) fail("prompt-log-lint FAILED", errors);
const delegated = [...entries.values()].filter((e) => e.fm["delegated-by"] !== undefined).length;
ok(`prompt-log-lint: ${all.length} entries, ids strictly increasing, every model registered, ${delegated} delegated within routing`);
