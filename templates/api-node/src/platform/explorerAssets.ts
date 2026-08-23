// @adr 008 - the served contract explorer's static assets (BR-47)
//
// Owned and self-contained: no external stylesheet, script or font — the page
// works air-gapped and under the strict CSP registerDocs sets (script-src
// 'self', style-src 'self', connect-src 'self'). The client renders the SAME
// committed artefacts the repository pins (/openapi.json and the captured
// BR-26 examples), so the explorer cannot disagree with the contract.

export const EXPLORER_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>API explorer</title>
<link rel="stylesheet" href="/docs/styles.css">
</head>
<body>
<header><h1 id="title">API explorer</h1><p id="version"></p></header>
<main id="operations"><p>Loading the committed contract…</p></main>
<script src="/docs/app.js"></script>
</body>
</html>
`;

export const EXPLORER_CSS = `:root { color-scheme: light dark;
  --ink: #1d2229; --paper: #ffffff; --line: #d6dbe1; --dim: #5b6572; --accent: #0b5fff; }
@media (prefers-color-scheme: dark) {
  :root { --ink: #e6e9ed; --paper: #14171b; --line: #333a42; --dim: #9aa4af; --accent: #6ea3ff; } }
* { box-sizing: border-box; }
body { margin: 0 auto; max-width: 60rem; padding: 1rem 1.25rem 4rem;
  font: 15px/1.5 system-ui, sans-serif; color: var(--ink); background: var(--paper); }
header { border-bottom: 2px solid var(--line); padding-bottom: .5rem; }
h1 { margin: .25rem 0; font-size: 1.4rem; }
#version { margin: 0 0 .5rem; color: var(--dim); }
article { border: 1px solid var(--line); border-radius: 8px; margin: 1.25rem 0; padding: 0 1rem 1rem; }
article > h2 { font-size: 1.05rem; font-family: ui-monospace, monospace; }
.method { display: inline-block; min-width: 4.2em; text-align: center; margin-right: .5em;
  padding: .1em .45em; border-radius: 5px; color: #fff; background: var(--accent); font-size: .8em; }
.method-delete { background: #c22f2f; }
.method-post { background: #1e7f3c; }
.summary { color: var(--dim); margin-top: -.4rem; }
h3 { font-size: .85rem; text-transform: uppercase; letter-spacing: .04em; color: var(--dim);
  margin: 1rem 0 .35rem; }
table { border-collapse: collapse; width: 100%; }
td, th { border: 1px solid var(--line); padding: .3rem .55rem; text-align: left; font-size: .9em; }
pre { background: color-mix(in srgb, var(--line) 28%, var(--paper)); border: 1px solid var(--line);
  border-radius: 6px; padding: .6rem .8rem; overflow-x: auto; font-size: .85em; }
code { font-family: ui-monospace, monospace; }
.problem { display: inline-block; border: 1px solid var(--line); border-radius: 5px;
  padding: .05em .5em; margin: 0 .35em .35em 0; font-family: ui-monospace, monospace; font-size: .85em; }
details { margin: .5rem 0; }
summary { cursor: pointer; color: var(--accent); }
`;

export const EXPLORER_JS = `"use strict";
const esc = (v) => String(v).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const pretty = (v) => esc(JSON.stringify(v, null, 2));

function paramRows(parameters) {
  if (!parameters || parameters.length === 0) return "";
  const rows = parameters.map((p) =>
    "<tr><td><code>" + esc(p.name) + "</code></td><td>" + esc(p.in) + "</td><td>" +
    (p.required ? "yes" : "no") + "</td><td><code>" + esc(JSON.stringify(p.schema)) + "</code></td></tr>").join("");
  return "<h3>Parameters</h3><table><tr><th>name</th><th>in</th><th>required</th><th>schema</th></tr>" + rows + "</table>";
}

function responseRows(responses) {
  const rows = Object.entries(responses || {}).map(([status, r]) =>
    "<tr><td><code>" + esc(status) + "</code></td><td>" + esc(r.description || "") + "</td></tr>").join("");
  return "<h3>Responses</h3><table><tr><th>status</th><th>description</th></tr>" + rows + "</table>";
}

function curlFor(example, method, path) {
  const req = example.request;
  const url = window.location.origin + (req.path || path);
  let cmd = "curl -X " + method.toUpperCase() + " '" + url + "'";
  if (req.body !== undefined) cmd += " -H 'content-type: application/json' -d '" + JSON.stringify(req.body) + "'";
  return cmd;
}

function exampleBlocks(examples, method, path) {
  if (!examples || examples.length === 0) return "";
  const blocks = examples.map((ex) =>
    "<details><summary>" + esc(ex.note || (ex.request.method + " " + ex.request.path)) + "</summary>" +
    "<h3>Usage</h3><pre><code>" + esc(curlFor(ex, method, path)) + "</code></pre>" +
    "<h3>Response " + esc(ex.response.status) + "</h3><pre><code>" + pretty(ex.response.body) + "</code></pre>" +
    "</details>").join("");
  return "<h3>Captured examples</h3>" + blocks;
}

function operationCard(path, method, op, examples) {
  const body = op.requestBody
    ? "<h3>Request body</h3><pre><code>" + pretty(op.requestBody.content["application/json"].schema) + "</code></pre>"
    : "";
  return "<article id='" + esc(op.operationId) + "'>" +
    "<h2><span class='method method-" + method + "'>" + method.toUpperCase() + "</span><code>" + esc(path) + "</code></h2>" +
    "<p class='summary'>" + esc(op.summary || "") + " <code>(" + esc(op.operationId) + ")</code></p>" +
    paramRows(op.parameters) + body + responseRows(op.responses) +
    exampleBlocks(examples[op.operationId], method, path) + "</article>";
}

async function main() {
  const [specRes, exampleRes] = await Promise.all([fetch("/openapi.json"), fetch("/docs/examples.json")]);
  const spec = await specRes.json();
  const examples = await exampleRes.json();
  document.getElementById("title").textContent = spec.info.title;
  document.getElementById("version").textContent =
    "contract " + spec.info.version + " — served from the committed openapi.json";
  const cards = [];
  for (const [path, ops] of Object.entries(spec.paths || {})) {
    for (const [method, op] of Object.entries(ops)) cards.push(operationCard(path, method, op, examples));
  }
  document.getElementById("operations").innerHTML = cards.join("");
}
main().catch((error) => {
  document.getElementById("operations").textContent = "Failed to load the contract: " + error;
});
`;
