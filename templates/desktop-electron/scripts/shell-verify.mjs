import { existsSync } from "node:fs";
import { parse as parseYaml } from "yaml";
import { read, note } from "./lib.mjs";
import { gateResult } from "./config.mjs";

// @adr 203 - the shell's security posture is configuration under a gate (BR-37)
//
// An Electron shell is five booleans away from handing the renderer a Node
// runtime. This gate reads src-electron/ MECHANICALLY — the opid-scan/testid
// pattern: regex over comment-stripped source, no evaluation — and holds the
// contract still: the five security flags at their literal safe values with no
// dynamic override, the strict web CSP injected on every response, navigation
// locked to the app origin, the preload exposing only through contextBridge,
// and the packager configuration (asar on, publish disabled) with every shell
// dependency pinned exact (NFR-11).
//
// Fully static on purpose (NFR-16): verify needs the SOURCES, never the
// electron binary — no download, no launch, no packaging. The packaged app is
// the packaging stage's business (docs/DELIVERY.md, ADR 203).

const MAIN = "src-electron/main.ts";
const PRELOAD = "src-electron/preload.ts";
const BUILDER = "electron-builder.yml";

// The strict web CSP (docs/SECURITY.md; the preview server sets the same set).
const STRICT_CSP =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; " +
  "img-src 'self' data:; connect-src 'self'; font-src 'self'; object-src 'none'; " +
  "base-uri 'self'; frame-ancestors 'none'";

// THE SECURITY CONTRACT: flag → the only value that may appear, anywhere.
const SECURITY_FLAGS = {
  contextIsolation: "true",
  sandbox: "true",
  nodeIntegration: "false",
  webSecurity: "true",
  allowRunningInsecureContent: "false",
};

const TEMPLATE_APP_ID = "com.proto-forge.prototype";
const PLACEHOLDER_APP_IDS = ["com.example.app", "com.electron.app", ""];

const errors = [];

// Comments must not satisfy (or trip) a mechanical check: strip them, keeping
// string bodies intact enough for the marker searches below.
const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

// --- main.ts: the five flags, the CSP injection, the navigation lock -----------
if (!existsSync(MAIN)) {
  errors.push(`${MAIN} does not exist — the shell main process IS the delivery surface`);
} else {
  const raw = read(MAIN);
  const main = stripComments(raw);

  for (const [flag, safe] of Object.entries(SECURITY_FLAGS)) {
    const occurrences = [...main.matchAll(new RegExp(`${flag}\\s*:\\s*([A-Za-z0-9_.!()\\[\\]"'\`]+)`, "g"))].map((m) => m[1].replace(/,$/, ""));
    if (occurrences.length === 0) {
      errors.push(`${MAIN}: ${flag} is not set — the contract requires the literal \`${flag}: ${safe}\` (BR-37)`);
      continue;
    }
    for (const value of occurrences) {
      if (value !== safe) {
        errors.push(
          `${MAIN}: ${flag} is \`${value}\` — the contract requires the literal \`${safe}\`, ` +
            "and a dynamic or flipped value is exactly the drive-by this gate exists to stop",
        );
      }
    }
  }

  // The constant may be a concatenation of string literals; normalising away
  // quotes, plus signs and whitespace compares the POLICY, not the formatting.
  const flat = (s) => s.replace(/["'+\s]/g, "");
  if (!flat(raw).includes(flat(STRICT_CSP))) {
    errors.push(`${MAIN}: the strict CSP set is missing or differs — the shell must carry exactly: ${STRICT_CSP}`);
  }
  if (!main.includes("onHeadersReceived") || !main.includes("Content-Security-Policy")) {
    errors.push(`${MAIN}: no CSP header injection — session.defaultSession.webRequest.onHeadersReceived must stamp Content-Security-Policy onto every response`);
  }

  if (!main.includes("will-navigate") || !main.includes("setWindowOpenHandler")) {
    errors.push(`${MAIN}: the navigation lock is incomplete — both a will-navigate guard and setWindowOpenHandler must pin the window to the app origin`);
  }
}

// --- preload.ts: contextBridge or nothing --------------------------------------
if (!existsSync(PRELOAD)) {
  errors.push(`${PRELOAD} does not exist — the (empty) bridge is part of the contract`);
} else {
  const preload = stripComments(read(PRELOAD));
  if (/window\.[A-Za-z_$][\w$]*\s*=/.test(preload)) {
    errors.push(`${PRELOAD}: a bare \`window.…=\` assignment bypasses the isolated world — the only legal door is contextBridge.exposeInMainWorld`);
  }
  if (preload.includes("exposeInMainWorld") && !/import\s*\{[^}]*contextBridge[^}]*\}\s*from\s*["']electron["']/.test(preload)) {
    errors.push(`${PRELOAD}: exposeInMainWorld without importing contextBridge from electron — expose only through the bridge`);
  }
}

// --- electron-builder.yml: asar on, publish disabled ---------------------------
if (!existsSync(BUILDER)) {
  errors.push(`${BUILDER} does not exist — the packager configuration is part of the gated surface`);
} else {
  let builder = null;
  try {
    builder = parseYaml(read(BUILDER));
  } catch (e) {
    errors.push(`${BUILDER} is not parseable YAML — ${e.message}`);
  }
  if (builder !== null) {
    if (builder.asar !== true) {
      errors.push(`${BUILDER}: asar must be true — shipping loose sources invites in-place tampering of the packaged app`);
    }
    if (!("publish" in builder) || builder.publish !== null) {
      errors.push(
        `${BUILDER}: publish must be declared and null — the update feed is deliberately disabled; ` +
          "enabling electron-updater is a reviewed sequence (docs/DELIVERY.md), never a default",
      );
    }
    const appId = builder.appId ?? "";
    if (PLACEHOLDER_APP_IDS.includes(appId)) {
      errors.push(`${BUILDER}: appId ${JSON.stringify(appId)} is a placeholder — a desktop app signs and updates under its identifier; name it`);
    } else if (appId === TEMPLATE_APP_ID) {
      note(`shell: appId is the template's own (${TEMPLATE_APP_ID}) — allowed in the template, a generated app names its own`);
    }
  }
}

// --- toolchain pins (NFR-11) ---------------------------------------------------
const pkg = existsSync("package.json") ? JSON.parse(read("package.json")) : {};
for (const dep of ["electron", "electron-builder"]) {
  const version = pkg.devDependencies?.[dep];
  if (version === undefined) {
    errors.push(`package.json: devDependencies["${dep}"] is missing — the shell rides on it, pinned, never global`);
  } else if (!/^\d+\.\d+\.\d+$/.test(version)) {
    errors.push(`package.json: ${dep} ${JSON.stringify(version)} is not pinned exact — an unpinned shell dependency is an unpinned attack surface (NFR-11)`);
  }
}
if (typeof pkg.main !== "string" || !pkg.main.startsWith("dist-electron/")) {
  errors.push(`package.json: "main" must point at the built shell under dist-electron/ — got ${JSON.stringify(pkg.main)}`);
}

gateResult(
  "shell",
  "shell:verify: isolation contract literal and unoverridden, strict CSP injected, navigation locked, bridge empty, packager pinned (asar on, publish disabled)",
  errors,
);
