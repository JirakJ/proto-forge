// Extracts t('...') keys from source into one catalogue per locale
// (src/i18n/locales/en.json). `pnpm i18n:extract` runs this, then
// scripts/pseudo-gen.mjs regenerates pseudo.json from en.json.
export default {
  locales: ["en"],
  output: "src/i18n/locales/$LOCALE.json",
  input: ["src/**/*.{ts,tsx}"],
  keySeparator: ".",
  namespaceSeparator: false,
  defaultNamespace: "translation",
  sort: true,
  keepRemoved: false,
  createOldCatalogs: false,
};
