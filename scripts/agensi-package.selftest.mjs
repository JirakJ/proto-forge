import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { createHash } from "node:crypto";
import { inflateRawSync, crc32 } from "node:zlib";
import { fail, ok } from "./lib.mjs";

// agensi-package needs a real git history (it pins a tag to its commit), which the
// shared expect() fixture cannot provide, so this suite builds its own repos. Every
// case runs the shipped templates from distribution/agensi/ unless it breaks one on
// purpose, so a green suite says the REAL package renders, not a stand-in.

const ROOT = resolve(dirname(new URL(import.meta.url).pathname), "..");
const SCRIPT = join(ROOT, "scripts", "agensi-package.mjs");
const failures = [];
let cases = 0;

function sh(cwd, cmd, args) {
  const r = spawnSync(cmd, args, { cwd, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(" ")}: ${r.stderr}`);
  return r.stdout.trim();
}

function repo({ version = "1.2.3", tag = "v1.2.3", tagVersion = version, edit = () => {} } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "proto-forge-agensi-selftest-"));
  mkdirSync(join(dir, "scripts"), { recursive: true });
  cpSync(join(ROOT, "scripts", "lib.mjs"), join(dir, "scripts", "lib.mjs"));
  cpSync(SCRIPT, join(dir, "scripts", "agensi-package.mjs"));
  cpSync(join(ROOT, "distribution"), join(dir, "distribution"), { recursive: true });
  edit(dir);
  const git = (...a) => sh(dir, "git", a);
  git("init", "-q", "-b", "main");
  git("config", "user.email", "selftest@proto-forge.invalid");
  git("config", "user.name", "selftest");
  git("config", "commit.gpgsign", "false");
  git("config", "tag.gpgsign", "false");
  writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "proto-forge", version: tagVersion }));
  git("add", "-A");
  git("commit", "-q", "-m", "release");
  if (tag !== null) git("tag", tag);
  if (tagVersion !== version) {
    writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "proto-forge", version }));
    git("commit", "-q", "-am", "bump");
  }
  return { dir, commit: git("rev-list", "-n", "1", "HEAD~0") };
}

function run(dir, args = []) {
  const r = spawnSync(process.execPath, [join(dir, "scripts", "agensi-package.mjs"), ...args], { cwd: dir, encoding: "utf8" });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
}

/** Reads a ZIP the way an extractor does: central directory first, CRC-checked. */
function unzip(buf) {
  const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd === -1) throw new Error("no end-of-central-directory record");
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const files = new Map();
  for (let i = 0; i < count; i += 1) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error("bad central directory entry");
    const crc = buf.readUInt32LE(p + 16);
    const csize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const mode = (buf.readUInt32LE(p + 38) >>> 16) & 0o777;
    const local = buf.readUInt32LE(p + 42);
    const name = buf.subarray(p + 46, p + 46 + nameLen).toString("utf8");
    const lNameLen = buf.readUInt16LE(local + 26);
    const lExtraLen = buf.readUInt16LE(local + 28);
    const start = local + 30 + lNameLen + lExtraLen;
    const data = inflateRawSync(buf.subarray(start, start + csize));
    if (crc32(data) !== crc) throw new Error(`${name}: CRC mismatch`);
    files.set(name, { data: data.toString("utf8"), mode });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return files;
}

function check(name, build, assert) {
  cases += 1;
  let fixture;
  try {
    fixture = build();
    assert(fixture);
  } catch (error) {
    failures.push(`${name}: ${error.message}`);
  } finally {
    if (fixture !== undefined) rmSync(fixture.dir, { recursive: true, force: true });
  }
}

const must = (cond, msg) => {
  if (!cond) throw new Error(msg);
};

check(
  "agensi-package: the shipped templates render a two-file package pinned to the tag's commit",
  () => repo(),
  ({ dir, commit }) => {
    const r = run(dir);
    must(r.code === 0, `expected PASS, got ${r.out}`);
    const zipPath = join(dir, "dist", "agensi", "proto-forge-agensi-v1.2.3.zip");
    must(existsSync(zipPath), "no zip written");
    const files = unzip(readFileSync(zipPath));
    must(
      JSON.stringify([...files.keys()]) === JSON.stringify(["proto-forge/SKILL.md", "proto-forge/scripts/bootstrap.mjs"]),
      `unexpected entries ${[...files.keys()]}`,
    );
    const skill = files.get("proto-forge/SKILL.md").data;
    const script = files.get("proto-forge/scripts/bootstrap.mjs");
    must(/^name: proto-forge$/m.test(skill) && /^version: "1\.2\.3"$/m.test(skill), "SKILL.md frontmatter not stamped");
    must(skill.includes(commit) && script.data.includes(`const COMMIT = "${commit}";`), "commit not stamped");
    must(script.data.includes('const REF = "v1.2.3";'), "ref not stamped");
    must(!/__PROTO_FORGE_[A-Z_]+__/.test(skill + script.data), "a token survived rendering");
    must(script.mode === 0o755, `bootstrap mode is ${script.mode.toString(8)}, expected 755`);
    const sha = readFileSync(`${zipPath}.sha256`, "utf8").split(" ")[0];
    must(sha === createHash("sha256").update(readFileSync(zipPath)).digest("hex"), "sha256 file disagrees with the zip");
  },
);

check(
  "agensi-package: two runs produce byte-identical zips",
  () => repo(),
  ({ dir }) => {
    must(run(dir, ["--out", "a"]).code === 0 && run(dir, ["--out", "b"]).code === 0, "a run failed");
    must(
      readFileSync(join(dir, "a", "proto-forge-agensi-v1.2.3.zip")).equals(readFileSync(join(dir, "b", "proto-forge-agensi-v1.2.3.zip"))),
      "the archive is not deterministic",
    );
  },
);

check(
  "agensi-package: --check validates without writing",
  () => repo(),
  ({ dir }) => {
    const r = run(dir, ["--check"]);
    must(r.code === 0 && /renders cleanly/.test(r.out), `expected PASS, got ${r.out}`);
    must(!existsSync(join(dir, "dist")), "--check wrote output");
  },
);

check(
  "agensi-package: a release that was never tagged fails",
  () => repo({ tag: null }),
  ({ dir }) => {
    const r = run(dir);
    must(r.code !== 0 && /does not exist/.test(r.out), `expected a missing-tag failure, got ${r.out}`);
  },
);

check(
  "agensi-package: a tag whose own package.json disagrees with its name fails",
  () => repo({ tag: "v1.2.3", tagVersion: "1.2.2", version: "1.2.3" }),
  ({ dir }) => {
    const r = run(dir);
    must(r.code !== 0 && /mislabelled/.test(r.out), `expected a mislabelled-tag failure, got ${r.out}`);
  },
);

check(
  "agensi-package: an unknown token in a template fails instead of shipping a placeholder",
  () =>
    repo({
      edit: (dir) => {
        const p = join(dir, "distribution", "agensi", "SKILL.template.md");
        writeFileSync(p, `${readFileSync(p, "utf8")}\nSee __PROTO_FORGE_HOMEPAGE__.\n`);
      },
    }),
  ({ dir }) => {
    const r = run(dir);
    must(r.code !== 0 && /__PROTO_FORGE_HOMEPAGE__/.test(r.out), `expected an unknown-token failure, got ${r.out}`);
  },
);

check(
  "agensi-package: a bootstrap over the marketplace's 20 KB script limit fails",
  () =>
    repo({
      edit: (dir) => {
        const p = join(dir, "distribution", "agensi", "bootstrap.template.mjs");
        writeFileSync(p, `${readFileSync(p, "utf8")}\n// ${"x".repeat(21 * 1024)}\n`);
      },
    }),
  ({ dir }) => {
    const r = run(dir);
    must(r.code !== 0 && /script limit/.test(r.out), `expected a size failure, got ${r.out}`);
  },
);

check(
  "agensi-package: a bootstrap that does not parse fails",
  () =>
    repo({
      edit: (dir) => {
        const p = join(dir, "distribution", "agensi", "bootstrap.template.mjs");
        writeFileSync(p, `${readFileSync(p, "utf8")}\nconst = ;\n`);
      },
    }),
  ({ dir }) => {
    const r = run(dir);
    must(r.code !== 0 && /does not parse/.test(r.out), `expected a parse failure, got ${r.out}`);
  },
);

check(
  "agensi-package: a SKILL.md whose name disagrees with its folder fails",
  () =>
    repo({
      edit: (dir) => {
        const p = join(dir, "distribution", "agensi", "SKILL.template.md");
        writeFileSync(p, readFileSync(p, "utf8").replace(/^name: proto-forge$/m, "name: protoforge"));
      },
    }),
  ({ dir }) => {
    const r = run(dir);
    must(r.code !== 0 && /requires they match/.test(r.out), `expected a name failure, got ${r.out}`);
  },
);

if (failures.length > 0) fail(`agensi-package selftest FAILED (${failures.length}/${cases})`, failures);
ok(`agensi-package selftest: ${cases} cases, the package gate rejects what it claims to`);
