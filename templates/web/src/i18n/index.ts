import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { DEFAULT_LOCALE } from "./config";
import en from "./locales/en.json";
import pseudo from "./locales/pseudo.json";

// One catalogue per locale; feature namespaces are key prefixes (feature.*, app.*).
export const resources = {
  en: { translation: en },
  pseudo: { translation: pseudo },
} as const;

void i18n.use(initReactI18next).init({
  resources,
  lng: DEFAULT_LOCALE,
  fallbackLng: DEFAULT_LOCALE,
  interpolation: { escapeValue: false }, // React already escapes.
});

export default i18n;
