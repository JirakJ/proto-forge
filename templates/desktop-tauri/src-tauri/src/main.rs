// @adr 203 - the desktop shell is a thin, permissionless window over the web app (BR-37)
// Prevent an extra console window on Windows in release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    proto_forge_desktop_lib::run()
}
