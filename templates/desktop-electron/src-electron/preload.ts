// @adr 203 - the preload exposes NOTHING (BR-37)
//
// The demo needs no native capability, so the bridge is empty on purpose: the
// renderer is the web prototype, full stop. shell:verify enforces the shape —
// a bare `window.foo = …` assignment in this file fails the build; the ONLY
// legal door is contextBridge, which keeps the isolated worlds isolated.
//
// The typed-bridge pattern, when a real feature needs one
// (each step is a reviewed diff — the gate makes the wrong shortcut loud):
//
//   import { contextBridge, ipcRenderer } from "electron";
//
//   const desktopApi = {
//     platform: process.platform,
//     readClipboard: (): Promise<string> => ipcRenderer.invoke("clipboard:read"),
//   } as const;
//
//   contextBridge.exposeInMainWorld("desktop", desktopApi);
//
//   // …and in the renderer, type the door you opened:
//   // declare global { interface Window { desktop: typeof desktopApi } }
//
// The main process half registers the matching ipcMain.handle("clipboard:read")
// — and the ADR records why the surface grew.

export {};
