// @adr 203 - the shell's security posture is configuration under a gate (BR-37)
//
// The demo registers NO custom commands on purpose: every command is attack
// surface reachable from the WebView, so the shipped surface is zero and the
// capability file grants only core:default. shell:verify holds both still.
//
// The command + capability pattern, when a real feature needs the OS
// (each step is a reviewed diff — the gate makes the last one loud):
//
//   1. Define the command (serde derives the typed payload):
//
//        #[derive(serde::Serialize)]
//        struct Reply { answer: String }
//
//        #[tauri::command]
//        fn greet(name: String) -> Reply {
//            Reply { answer: format!("Hello, {name}!") }
//        }
//
//   2. Register it below:
//
//        tauri::Builder::default()
//            .invoke_handler(tauri::generate_handler![greet])
//
//   3. Grant it in src-tauri/capabilities/default.json
//      ("core:default" stays; the command rides the core IPC permission),
//      widen connect-src in tauri.conf.json for ipc: — and extend
//      ALLOWED_PERMISSIONS in scripts/shell-verify.mjs + write the ADR
//      for any plugin permission the feature pulls in.

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
