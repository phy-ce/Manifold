// Starts the game. The language has to be chosen first, because the game's text is read as it loads.
import "./style.css";
import { Language, keptLanguage, restart, setLanguage, tr } from "./i18n";
import { keyHintHtml } from "./ui/keyHint";

function askLanguage(): Promise<Language> {
  return new Promise((resolve) => {
    const panel = document.createElement("div");
    panel.className = "language-pick";
    const title = document.createElement("h1");
    title.textContent = "Manifold";
    const choices = document.createElement("div");
    choices.className = "bar-row";
    for (const [language, label] of [["ko", "한국어"], ["en", "English"]] as const) {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = label;
      b.addEventListener("click", () => {
        panel.remove();
        resolve(language);
      });
      choices.append(b);
    }
    // The screen is laid out for a full 1920×1080, so full screen is offered first: [F11], or a click on it.
    // Both languages, as none is chosen yet.
    const full = document.createElement("button");
    full.type = "button";
    full.className = "key-button full-screen";
    full.innerHTML = keyHintHtml("F11", "전체 화면 · Full screen", "on");
    full.addEventListener("click", () => void document.documentElement.requestFullscreen?.().catch(() => undefined));
    panel.append(title, choices, full);
    document.body.append(panel);
  });
}

/**
 * Full screen keeps Esc for the game: Esc closes windows and opens the menu, and a browser's full screen would
 * also leave on it. So F11 goes into the page's own full screen, and there the Escape key is locked to the page
 * (Keyboard Lock, in Chrome and Edge): a short press reaches the game, holding it leaves, as the browser itself
 * says. Where the lock is missing (Firefox), Esc still leaves full screen as before.
 */
function setUpFullScreen(): void {
  const keyboard = (navigator as Navigator & { keyboard?: { lock?: (keys: string[]) => Promise<void>; unlock?: () => void } }).keyboard;
  addEventListener("keydown", (e) => {
    if (e.key !== "F11" || !document.documentElement.requestFullscreen) return;
    e.preventDefault();
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen().catch(() => undefined);
  });
  document.addEventListener("fullscreenchange", () => {
    if (document.fullscreenElement) void keyboard?.lock?.(["Escape"]).catch(() => undefined);
    else keyboard?.unlock?.();
  });
}
setUpFullScreen();

const language = keptLanguage() ?? await askLanguage();
setLanguage(language);
document.documentElement.lang = language;
const SAVE_KEY = "modpack-simulator-save";

/** A failed start shows why, and can set the save aside instead of leaving a blank page. */
function showFailure(error: unknown): void {
  const panel = document.createElement("div");
  panel.className = "language-pick";
  const title = document.createElement("h1");
  title.textContent = tr("게임을 시작하지 못했습니다");
  const detail = document.createElement("pre");
  detail.textContent = error instanceof Error && error.stack ? error.stack : String(error);
  const fresh = document.createElement("button");
  fresh.type = "button";
  fresh.textContent = tr("세이브를 보관하고 새로 시작");
  fresh.addEventListener("click", () => {
    try {
      const save = localStorage.getItem(SAVE_KEY);
      if (save) localStorage.setItem(`${SAVE_KEY}-backup`, save);
      localStorage.removeItem(SAVE_KEY);
    } catch {
      // With storage blocked there is nothing to set aside.
    }
    restart();
  });
  panel.append(title, detail, fresh);
  document.body.replaceChildren(panel);
}

try {
  await import("./main");
} catch (error) {
  showFailure(error);
}
