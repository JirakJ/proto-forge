import { existsSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { read, note, ok } from "./lib.mjs";
import { gateResult, today } from "./config.mjs";

// @adr 203 - the shell's security posture is configuration under a gate (BR-37)
//
// A desktop shell is one configuration surface away from disabling every web
// security control the rest of verify proves. This gate holds that surface
// still: the WebView's CSP is byte-equal to the strict web set, the Tauri
// capability files grant nothing beyond the explicit allowlist BELOW (so a new
// permission is a reviewed gate edit plus an ADR, never a config drive-by),
// the updater is disabled or fully pinned, and the shell toolchain is pinned
// exactly (NFR-11: Cargo.lock committed, versions exact).
//
// Two halves, the deploy:verify/gitleaks precedent:
//   native — pure file checks, always on, no tool and no socket (NFR-16)
//   tool   — `cargo check --locked` when cargo is installed; a loud note when
//            it is not (CI installs the pinned rust toolchain, so CI enforces)

const CONF = "src-tauri/tauri.conf.json";
const CAPS_DIR = "src-tauri/capabilities";
const CARGO_TOML = "src-tauri/Cargo.toml";
const CARGO_LOCK = "src-tauri/Cargo.lock";
const TOOLCHAIN = "src-tauri/rust-toolchain.toml";

// The strict web CSP (docs/SECURITY.md; the preview server sets the same set).
// The shell must ship the SAME policy — a WebView is not a reason to relax.
// Note for a real IPC consumer: `invoke()` needs `ipc:` / `http://ipc.localhost`
// in connect-src — that widening is a gate edit here plus an ADR, by design.
const STRICT_CSP =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; " +
  "img-src 'self' data:; connect-src 'self'; font-src 'self'; object-src 'none'; " +
  "base-uri 'self'; frame-ancestors 'none'";

// THE permission allowlist (BR-37). Every permission any capability file grants
// must be listed here. Widening this list is a gate edit + ADR — the diff the
// review sees is the diff the attack surface grows by.
const ALLOWED_PERMISSIONS = ["core:default"];

// The template's own identifier. A generated app must rename it; known
// upstream placeholders are rejected outright.
const TEMPLATE_IDENTIFIER = "com.proto-forge.prototype";
const PLACEHOLDER_IDENTIFIERS = ["com.tauri.dev", "com.example.app", ""];

const errors = [];

// --- tauri.conf.json: parse, CSP, updater, identifier --------------------------
let conf = null;
if (!existsSync(CONF)) {
  errors.push(`${CONF} does not exist — the shell configuration is the delivery surface`);
} else {
  try {
    conf = JSON.parse(read(CONF));
  } catch (e) {
    errors.push(`${CONF} is not parseable JSON — ${e.message}`);
  }
}

if (conf !== null) {
  const csp = conf.app?.security?.csp;
  if (typeof csp !== "string" || csp === "") {
    errors.push(`${CONF}: app.security.csp is missing — the shell must ship the strict web CSP, not the platform default`);
  } else if (csp !== STRICT_CSP) {
    errors.push(
      `${CONF}: app.security.csp differs from the documented strict CSP set — ` +
        `expected exactly: ${STRICT_CSP}`,
    );
  }

  // Updater posture: artifacts off, or a fully pinned pubkey + https endpoints.
  const updaterArtifacts = conf.bundle?.createUpdaterArtifacts === true;
  const updater = conf.plugins?.updater;
  const pinned =
    updater !== undefined &&
    typeof updater.pubkey === "string" &&
    updater.pubkey !== "" &&
    Array.isArray(updater.endpoints) &&
    updater.endpoints.length > 0 &&
    updater.endpoints.every((u) => typeof u === "string" && u.startsWith("https://"));
  if ((updaterArtifacts || updater !== undefined) && !pinned) {
    errors.push(
      `${CONF}: the updater is neither disabled nor pinned — either keep bundle.createUpdaterArtifacts false ` +
        "with no plugins.updater block, or pin plugins.updater.pubkey AND https-only endpoints (docs/DELIVERY.md)",
    );
  }

  const id = conf.identifier ?? "";
  if (PLACEHOLDER_IDENTIFIERS.includes(id)) {
    errors.push(`${CONF}: identifier ${JSON.stringify(id)} is a placeholder — a desktop app signs and updates under its identifier; name it`);
  } else if (id === TEMPLATE_IDENTIFIER) {
    note(`shell: identifier is the template's own (${TEMPLATE_IDENTIFIER}) — allowed in the template, a generated app names its own`);
  }
}

// --- capabilities: every granted permission is on the explicit allowlist -------
if (!existsSync(CAPS_DIR)) {
  errors.push(`${CAPS_DIR}/ does not exist — the capability files ARE the permission surface; an implicit surface is not a surface`);
} else {
  for (const f of readdirSync(CAPS_DIR).filter((n) => n.endsWith(".json")).sort()) {
    const path = join(CAPS_DIR, f);
    let cap = null;
    try {
      cap = JSON.parse(read(path));
    } catch (e) {
      errors.push(`${path} is not parseable JSON — ${e.message}`);
      continue;
    }
    for (const p of cap.permissions ?? []) {
      const name = typeof p === "string" ? p : (p?.identifier ?? JSON.stringify(p));
      if (!ALLOWED_PERMISSIONS.includes(name)) {
        errors.push(
          `${path}: permission "${name}" is not on the shell allowlist — a new permission is a gate edit + ADR: ` +
            "extend ALLOWED_PERMISSIONS in scripts/shell-verify.mjs and record why the surface grows",
        );
      }
    }
  }
}

// --- toolchain pins (NFR-11) ---------------------------------------------------
// The compiler is pinned the way the crates are: an exact channel in
// rust-toolchain.toml, which rustup honours locally and CI installs verbatim.
// "stable" is not a version — it is whatever today resolves to.
if (!existsSync(TOOLCHAIN)) {
  errors.push(`${TOOLCHAIN} does not exist — the Rust compiler is pinned exactly, in the tree, like every other version (NFR-11)`);
} else {
  const channel = /^channel\s*=\s*"([^"]*)"/m.exec(read(TOOLCHAIN))?.[1];
  if (channel === undefined) {
    errors.push(`${TOOLCHAIN}: no [toolchain] channel`);
  } else if (!/^\d+\.\d+\.\d+$/.test(channel)) {
    errors.push(`${TOOLCHAIN}: channel ${JSON.stringify(channel)} is not an exact X.Y.Z version — "stable" and "nightly" float (NFR-11)`);
  }
}

