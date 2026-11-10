// Languages. Korean is the source text, so a string is its own key and English is looked up from it.
import enJson from "../data/lang/en.json";
export type Language = "ko" | "en";

let language: Language = "ko";

export const setLanguage = (next: Language): void => {
  language = next;
};
export const getLanguage = (): Language => language;
export const dateLocale = (): string => (language === "en" ? "en-US" : "ko-KR");

export const tr = (text: string): string => (language === "ko" ? text : EN[text] ?? text);

/** Translates every string in a block of game data. */
export function localize<T>(value: T): T {
  if (typeof value === "string") return tr(value) as T;
  if (Array.isArray(value)) return value.map(localize) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, localize(item)])) as T;
  }
  return value;
}

const RESTART_KEY = "modpack-simulator-restart";
const LANGUAGE_KEY = "modpack-simulator-language";

/** The language to keep, if the game reloaded itself rather than being opened by the player. */
export function keptLanguage(): Language | null {
  try {
    if (!sessionStorage.getItem(RESTART_KEY)) return null;
    sessionStorage.removeItem(RESTART_KEY);
    const saved = sessionStorage.getItem(LANGUAGE_KEY);
    return saved === "en" || saved === "ko" ? saved : null;
  } catch {
    return null;
  }
}

/** Reloads the game without asking for the language again. */
export function restart(): void {
  try {
    sessionStorage.setItem(RESTART_KEY, "1");
    sessionStorage.setItem(LANGUAGE_KEY, language);
  } catch {
    // Without storage the player just picks the language again.
  }
  location.reload();
}

/**
 * English for every Korean string, one entry a line in data/lang/en.json, so adding or changing one touches one
 * line. Korean is the source: a string is its own key.
 */
export const EN: Record<string, string> = enJson;
