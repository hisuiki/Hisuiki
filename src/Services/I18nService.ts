import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "../locales/en.json";
import ja from "../locales/ja.json";

/**
 * Translation, in place of the isJapanese flag that used to be threaded through every component.
 *
 * The flag worked while there were two languages and a handful of screens. It does not survive
 * widgets: a widget is placed by its owner and rendered by whatever surface it lands in, so it
 * cannot rely on a prop being passed down a path nobody controls. Language is ambient here for the
 * same reason the theme is.
 *
 * The strings live in locales/*.json so that adding a language is a file rather than a diff through
 * every component, and so translations can be handed to someone who does not read TypeScript.
 */
export const LANGUAGES = ["en", "ja"] as const;
export type Language = (typeof LANGUAGES)[number];

void i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    ja: { translation: ja },
  },
  lng: "en",
  fallbackLng: "en",
  // React escapes what it renders; doing it again here would show the entities as text.
  interpolation: { escapeValue: false },
});

/** Switches language, if it is not already the one asked for — i18next re-renders on every call. */
export function setLanguage(language: Language): void {
  if (i18n.language !== language) void i18n.changeLanguage(language);
}

export default i18n;
