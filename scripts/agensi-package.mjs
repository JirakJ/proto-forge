import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { crc32, deflateRawSync } from "node:zlib";
import { read, fail, ok } from "./lib.mjs";

// Builds the Agensi marketplace package for one release (ADR 027).
//
// The listing cannot carry the plugin: Agensi serves a buyer's agent at most 200
// text files per listing, accepts at most 1,000 per upload, and tells the agent
// never to save what it fetched — while proto-forge's first act is to copy a
// template of hundreds of files into the user's project. So the package is a
// bootstrap: a SKILL.md plus one self-contained script that clones THIS repository
// at the release tag and refuses the checkout unless HEAD is the tag's commit.
//
// The tag and its commit are stamped in here, from git, at package time — never
// typed by hand. A package can only be cut for a tag that exists, whose own
// package.json carries the tag's version, so the listing can never point at an
// unreleased or mislabelled tree.
//
//   node scripts/agensi-package.mjs [--ref vX.Y.Z] [--out dist/agensi] [--check]
//
// --ref defaults to v<package.json version>; --check validates without writing.

const SOURCE = "distribution/agensi";
const SKILL_NAME = "proto-forge";
const FILES = [
  { from: `${SOURCE}/SKILL.template.md`, to: `${SKILL_NAME}/SKILL.md`, mode: 0o644 },
  { from: `${SOURCE}/bootstrap.template.mjs`, to: `${SKILL_NAME}/scripts/bootstrap.mjs`, mode: 0o755, script: true },
];

// Agensi's published packaging limits (agensi.io/docs/packaging). The agent-upload
// file cap (100) is the strictest of the file-count limits, so the package meets
// every submission route.
const LIMITS = {
  files: 100,
  zipBytes: 50 * 1024 * 1024,
  scriptBytes: 20 * 1024,
  listingChars: 6_000_000,
  descriptionChars: 1500,
};
const TEXT = /\.(md|mjs)$/;
const TOKEN = /__PROTO_FORGE_[A-Z_]+__/g;

function args(argv) {
  const out = { ref: undefined, out: "dist/agensi", check: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--check") out.check = true;
    else if (a === "--ref" || a === "--out") {
      const v = argv[i + 1];
      if (v === undefined || v.startsWith("--")) fail("agensi-package FAILED", [`${a} needs a value`]);
      out[a.slice(2)] = v;
      i += 1;
    } else fail("agensi-package FAILED", [`unknown argument "${a}"`]);
  }
  return out;
}

function git(argv) {
  const r = spawnSync("git", argv, { encoding: "utf8" });
  return r.status === 0 ? r.stdout.trim() : null;
}

// --- deterministic ZIP (stored timestamps fixed at the DOS epoch) ---------------

const DOS_TIME = 0;
const DOS_DATE = (1 << 5) | 1; // 1980-01-01

function zip(entries) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const { name, data, mode } of entries) {
    const nameBytes = Buffer.from(name, "utf8");
    const packed = deflateRawSync(data, { level: 9 });
    const crc = crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0x0800, 6); // UTF-8 names
    local.writeUInt16LE(8, 8); // deflate
    local.writeUInt16LE(DOS_TIME, 10);
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(packed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, nameBytes, packed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE((3 << 8) | 20, 4); // made by: UNIX, spec 2.0
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(DOS_TIME, 12);
    central.writeUInt16LE(DOS_DATE, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(packed.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt16LE(0, 30); // extra
    central.writeUInt16LE(0, 32); // comment
    central.writeUInt16LE(0, 34); // disk
    central.writeUInt16LE(0, 36); // internal attrs
    central.writeUInt32LE(((0o100000 | mode) << 16) >>> 0, 38); // regular file + permissions
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBytes);

    offset += local.length + nameBytes.length + packed.length;
  }
  const directory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}

// --- main -----------------------------------------------------------------------

const opts = args(process.argv.slice(2));
const errors = [];

if (!existsSync("package.json")) fail("agensi-package FAILED", ["run from the repository root: package.json is missing"]);
const ref = opts.ref ?? `v${JSON.parse(read("package.json")).version}`;
if (!/^v\d+\.\d+\.\d+$/.test(ref)) fail("agensi-package FAILED", [`ref "${ref}" is not a vMAJOR.MINOR.PATCH release tag`]);
const version = ref.slice(1);

const commit = git(["rev-list", "-n", "1", `refs/tags/${ref}`]);
if (commit === null || !/^[0-9a-f]{40}$/.test(commit)) {
  fail("agensi-package FAILED", [`tag ${ref} does not exist here — a listing may only pin a released tag (fetch tags or cut the release first)`]);
}
const taggedPkg = git(["show", `${commit}:package.json`]);
const taggedVersion = taggedPkg === null ? null : JSON.parse(taggedPkg).version;
if (taggedVersion !== version) {
  fail("agensi-package FAILED", [`tag ${ref} points at ${commit.slice(0, 12)}, whose package.json says version "${taggedVersion}" — the tag is mislabelled`]);
}

