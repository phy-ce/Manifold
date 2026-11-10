// The one way the game tells the player what a key does: a keycap and a word or two, "[F] 공격".
// No sentences. A hint is lit when pressing it would do something now, and dim when it would not.
import { tr } from "../i18n";

/** How a hint reads: lit when the key would act now, dim when it would not. */
export type HintState = "on" | "off";

/** A key hint as markup, for lines built as HTML. `key` and `word` are already translated. */
export function keyHintHtml(key: string, word: string, state: HintState = "on"): string {
  return `<span class="key-hint ${state}"><kbd>${key}</kbd>${word ? ` <span>${word}</span>` : ""}</span>`;
}

/** A key hint element, kept in place and updated with setKeyHint so the line around it never moves. */
export function keyHint(key: string, word: string, state: HintState = "on"): HTMLSpanElement {
  const el = document.createElement("span");
  el.className = "key-hint";
  el.innerHTML = `<kbd></kbd> <span></span>`;
  setKeyHint(el, key, word, state);
  return el;
}

export function setKeyHint(el: HTMLElement, key: string, word: string, state: HintState = "on"): void {
  const [cap, label] = [el.querySelector("kbd")!, el.querySelector("span")!];
  if (cap.textContent !== key) cap.textContent = key;
  if (label.textContent !== word) label.textContent = word;
  el.classList.toggle("on", state === "on");
  el.classList.toggle("off", state === "off");
}

/** The mouse, as a keycap label. */
export const CLICK = () => tr("클릭");