if (!existsSync(CARGO_LOCK)) {
  errors.push(`${CARGO_LOCK} does not exist — the committed lockfile is the reproducibility contract (NFR-11)`);
}

const EXACT = /^=?\d+\.\d+\.\d+$/;
if (!existsSync(CARGO_TOML)) {
  errors.push(`${CARGO_TOML} does not exist`);
} else {
  const toml = read(CARGO_TOML);
  for (const crate of ["tauri", "tauri-build"]) {
    const m = new RegExp(`^${crate}\\s*=\\s*(?:"([^"]*)"|\\{[^}]*version\\s*=\\s*"([^"]*)")`, "m").exec(toml);
    const version = m === null ? null : (m[1] ?? m[2]);
    if (version === null) {
      errors.push(`${CARGO_TOML}: no ${crate} dependency found — the shell rides on it`);
    } else if (!EXACT.test(version)) {
      errors.push(`${CARGO_TOML}: ${crate} version ${JSON.stringify(version)} is not pinned exact (X.Y.Z) — an unpinned shell dependency is an unpinned attack surface (NFR-11)`);
    }
  }
}

// --- the RUSTSEC ignore ledger: triaged, reasoned, expiring --------------------
// src-tauri/audit.toml is cargo-audit's ignore list for the advisories the
// tauri 2 linux GTK stack cannot shed (ADR 203, docs/SECURITY.md). The
// .trivyignore discipline applies verbatim: every entry carries
// `# reason: … until: YYYY-MM-DD`, and an undated, unreasoned or expired entry
// fails — a suppression is a triaged decision that ends by itself.
const AUDIT_TOML = "src-tauri/audit.toml";
const OSV_TOML = "src-tauri/osv-scanner.toml";
const ledger = [];
if (existsSync(AUDIT_TOML)) {
  const now = today();
  for (const line of read(AUDIT_TOML).split("\n")) {
    const id = /^\s*"(RUSTSEC-[0-9]{4}-[0-9]+)"/.exec(line)?.[1];
    if (id === undefined) continue;
    const m = /# reason: (.+?) until: (\d{4}-\d{2}-\d{2})\s*$/.exec(line);
    if (m === null) {
      errors.push(`${AUDIT_TOML}: ${id} has no "# reason: … until: YYYY-MM-DD" — an unreasoned suppression is a hole, not a triage`);
    } else if (m[2] < now) {
      errors.push(`${AUDIT_TOML}: ${id} expired on ${m[2]} — re-review it against the current tauri stack or remove it`);
    } else {
      ledger.push({ id, reason: m[1], until: m[2] });
    }
  }
}