const values = { __PROTO_FORGE_REF__: ref, __PROTO_FORGE_COMMIT__: commit, __PROTO_FORGE_VERSION__: version };

const entries = [];
for (const f of FILES) {
  if (!existsSync(f.from)) {
    errors.push(`${f.from} is missing`);
    continue;
  }
  const rendered = read(f.from).replace(TOKEN, (t) => values[t] ?? t);
  const leftover = [...new Set(rendered.match(TOKEN) ?? [])];
  if (leftover.length > 0) errors.push(`${f.from}: unknown token(s) ${leftover.join(", ")} — the package would ship a placeholder`);
  if (!TEXT.test(f.to)) errors.push(`${f.to}: not a text file type the marketplace serves to agents`);
  const data = Buffer.from(rendered, "utf8");
  if (f.script === true && data.length > LIMITS.scriptBytes) {
    errors.push(`${f.to} is ${data.length} bytes — over the marketplace's ${LIMITS.scriptBytes}-byte script limit`);
  }
  entries.push({ name: f.to, data, mode: f.mode, script: f.script === true });
}
if (errors.length > 0) fail("agensi-package FAILED", errors);

// The rendered SKILL.md must stand on its own as a skill.
const skill = entries.find((e) => e.name === `${SKILL_NAME}/SKILL.md`).data.toString("utf8");
const front = /^---\n([\s\S]*?)\n---\n/.exec(skill);
if (front === null) errors.push("SKILL.md has no frontmatter block");
else {
  const name = /^name:\s*(.+)$/m.exec(front[1])?.[1]?.trim();
  if (name !== SKILL_NAME) errors.push(`SKILL.md name is "${name}", but its folder is "${SKILL_NAME}" — the marketplace requires they match`);
  const descLine = /^description:\s*(.+)$/m.exec(front[1])?.[1]?.trim();
  if (descLine === undefined) errors.push("SKILL.md frontmatter has no description");
  else {
    let description;
    try {
      description = descLine.startsWith('"') ? JSON.parse(descLine) : descLine;
    } catch {
      errors.push("SKILL.md description is not a valid double-quoted string");
    }
    if (description !== undefined && (description.length < 60 || description.length > LIMITS.descriptionChars)) {
      errors.push(`SKILL.md description is ${description.length} chars — keep it between 60 and ${LIMITS.descriptionChars}`);
    }
  }
  if (!new RegExp(`^version:\\s*"${version.replace(/\./g, "\\.")}"$`, "m").test(front[1])) {
    errors.push(`SKILL.md frontmatter version does not state ${version}`);
  }
}
if (!skill.includes(ref) || !skill.includes(commit)) errors.push("SKILL.md does not disclose the pinned tag and commit");

// The script must at least parse — a package that cannot run is worse than none.
const scratch = mkdtempSync(join(tmpdir(), "proto-forge-agensi-"));
try {
  for (const e of entries.filter((x) => x.script)) {
    const p = join(scratch, "check.mjs");
    writeFileSync(p, e.data);
    const r = spawnSync(process.execPath, ["--check", p], { encoding: "utf8" });
    if (r.status !== 0) errors.push(`${e.name} does not parse: ${r.stderr.trim().split("\n").slice(0, 4).join(" | ")}`);
  }
} finally {
  rmSync(scratch, { recursive: true, force: true });
}

const chars = entries.reduce((n, e) => n + e.data.toString("utf8").length, 0);
if (entries.length > LIMITS.files) errors.push(`${entries.length} files — over the ${LIMITS.files}-file upload limit`);
if (chars > LIMITS.listingChars) errors.push(`${chars} characters — over the ${LIMITS.listingChars} served per listing`);

const archive = zip(entries);
if (archive.length > LIMITS.zipBytes) errors.push(`zip is ${archive.length} bytes — over ${LIMITS.zipBytes}`);
if (errors.length > 0) fail("agensi-package FAILED", errors);

const sha256 = createHash("sha256").update(archive).digest("hex");
if (opts.check) {
  ok(`agensi-package: ${ref} (${commit.slice(0, 12)}) renders cleanly — ${entries.length} files, ${archive.length} bytes, sha256 ${sha256}`);
} else {
  mkdirSync(opts.out, { recursive: true });
  const file = join(opts.out, `proto-forge-agensi-${ref}.zip`);
  writeFileSync(file, archive);
  writeFileSync(`${file}.sha256`, `${sha256}  proto-forge-agensi-${ref}.zip\n`);
  ok(`agensi-package: ${file} — ${ref} pinned to ${commit}, ${entries.length} files, ${archive.length} bytes, sha256 ${sha256}`);
}
