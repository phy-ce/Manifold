// Manual save slots, on top of the automatic save.
import { dateLocale, tr } from "../i18n";
import { GameState, OLDEST_SAVE, SAVE_VERSION } from "../engine/game";

const SLOTS = 3;
/** The automatic slot: apart from the player's own 1 to 3, and never written over them. */
const AUTO = "auto";
const slotKey = (n: number | typeof AUTO) => `modpack-simulator-slot-${n}`;
/** How often play is copied into the automatic slot. The running game itself is saved every few seconds. */
export const AUTO_SAVE_MS = 3 * 60 * 1000;

/** Copies the game into the automatic slot, a point to go back to. */
export function autoSave(state: GameState): void {
  try {
    localStorage.setItem(slotKey(AUTO), JSON.stringify({ savedAt: new Date().toLocaleString(dateLocale()), state }));
  } catch {
    // Storage full or blocked: the running game's own save still works.
  }
}

interface Saved {
  savedAt: string;
  state: GameState;
}

function read(n: number | typeof AUTO): Saved | null {
  try {
    const raw = localStorage.getItem(slotKey(n));
    const saved = raw ? (JSON.parse(raw) as Saved) : null;
    // Older saves are converted when they load. Only a newer game's can't be read.
    const version = saved?.state?.version ?? Infinity;
    return version <= SAVE_VERSION && version >= OLDEST_SAVE ? saved : null;
  } catch {
    return null;
  }
}

export class SaveWindow {
  readonly root = document.createElement("div");
  private readonly list = document.createElement("div");

  constructor(private readonly game: () => GameState, private readonly loadState: (state: GameState) => void) {
    this.root.className = "window-back";
    this.root.hidden = true;
    const panel = document.createElement("div");
    panel.className = "window route-window";
    panel.setAttribute("role", "dialog");
    const head = document.createElement("div");
    head.className = "bar-row";
    const title = document.createElement("h2");
    title.textContent = tr("저장");
    const close = document.createElement("button");
    close.type = "button";
    close.className = "tech push";
    close.textContent = "x";
    close.setAttribute("aria-label", tr("닫기"));
    close.addEventListener("click", () => this.close());
    head.append(title, close);
    this.list.className = "save-list";
    panel.append(head, this.list);
    this.root.append(panel);
    this.root.addEventListener("click", (e) => {
      if (e.target === this.root) this.close();
    });
    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape") this.close();
    });
  }

  open(): void {
    this.root.hidden = false;
    this.draw();
  }

  close(): void {
    this.root.hidden = true;
  }

  private button(label: string, enabled: boolean, run: () => void): HTMLButtonElement {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "tech";
    b.textContent = label;
    b.disabled = !enabled;
    b.addEventListener("click", run);
    return b;
  }

  private draw(): void {
    // The automatic slot first, on its own: it can only be loaded. Then the player's own slots.
    const heading = (text: string) => {
      const h = document.createElement("div");
      h.className = "slot-label save-heading";
      h.textContent = text;
      return h;
    };
    const auto = read(AUTO);
    const autoRow = document.createElement("div");
    autoRow.className = "bar-row";
    const autoLabel = document.createElement("span");
    autoLabel.textContent = auto ? auto.savedAt : tr("비어 있음");
    const autoLoad = this.button(tr("불러오기"), !!auto, () => {
      if (auto) this.loadState(auto.state);
    });
    autoLoad.classList.add("push");
    autoRow.append(autoLabel, autoLoad);
    this.list.replaceChildren(heading(tr("자동 저장")), autoRow, heading(tr("직접 저장")), ...this.slotRows());
  }

  private slotRows(): HTMLElement[] {
    return Array.from({ length: SLOTS }, (_, i) => {
      const n = i + 1;
      const saved = read(n);
      const row = document.createElement("div");
      row.className = "bar-row";
      const label = document.createElement("span");
      label.textContent = `${tr("슬롯")} ${n} · ${saved ? saved.savedAt : tr("비어 있음")}`;
      const store = this.button(tr("저장"), true, () => {
        const entry: Saved = { savedAt: new Date().toLocaleString(dateLocale()), state: this.game() };
        try {
          localStorage.setItem(slotKey(n), JSON.stringify(entry));
        } catch {
          label.textContent = `${tr("슬롯")} ${n} · ${tr("저장 실패")}`;
          return;
        }
        this.draw();
      });
      store.classList.add("push");
      const load = this.button(tr("불러오기"), !!saved, () => {
        if (saved) this.loadState(saved.state);
      });
      row.append(label, store, load);
      return row;
    });
  }
}