// --- the same ledger, in the dialect every other scanner reads -----------------
// cargo-audit reads audit.toml and nothing else does. osv-scanner — what CI, the
// SBOM path and most host-level guardrails actually run — reads osv-scanner.toml
// and never learns of the triage above, so the SAME advisory reads "suppressed
// with a reason and an end date" to one tool and "unanswered finding" to the
// next. A triage a scanner cannot see is not a triage.
//
// So osv-scanner.toml is DERIVED, never authored: audit.toml stays the single
// source (BR-15), this renders it, and the gate re-renders and compares the way
// snapshot:diff does. The two cannot drift, because disagreeing is the failure.
// Regenerate with `pnpm osv:ignores` after editing audit.toml.
const renderOsvIgnores = (entries) =>
  [
    "# GENERATED from src-tauri/audit.toml by `pnpm osv:ignores` — do not edit.",
    "# audit.toml is the single source of the triage ledger; shell:verify fails on drift.",
    "",
    ...entries.flatMap((e) => [
      "[[IgnoredVulns]]",
      `id = ${JSON.stringify(e.id)}`,
      // A bare TOML local-date, which is what osv-scanner expects here. The date
      // is audit.toml's `until:`, so a suppression expires in both tools at once.
      `ignoreUntil = ${e.until}`,
      `reason = ${JSON.stringify(e.reason)}`,
      "",
    ]),
  ].join("\n");

if (process.argv.includes("--write-osv-ignores")) {
  if (errors.length > 0) {
    process.stderr.write(`✗ ${AUDIT_TOML} is not valid, so nothing was written:\n${errors.map((e) => `  - ${e}`).join("\n")}\n`);
    process.exit(1);
  }
  writeFileSync(OSV_TOML, renderOsvIgnores(ledger));
  ok(`shell: wrote ${OSV_TOML} — ${ledger.length} triaged advisory suppression(s) derived from ${AUDIT_TOML}`);
  process.exit(0);
}

if (existsSync(AUDIT_TOML) && errors.length === 0) {
  const expected = renderOsvIgnores(ledger);
  if (!existsSync(OSV_TOML)) {
    errors.push(`${OSV_TOML} is missing — the triage in ${AUDIT_TOML} is invisible to osv-scanner. Run \`pnpm osv:ignores\``);
  } else if (read(OSV_TOML) !== expected) {
    errors.push(`${OSV_TOML} disagrees with ${AUDIT_TOML} — one scanner would see a suppression the other does not. Run \`pnpm osv:ignores\``);
  }
}

const pkg = existsSync("package.json") ? JSON.parse(read("package.json")) : {};
const cli = pkg.devDependencies?.["@tauri-apps/cli"];
if (cli === undefined) {
  errors.push('package.json: devDependencies["@tauri-apps/cli"] is missing — packaging must ride a pinned CLI, never a global');
} else if (!/^\d+\.\d+\.\d+$/.test(cli)) {
  errors.push(`package.json: @tauri-apps/cli ${JSON.stringify(cli)} is not pinned exact — an unpinned shell dependency is an unpinned attack surface (NFR-11)`);
}

// --- tool half: cargo check, enforced when the toolchain is present ------------
// The gitleaks pattern: enforced when installed (always, in CI — verify.yml
// installs the pinned toolchain), one loud note otherwise. `cargo check` builds
// nothing and packages nothing — packaging stays a CI stage (NFR-16).
if (errors.length === 0) {
  const cargoPresent = spawnSync("cargo", ["--version"], { encoding: "utf8" }).status === 0;
  if (!cargoPresent) {
    note("shell: cargo not installed — skipping the compile check locally (CI enforces the rust toolchain; `brew install rustup` to enforce here — rustup reads the channel from src-tauri/rust-toolchain.toml)");
  } else {
    const r = spawnSync("cargo", ["check", "--locked", "--quiet"], { cwd: "src-tauri", encoding: "utf8" });
    if (r.status !== 0) {
      const tail = `${r.stdout ?? ""}${r.stderr ?? ""}`.split("\n").slice(-25).join("\n");
      errors.push(`cargo check --locked failed in src-tauri/ — the committed shell does not compile against its lockfile:\n${tail}`);
    }
  }
}

gateResult(
  "shell",
  "shell:verify: strict CSP in place, capabilities on the explicit allowlist, updater disabled, toolchain pinned (Cargo.lock committed)",
  errors,
);
