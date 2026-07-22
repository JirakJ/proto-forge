import { writeFileSync } from "node:fs";
import { read, ok } from "./lib.mjs";

// Regenerates the pseudo locale from en (accent + length expansion) so hardcoded
// strings stand out and truncation surfaces. Run by `pnpm i18n:extract`.
const MAP = {
  a: "á", b: "ƀ", c: "ç", d: "ð", e: "é", f: "ƒ", g: "ĝ", h: "ĥ", i: "í", j: "ĵ",
  k: "ķ", l: "ľ", m: "ɱ", n: "ñ", o: "ö", p: "ƥ", q: "ɋ", r: "ř", s: "š", t: "ť",
  u: "ü", v: "ṽ", w: "ŵ", x: "ẋ", y: "ý", z: "ž",
  A: "Á", B: "Ɓ", C: "Ç", D: "Ð", E: "É", F: "Ƒ", G: "Ĝ", H: "Ĥ", I: "Í", J: "Ĵ",
  K: "Ķ", L: "Ľ", M: "Ṁ", N: "Ñ", O: "Ö", P: "Ƥ", Q: "Ɋ", R: "Ř", S: "Š", T: "Ť",
  U: "Ü", V: "Ṽ", W: "Ŵ", X: "Ẋ", Y: "Ý", Z: "Ž",
};

const pseudo = (s) => "⟦" + [...s].map((c) => MAP[c] ?? c).join("") + "──⟧";

const walkObj = (o) =>
  Object.fromEntries(
    Object.entries(o).map(([k, v]) => [k, v && typeof v === "object" ? walkObj(v) : pseudo(String(v))]),
  );

const en = JSON.parse(read("src/i18n/locales/en.json"));
writeFileSync("src/i18n/locales/pseudo.json", JSON.stringify(walkObj(en), null, 2) + "\n");
ok("pseudo locale regenerated from en");
