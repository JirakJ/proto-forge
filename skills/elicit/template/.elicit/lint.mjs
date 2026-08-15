import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

// The elicitation gate. It holds the properties that decide whether an
// instrument collects anything, and which prose about itself always claims:
//
//   - an artifact-first draft is VISIBLY unfinished (>= 3 marked gaps, E3) —
//     the single failure mode that turns elicitation into selling;
//   - a diagnostic RETURNS before it asks (findings with benchmarks, <= 8
//     questions, E5) — otherwise it is a form with better manners;
//   - a voice prompt asks exactly one thing (E6);
//   - no document is mostly questions (E9) — that is a form whatever its name.
//
//   node .elicit/lint.mjs <elicitation-dir>

const dir = process.argv[2];
if (dir === undefined) {
  process.stderr.write("usage: node .elicit/lint.mjs <elicitation-dir>\n");
  process.exit(2);
}

const errors = [];
const read = (p) => readFileSync(p, "utf8");
const MODES = new Set(["artifact", "diagnostic", "voice", "interview", "observation", "telemetry"]);
const STAGES = new Set(["cold", "qualified", "engaged"]);
const MIN_GAPS = 3;
const MAX_QUESTIONS = 8;

const bridgePath = join(dir, "elicitation.json");
if (!existsSync(bridgePath)) {
  process.stderr.write(`✗ elicit-lint: ${bridgePath} is missing — the run has no record of what it chose or why\n`);
  process.exit(1);
}

let bridge;
try {
  bridge = JSON.parse(read(bridgePath));
} catch (e) {
  process.stderr.write(`✗ elicit-lint: ${bridgePath} is not parseable JSON — ${e.message}\n`);
  process.exit(1);
}

const artifacts = bridge.artifacts ?? [];
if (artifacts.length === 0) errors.push("elicitation.json declares no artifacts — a run that emitted nothing is not a run");

for (const a of artifacts) {
  const at = `artifact "${a.id}"`;
  if (!MODES.has(a.mode)) {
    errors.push(`${at}: mode "${a.mode}" is not one of ${[...MODES].join("|")} (E1)`);
    continue;
  }
  if (!STAGES.has(a.stage)) errors.push(`${at}: stage "${a.stage}" is not cold|qualified|engaged (E2)`);
  if (!a.reason) errors.push(`${at}: states no reason for its instrument — the choice IS the decision (E1)`);

  const docPath = join(dir, a.doc ?? "");
  if (!a.doc || !existsSync(docPath)) {
    errors.push(`${at}: names document "${a.doc}", which does not exist`);
    continue;
  }
  const body = read(docPath);
  const lines = body.split("\n");

  if (!new RegExp(`^mode:\\s*${a.mode}\\s*$`, "m").test(body)) {
    errors.push(`${a.doc}: frontmatter mode does not say "${a.mode}"`);
  }

  // E9 — a document that is mostly questions is a form regardless of its name.
  const questionLines = lines.filter((l) => l.trim().endsWith("?")).length;
  const contentLines = lines.filter((l) => l.trim() !== "" && !l.trim().startsWith("---")).length;
  if (questionLines > 0 && questionLines * 2 > contentLines) {
    errors.push(
      `${a.doc}: ${questionLines} of ${contentLines} content lines are questions — ` +
        "that is a form regardless of what it is called (E9)",
    );
  }

  // E3 — the load-bearing rule: an artifact-first draft is visibly unfinished.
  if (a.mode === "artifact") {
    const gaps = [...body.matchAll(/^>\s*\*\*Gap\s+G\d+\s*—\s*provisional\.\*\*/gm)].length;
    if (gaps < MIN_GAPS) {
      errors.push(
        `${a.doc}: ${gaps} marked gap(s), the floor is ${MIN_GAPS} — a draft that looks finished sells ` +
          "your idea and drowns theirs, and nobody corrects it (E3)",
      );
    }
    if (a.gaps !== gaps) errors.push(`${at}: gaps says ${a.gaps}, the document carries ${gaps}`);
    if (/\b(price|pricing|invoice|contract|sign here)\b/i.test(body)) {
      errors.push(`${a.doc}: carries commercial language — the moment a draft argues it stops collecting (E4)`);
    }
  }

  // E5 — a diagnostic returns before it asks.
  if (a.mode === "diagnostic") {
    const findings = (bridge.findings ?? []).filter((f) => f.artifact === a.id);
    if (findings.length === 0) {
      errors.push(
        `${at}: a diagnostic with no findings is a form with better manners — ` +
          "its output is the deliverable, not a receipt (E5)",
      );
    }
    for (const f of findings) {
      if (!f.benchmark) errors.push(`${at} finding "${f.id}": no benchmark — a number without a comparison is not a finding (E5)`);
      if (!f.evidence) errors.push(`${at} finding "${f.id}": no evidence — every claim names where it came from (E8)`);
    }
    if ((a.questions ?? 0) > MAX_QUESTIONS) {
      errors.push(`${at}: ${a.questions} questions — past ${MAX_QUESTIONS} completion falls faster than the answers are worth (E5)`);
    }
  }

  // E6 — two questions in a voice prompt is already a form.
  if (a.mode === "voice" && a.questions !== 1) {
    errors.push(`${at}: a voice prompt asks exactly one question, not ${a.questions} (E6)`);
  }

  // E7 — the guide is internal by construction.
  if (a.mode === "interview" && !/not for sending/i.test(body)) {
    errors.push(`${a.doc}: an interview guide states that it is not for sending — compressing it into a questionnaire keeps the cost and loses the signal (E7)`);
  }
}

// E9 — one document, one instrument.
const byDoc = new Map();
for (const a of artifacts) {
  if (byDoc.has(a.doc)) errors.push(`two artifacts share document "${a.doc}" — one document is one instrument (E9)`);
  byDoc.set(a.doc, a.id);
}

if (errors.length > 0) {
  process.stderr.write(`✗ elicit-lint FAILED (${errors.length})\n`);
  for (const e of errors) process.stderr.write(`    ${e}\n`);
  process.exit(1);
}

process.stdout.write(
  `✓ elicit-lint: ${artifacts.length} instrument(s) — every draft visibly unfinished, ` +
    `every diagnostic returns before it asks, nothing is a form in disguise\n`,
);
