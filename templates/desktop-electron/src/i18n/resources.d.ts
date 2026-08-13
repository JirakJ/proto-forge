// Typed i18n keys — generated to mirror the `en` catalogue (BRS §6). Regenerate
// when keys change. Gives feature-prefixed keys compile-time checking.
import "i18next";
import type en from "./locales/en.json";

declare module "i18next" {
  interface CustomTypeOptions {
    defaultNS: "translation";
    resources: {
      translation: typeof en;
    };
  }
}
