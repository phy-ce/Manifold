// Manual save slots, on top of the automatic save.
import { dateLocale, tr } from "../i18n";
import { GameState, SAVE_VERSION } from "../engine/game";

const SLOTS = 3;
const slotKey = (n: number) => `modpack-simulator-slot-${n}`;

interface Saved {
  savedAt: string;
  state: GameState;
}

function read(n: number): Saved | null {
  try {
    const raw = localStorage.getItem(slotKey(n));
    const saved = raw ? (JSON.parse(raw) as Saved) : null;
    // Older saves are converted when they load. Only a newer game's can't be read.
    return (saved?.state?.version ?? Infinity) <= SAVE_VERSION ? saved : null;
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
    this.list.replaceChildren(...Array.from({ length: SLOTS }, (_, i) => {
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
    }));
  }
}
