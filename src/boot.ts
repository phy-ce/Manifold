// Starts the game. The language has to be chosen first, because the game's text is read as it loads.
import "./style.css";
import { Language, keptLanguage, restart, setLanguage, tr } from "./i18n";

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
    panel.append(title, choices);
    document.body.append(panel);
  });
}

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
  detail.textContent = String(error);
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
