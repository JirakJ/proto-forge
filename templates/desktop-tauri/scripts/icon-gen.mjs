import { writeFileSync, rmSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { spawnSync } from "node:child_process";
import { fail, ok } from "./lib.mjs";

// @adr 203 - placeholder icon set, regenerated deterministically (notAGate)
//
// `pnpm icons:gen` rebuilds src-tauri/icons/ from a PNG this script derives —
// no binary source asset to lose, no drawing tool required. A real product
// replaces the derived PNG with its own 1024x1024 artwork and reruns the same
// command; the pinned @tauri-apps/cli does the per-OS conversion (icns/ico/png).

const SIZE = 1024;
const SOURCE = "src-tauri/icon-source.png";

// --- a minimal PNG encoder (truecolor, deterministic) --------------------------
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
};

// The artwork: a dark slate field with a centred sky square — the proto-forge
// placeholder mark. Pure arithmetic, so every regeneration is byte-identical.
const BG = [0x1e, 0x29, 0x3b, 0xff];
const FG = [0x38, 0xbd, 0xf8, 0xff];
const inner = SIZE / 4;
const raw = Buffer.alloc(SIZE * (SIZE * 4 + 1));
for (let y = 0; y < SIZE; y += 1) {
  const row = y * (SIZE * 4 + 1);
  raw[row] = 0; // filter: none
  for (let x = 0; x < SIZE; x += 1) {
    const centred = x >= inner && x < SIZE - inner && y >= inner && y < SIZE - inner;
    raw.set(centred ? FG : BG, row + 1 + x * 4);
  }
}
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 6; // color type: RGBA
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk("IHDR", ihdr),
  chunk("IDAT", deflateSync(raw, { level: 9 })),
  chunk("IEND", Buffer.alloc(0)),
]);
writeFileSync(SOURCE, png);

// --- per-OS conversion via the pinned CLI --------------------------------------
const r = spawnSync("pnpm", ["exec", "tauri", "icon", SOURCE, "-o", "src-tauri/icons"], {
  stdio: "inherit",
});
if (r.status !== 0) fail("icons:gen — `tauri icon` failed (is @tauri-apps/cli installed? pnpm install)");
// Desktop template: the mobile sets are dead weight until a mobile target exists.
for (const dir of ["src-tauri/icons/android", "src-tauri/icons/ios"]) rmSync(dir, { recursive: true, force: true });
rmSync(SOURCE, { force: true });
ok("icons:gen — src-tauri/icons regenerated from the deterministic placeholder source");
