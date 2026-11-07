// Starts the game. The language has to be chosen first, because the game's text is read as it loads.
import "./style.css";
import { Language, keptLanguage, setLanguage } from "./i18n";

function askLanguage(): Promise<Language> {
  return new Promise((resolve) => {
    const panel = document.createElement("div");
    panel.className = "language-pick";
    const title = document.createElement("h1");
    title.textContent = "Modpack Simulator";
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
await import("./main");
