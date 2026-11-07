// Build window: shows what a facility needs, then the player works it into existence.
import { PUMP, machineCost, machineName, machineWork } from "../content";
import { GameState, canStart, cancelProject, countOf, nearestRiver, startProject, workProject } from "../engine/game";
import { COLS, renderArt } from "./art";
import { makeSlot, paintSlot } from "./slots";

export class BuildWindow {
  readonly root = document.createElement("div");
  private readonly title = document.createElement("h2");
  private readonly needs = document.createElement("div");
  private readonly amount = document.createElement("div");
  private readonly work = document.createElement("button");
  private readonly art = document.createElement("pre");
  private readonly start = document.createElement("button");
  private readonly cancel = document.createElement("button");
  private rows: [string, number, HTMLSpanElement][] = [];
  private type: string | null = null;

  constructor(private readonly game: () => GameState, private readonly changed: () => void) {
    this.root.className = "window-back";
    this.root.hidden = true;
    const panel = document.createElement("div");
    panel.className = "window build";
    panel.setAttribute("role", "dialog");
    const head = document.createElement("div");
    head.className = "bar-row";
    const close = document.createElement("button");
    close.type = "button";
    close.className = "tech push";
    close.textContent = "x";
    close.setAttribute("aria-label", "닫기");
    close.addEventListener("click", () => this.close());
    head.append(this.title, close);

    this.needs.className = "needs";
    this.amount.className = "amount";
    this.work.type = "button";
    this.work.className = "work";
    this.work.setAttribute("aria-label", "건설 작업");
    this.art.className = "art";
    this.work.append(this.art);
    this.work.addEventListener("click", () => {
      workProject(this.game());
      if (!this.game().project) this.close();
      this.changed();
    });

    this.start.type = "button";
    this.start.className = "tech";
    this.start.textContent = "착수";
    this.start.addEventListener("click", () => {
      if (this.type) startProject(this.game(), this.type);
      this.changed();
    });
    this.cancel.type = "button";
    this.cancel.className = "tech";
    this.cancel.textContent = "착수 취소";
    this.cancel.addEventListener("click", () => {
      cancelProject(this.game());
      this.changed();
    });
    const actions = document.createElement("div");
    actions.className = "bar-row";
    actions.append(this.start, this.cancel);

    panel.append(head, this.needs, this.work, this.amount, actions);
    this.root.append(panel);
    this.root.addEventListener("click", (e) => {
      if (e.target === this.root) this.close();
    });
    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape") this.close();
    });
  }

  get isOpen(): boolean {
    return this.type !== null;
  }

  open(type: string): void {
    this.type = type;
    this.title.textContent = machineName(type);
    this.needs.replaceChildren();
    this.rows = [];
    for (const [key, need] of Object.entries(machineCost(type))) {
      const row = document.createElement("div");
      row.className = "need";
      const slot = makeSlot(() => undefined);
      paintSlot(slot, null, "", key);
      const count = document.createElement("span");
      row.append(slot, count);
      this.rows.push([key, need, count]);
      this.needs.append(row);
    }
    this.root.hidden = false;
    this.draw(0);
  }

  close(): void {
    this.type = null;
    this.root.hidden = true;
  }

  draw(frame: number): void {
    if (!this.type) return;
    const s = this.game();
    const mine = s.project?.type === this.type ? s.project : null;
    this.needs.hidden = !!mine;
    for (const [key, need, label] of this.rows) {
      const have = countOf(s, key);
      label.textContent = `${have}/${need}`;
      label.className = have >= need ? "" : "short";
    }
    const total = machineWork(this.type);
    const done = mine?.done ?? 0;
    const fill = Math.round((done / total) * 18);
    this.amount.textContent = `착수량 [${"#".repeat(fill).padEnd(18, ".")}] ${done}/${total}`;
    this.work.disabled = !mine;
    this.cancel.hidden = !mine;
    this.start.hidden = !!mine;
    this.start.disabled = !!s.project || !canStart(s, this.type);
    this.start.dataset.tip = this.type === PUMP && !nearestRiver(s) ? "지도에서 강가를 먼저 찾아야 합니다" : "";

    // The facility rises from the ground as the work fills up.
    const key = `${this.type}|${done}|${!!mine}`;
    if (this.art.dataset.done === key) return;
    this.art.dataset.done = key;
    const lines = renderArt(this.type, "idle", frame).split("\n").filter(Boolean);
    const shown = Math.max(mine ? 2 : 0, Math.round((done / total) * lines.length));
    const blank = `${" ".repeat(COLS)}\n`.repeat(lines.length - shown);
    this.art.innerHTML = blank + lines.slice(lines.length - shown).join("\n");
  }
}
