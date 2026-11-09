// Route settings between two nodes. Without a filter a route only has broad channels:
// a warehouse sends whatever it holds, and a machine sends its main output or by-products.
import { tr } from "../i18n";
import { BELT_DRIVE, PRESSURE_PUMP, PUMP, MANIFOLD, MAX_PORTS, isPowerSource, itemCode, itemColor, itemName } from "../content";
import { GameState, LineLayer, bagCount, kindOf, lineKinds, beltNetOf, pipeNetOf, canAffordRoute, hasDrive, lineLayer, nodeById, nodeLabel, portsUsed, routeCost, routeMaterials, toggleRoute } from "../engine/game";

export class RouteWindow {
  readonly root = document.createElement("div");
  private readonly route = document.createElement("div");
  private readonly drive = document.createElement("div");
  private readonly ports = document.createElement("div");
  private readonly list = document.createElement("div");
  /** Picks the belt or tube a new line is laid with, per layer. Only names and counts here: how each performs is in the index. */
  private readonly tubes = document.createElement("div");
  private readonly picked: Partial<Record<LineLayer, string>> = {};
  private from: number | null = null;
  private to: number | null = null;
  private drawn = "";

  constructor(private readonly game: () => GameState, private readonly changed: () => void, private readonly layer: () => LineLayer) {
    this.root.className = "window-back";
    this.root.hidden = true;
    const panel = document.createElement("div");
    panel.className = "window route-window";
    panel.setAttribute("role", "dialog");

    const head = document.createElement("div");
    head.className = "bar-row";
    const title = document.createElement("h2");
    title.textContent = tr("연결 설정");
    const close = document.createElement("button");
    close.type = "button";
    close.className = "tech push";
    close.textContent = "x";
    close.setAttribute("aria-label", tr("닫기"));
    close.addEventListener("click", () => this.close());
    head.append(title, close);

    this.route.className = "route";
    this.ports.className = "card-note";
    this.drive.className = "short";
    this.list.className = "route-list";
    this.tubes.className = "modes";
    panel.append(head, this.route, this.drive, this.ports, this.tubes, this.list);
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
    // Only the layer on screen: its lines, and the channels that would run on it.
    const layer = this.layer();
    const onLayer = (material: string) => lineLayer(s, from.id, material) === layer;
    const lines = s.lines.filter((l) => l.from === from.id && l.to === to.id && onLayer(l.material));
    const full = portsUsed(s, from.id) >= MAX_PORTS || portsUsed(s, to.id) >= MAX_PORTS;
    const channels = routeMaterials(s, from.id, to.id).filter(onLayer);
    // Paid from the bag only, so the count shown is what the player carries. A line is laid with the kind picked.
    const kinds = lineKinds(layer);
    const tube = kinds.includes(this.picked[layer] ?? "") ? this.picked[layer] : kinds[0];
    const costOf = (material: string) => Object.entries(routeCost(s, from.id, material, tube)).map(([id, n]) => `${itemName(id)} ${n} (${tr("인벤토리")} ${bagCount(s, id)})`).join(", ");
    const afford = channels.some((id) => canAffordRoute(s, from.id, id, tube));
    const cost = channels.length ? costOf(channels[0]) : "";
    const counts = kinds.map((id) => bagCount(s, id)).join();
    const key = `${layer}|${channels.join()}|${lines.map((l) => `${l.material}${l.active}`).join()}|${full}|${afford}|${cost}|${tube}|${counts}`;
    if (key === this.drawn) return;
    this.drawn = key;

    this.route.textContent = `${nodeLabel(s, from)} > ${nodeLabel(s, to)}`;
    // Belts stand without a running belt drive on their network, and pipes without a running pressure pump.
    // A riverbank pump pushes its own water, so its pipes stand only when the pump has no power.
    const stands = layer === "item"
      ? from.type !== BELT_DRIVE && !beltNetOf(from.id)?.rate && tr("이 물류망에 돌아가는 벨트 구동기가 없어 멈춰 있습니다")
      : layer !== "fluid" || from.type === PRESSURE_PUMP ? false
      : from.type === PUMP ? !hasDrive(s, from.id) && tr("보내는 쪽에 동력이 없어 멈춰 있습니다")
      : !pipeNetOf(from.id)?.rate && tr("이 유체망에 돌아가는 압송 펌프가 없어 멈춰 있습니다");
    this.drive.textContent = isPowerSource(from.type) || from.type === MANIFOLD || !stands ? "" : stands;
    this.ports.textContent = `${tr("포트")} ${portsUsed(s, from.id)}/${MAX_PORTS} > ${portsUsed(s, to.id)}/${MAX_PORTS} · ${tr("연결 비용:")} ${cost}`;
    this.ports.classList.toggle("short", !afford);
    // Only shown when there is a choice: today pipes, and belts once better ones come.
    this.tubes.hidden = kinds.length < 2 || !channels.length;
    this.tubes.replaceChildren(...kinds.map((id) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = `tech ${id === tube ? "selected" : ""}`;
      b.textContent = `${itemName(id)} ${bagCount(s, id)}`;
      b.setAttribute("aria-pressed", String(id === tube));
      b.dataset.tip = tr("새 선을 이것으로 놓습니다. 성능은 도감에서 볼 수 있습니다");
      b.addEventListener("click", () => {
        this.picked[layer] = id;
        this.drawn = "";
        this.draw();
      });
      return b;
    }));
    this.list.replaceChildren(...channels.map((id) => {
      const line = lines.find((l) => l.material === id);
      const b = document.createElement("button");
      b.type = "button";
      b.className = `route-row ${line ? "on" : ""}`;
      b.disabled = !line && (full || !canAffordRoute(s, from.id, id, tube));
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
      const status = line ? (line.active ? tr("이동 중") : tr("대기")) : "";
      // A belt or pipe says what it is laid with.
      const kind = line && kindOf(line, layer);
      state.textContent = kind ? `${itemName(kind)} · ${status}` : status;
      b.append(mark, code, name, state);
      b.addEventListener("click", () => {
        const done = toggleRoute(this.game(), from.id, to.id, id, tube);
        this.drawn = "";
        this.draw();
        // Taking a line down puts its materials in the bag, so a full bag refuses.
        if (!done && line) this.drive.textContent = tr("인벤토리가 가득 차서 선을 거둘 수 없습니다");
        this.changed();
      });
      return b;
    }));
  }
}
