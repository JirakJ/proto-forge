// Single source of the default locale (BRS §6, §12.3). Everything else imports
// these; no second definition may exist (consistency gate asserts it).
export const DEFAULT_LOCALE = "en" as const;
export const SUPPORTED_LOCALES = ["en", "pseudo"] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];
