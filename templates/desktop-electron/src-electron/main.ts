// @adr 203 - the shell's security posture is configuration under a gate (BR-37)
//
// THE SECURITY CONTRACT. Every flag below is load-bearing and shell:verify
// holds each one to its literal safe value — a dynamic expression, a flipped
// boolean or a deleted line fails the build, not the review. The renderer is
// the web prototype and ONLY the web prototype: isolated world, OS sandbox, no
// Node, same-origin rules on, and the strict web CSP injected onto every
// response this session serves.
import { app, BrowserWindow, session } from "electron";
import path from "node:path";
import { pathToFileURL } from "node:url";

// The strict web CSP (docs/SECURITY.md) — byte-equal to the set the vite
// preview server sends, so the packaged WebView runs under the policy the
// gates measured. Widening it is a shell:verify gate edit plus an ADR.
const CSP =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; " +
  "img-src 'self' data:; connect-src 'self'; font-src 'self'; object-src 'none'; " +
  "base-uri 'self'; frame-ancestors 'none'";

// The app's own origin: the built bundle on disk. Navigation anywhere else —
// including anywhere https: — is refused; external content belongs in the OS
// browser, which the shell simply never opens on the page's behalf.
const APP_ROOT = pathToFileURL(path.join(__dirname, "..", "dist")).href;

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1100,
    height: 750,
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
      preload: path.join(__dirname, "preload.cjs"),
    },
  });
  void win.loadFile(path.join(__dirname, "..", "dist", "index.html"));
}

app.whenReady().then(() => {
  // CSP injection: the session serves file: responses without headers, so the
  // shell stamps the strict set onto every response itself — the same policy
  // index.html was verified under, now enforced by the runtime too.
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": [CSP],
      },
    });
  });
  createWindow();
});

// Navigation lock: every webContents this app ever creates refuses to leave
// the app origin, and no renderer can open a window (no popup ever becomes a
// second, unlocked shell). The `remote` module does not exist in this Electron
// and nothing here re-enables its successor patterns.
app.on("web-contents-created", (_event, contents) => {
  contents.on("will-navigate", (event, url) => {
    if (!url.startsWith(APP_ROOT)) event.preventDefault();
  });
  contents.setWindowOpenHandler(() => ({ action: "deny" }));
});

app.on("window-all-closed", () => {
  app.quit();
});
