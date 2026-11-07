// Route settings between two nodes. Without a filter a route only has broad channels:
// a warehouse sends whatever it holds, and a machine sends its main output or by-products.
import { MAX_PORTS, isPowerSource, itemCode, itemColor, itemName } from "../content";
import { GameState, canAffordRoute, hasDrive, nodeById, nodeLabel, portsUsed, routeCost, routeMaterials, toggleRoute } from "../engine/game";

export class RouteWindow {
  readonly root = document.createElement("div");
  private readonly route = document.createElement("div");
  private readonly drive = document.createElement("div");
  private readonly ports = document.createElement("div");
  private readonly list = document.createElement("div");
  private from: number | null = null;
  private to: number | null = null;
  private drawn = "";

  constructor(private readonly game: () => GameState, private readonly changed: () => void) {
    this.root.className = "window-back";
    this.root.hidden = true;
    const panel = document.createElement("div");
    panel.className = "window route-window";
    panel.setAttribute("role", "dialog");

    const head = document.createElement("div");
    head.className = "bar-row";
    const title = document.createElement("h2");
    title.textContent = "연결 설정";
    const close = document.createElement("button");
    close.type = "button";
    close.className = "tech push";
    close.textContent = "x";
    close.setAttribute("aria-label", "닫기");
    close.addEventListener("click", () => this.close());
    head.append(title, close);

    this.route.className = "route";
    this.ports.className = "card-note";
    this.drive.className = "short";
    this.list.className = "route-list";
    panel.append(head, this.route, this.drive, this.ports, this.list);
    this.root.append(panel);
    this.root.addEventListener("click", (e) => {
      if (e.target === this.root) this.close();
    });
    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape") this.close();
    });
  }

  get isOpen(): boolean {
    return this.from !== null;
  }

  open(from: number, to: number): void {
    this.from = from;
    this.to = to;
    this.drawn = "";
    this.root.hidden = false;
    this.draw();
  }

  close(): void {
    this.from = null;
    this.to = null;
    this.root.hidden = true;
  }

  draw(): void {
    if (this.from === null || this.to === null) return;
    const s = this.game();
    const from = nodeById(s, this.from);
    const to = nodeById(s, this.to);
    if (!from || !to) return this.close();
    const lines = s.lines.filter((l) => l.from === from.id && l.to === to.id);
    const full = portsUsed(s, from.id) >= MAX_PORTS || portsUsed(s, to.id) >= MAX_PORTS;
    const channels = routeMaterials(s, from.id, to.id);
    const afford = canAffordRoute(s, from.id, to.id);
    const cost = Object.entries(routeCost(s, from.id, to.id)).map(([id, n]) => `${itemName(id)} ${n}`).join(", ");
    const key = `${channels.join()}|${lines.map((l) => `${l.material}${l.active}`).join()}|${full}|${afford}`;
    if (key === this.drawn) return;
    this.drawn = key;

    this.route.textContent = `${nodeLabel(s, from)} > ${nodeLabel(s, to)}`;
    this.drive.textContent = isPowerSource(from.type) || hasDrive(s, from.id) ? "" : "보내는 쪽에 동력이 없어 멈춰 있습니다";
    this.ports.textContent = `포트 ${portsUsed(s, from.id)}/${MAX_PORTS} > ${portsUsed(s, to.id)}/${MAX_PORTS} · 연결 비용: ${cost}`;
    this.ports.classList.toggle("short", !afford);
    this.list.replaceChildren(...channels.map((id) => {
      const line = lines.find((l) => l.material === id);
      const b = document.createElement("button");
      b.type = "button";
      b.className = `route-row ${line ? "on" : ""}`;
      b.disabled = !line && (full || !afford);
      b.setAttribute("aria-pressed", String(!!line));
      const mark = document.createElement("span");
      mark.textContent = line ? "[x]" : "[ ]";
      const code = document.createElement("span");
      code.style.color = itemColor(id);
      code.textContent = itemCode(id);
      const name = document.createElement("span");
      name.textContent = itemName(id);
      const state = document.createElement("span");
      state.className = "push card-note";
      state.textContent = line ? (line.active ? "이동 중" : "대기") : "";
      b.append(mark, code, name, state);
      b.addEventListener("click", () => {
        toggleRoute(this.game(), from.id, to.id, id);
        this.drawn = "";
        this.draw();
        this.changed();
      });
      return b;
    }));
  }
}
