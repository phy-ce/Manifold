// Base screen: machines as nodes, lines drawn between them.
import { ENGINE, LINK, MAX_PORTS, formLabel, machineForms, machinesAt, MOTOR, POWER, RIVERBANK, WAREHOUSE, isMachine, unitOf, itemCode, itemColor, itemName, machineName, machineWork } from "../content";
import {
  powerLoad, buildAllGhosts, buildGhost, copyToGhosts, countOf, installHeld, removeGhost,
  Ghost, GameNode, GameState, LINE_MS, Line, SPRING_MAX, nodeById, nodeLabel, nodeProcess, portsUsed, recipeOf, routeMaterials, status,
} from "../engine/game";
import { SIZE } from "./theme";

const NODE_W = SIZE.nodeW;
const NODE_H = SIZE.nodeH;
const SVG = "http://www.w3.org/2000/svg";
/** Gap from the centre line for each direction of a two-way route. */
const LANE = 14;
type Point2 = [number, number];
type Curve = [Point2, Point2, Point2, Point2];
/** Which state a kind of facility shows when its machines differ: the one needing attention. */
const STATUS_ORDER = ["blocked", "manual", "run", "idle"] as const;
const STATUS_LABEL = { blocked: "출력 막힘", manual: "작업 대기", run: "가동 중", idle: "재료 부족" };

interface NodeView {
  root: HTMLDivElement;
  body: HTMLButtonElement;
  link: HTMLButtonElement;
  key: string;
}
interface GhostView {
  root: HTMLDivElement;
  body: HTMLButtonElement;
  key: string;
}
/** Which lines stand out. Everything else fades back. */
type Channel = "all" | "power" | "item" | "link";
const CHANNELS: [Channel, string][] = [["all", "모든 선"], ["power", "동력"], ["item", "재료"], ["link", "강가"]];
const channelOf = (material: string): Channel => (material === POWER ? "power" : material === LINK ? "link" : "item");
/** Board zoom limits, and how much one wheel notch changes it. */
const ZOOM_MIN = 0.4;
const ZOOM_MAX = 1.6;
const ZOOM_STEP = 1.1;
/** How far a paste lands from the original when the pointer isn't over the board. */
const PASTE_OFFSET = 40;

interface LineView {
  path: SVGPathElement;
  hit: SVGPathElement;
  mover: SVGTextElement;
  tag: SVGTextElement;
}

export class GraphView {
  readonly root = document.createElement("section");
  private readonly roster = document.createElement("nav");
  private readonly rosterItems = new Map<string, HTMLButtonElement>();
  private readonly rosterList = document.createElement("div");
  private readonly listItems = new Map<number, HTMLButtonElement>();
  private expanded: string | null = null;
  private readonly projectChip = document.createElement("button");
  private readonly palette = document.createElement("div");
  private readonly board = document.createElement("div");
  private readonly svg = document.createElementNS(SVG, "svg");
  private readonly nodes = new Map<number, NodeView>();
  private readonly lines = new Map<string, LineView>();
  private linkFrom: number | null = null;
  private drag: { id: number; dx: number; dy: number; moved: boolean } | null = null;
  private pan = { x: 0, y: 0 };
  private zoom = 1;
  private readonly view = document.createElement("div");
  private readonly zoomButton = document.createElement("button");
  private panFrom: { x: number; y: number } | null = null;

  private stage = -1;
  private readonly paletteItems = new Map<string, HTMLButtonElement>();
  private readonly tools = document.createElement("div");
  private readonly search = document.createElement("input");
  private readonly channels = new Map<Channel, HTMLButtonElement>();
  private readonly copyButton = document.createElement("button");
  private readonly pasteButton = document.createElement("button");
  private readonly buildAll = document.createElement("button");
  private readonly ghostViews = new Map<number, GhostView>();
  private readonly ghostWires = new Map<string, SVGPathElement>();
  private readonly marquee = document.createElement("div");
  private readonly selected = new Set<number>();
  private clip: number[] = [];
  private channel: Channel = "all";
  private pointer: { x: number; y: number } | null = null;
  private boxFrom: { x: number; y: number } | null = null;

  /** Fills the build list with what the current stage has opened. */
  setStage(stage: number): void {
    if (stage === this.stage) return;
    this.stage = stage;
    this.paletteItems.clear();
    this.palette.replaceChildren(...machinesAt(stage).map((type) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "tech";
      b.addEventListener("click", () => this.build(type));
      this.paletteItems.set(type, b);
      return b;
    }));
  }

  /** The tools above the board: find, pick which lines stand out, copy and paste. */
  private makeTools(): void {
    this.tools.className = "graph-tools";
    this.search.id = "graph-search";
    this.search.type = "search";
    this.search.placeholder = "노드 찾기";
    this.search.setAttribute("aria-label", "노드 찾기");
    this.search.addEventListener("input", () => this.draw());
    const lines = document.createElement("div");
    lines.className = "modes";
    for (const [channel, label] of CHANNELS) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "tech";
      b.textContent = label;
      b.addEventListener("click", () => {
        this.channel = channel;
        this.draw();
      });
      this.channels.set(channel, b);
      lines.append(b);
    }
    const action = (b: HTMLButtonElement, label: string, tip: string, run: () => void) => {
      b.type = "button";
      b.className = "tech";
      b.textContent = label;
      b.dataset.tip = tip;
      b.addEventListener("click", run);
    };
    action(this.copyButton, "복사", "Shift+클릭으로 고른 노드를 복사합니다 (Ctrl+C)", () => this.copy());
    action(this.pasteButton, "붙여넣기", "복사한 구성을 청사진으로 놓습니다 (Ctrl+V)", () => this.paste());
    action(this.buildAll, "", "가진 기계로 청사진을 실제로 바꿉니다", () => {
      buildAllGhosts(this.game());
      this.changed();
    });
    action(this.zoomButton, "100%", "휠로 확대/축소합니다. 누르면 100%로 돌아갑니다", () => {
      this.zoom = 1;
      this.applyView();
      this.draw();
    });
    this.tools.append(this.search, lines, this.copyButton, this.pasteButton, this.buildAll, this.zoomButton);
  }

  private copy(): void {
    if (this.selected.size) this.clip = [...this.selected];
    this.draw();
  }

  /** Lays the copied nodes down as a plan, at the pointer if it is over the board. */
  private paste(): void {
    const s = this.game();
    const spots = this.clip.flatMap((id) => {
      const at = this.spotOf(s, id);
      return at ? [at] : [];
    });
    if (!spots.length) return;
    const left = Math.min(...spots.map((p) => p.x));
    const top = Math.min(...spots.map((p) => p.y));
    const dx = this.pointer ? Math.max(0, this.pointer.x) - left : PASTE_OFFSET;
    const dy = this.pointer ? Math.max(0, this.pointer.y) - top : PASTE_OFFSET;
    const copies = copyToGhosts(s, this.clip, dx, dy);
    this.selected.clear();
    for (const ghost of copies) this.selected.add(ghost.id);
    this.changed();
  }

  private spotOf(s: GameState, id: number): { x: number; y: number } | undefined {
    return nodeById(s, id) ?? s.ghosts.find((g) => g.id === id);
  }

  private boardPoint(e: MouseEvent): { x: number; y: number } {
    const box = this.board.getBoundingClientRect();
    return { x: (e.clientX - box.left) / this.zoom, y: (e.clientY - box.top) / this.zoom };
  }

  private applyView(): void {
    this.board.style.transform = `translate(${this.pan.x}px, ${this.pan.y}px) scale(${this.zoom})`;
    const label = `${Math.round(this.zoom * 100)}%`;
    if (this.zoomButton.textContent !== label) this.zoomButton.textContent = label;
  }

  /** Zooms around the pointer, so the spot under it stays put. */
  private onWheel(e: WheelEvent): void {
    e.preventDefault();
    const next = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, this.zoom * (e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP)));
    const box = this.view.getBoundingClientRect();
    const x = e.clientX - box.left;
    const y = e.clientY - box.top;
    const scale = next / this.zoom;
    this.pan = { x: Math.min(0, x - (x - this.pan.x) * scale), y: Math.min(0, y - (y - this.pan.y) * scale) };
    this.zoom = next;
    this.applyView();
    this.draw();
  }

  private toggleSelected(id: number): void {
    if (!this.selected.delete(id)) this.selected.add(id);
    this.draw();
  }

  private onKey(e: KeyboardEvent): void {
    if (this.root.hidden || e.target instanceof HTMLInputElement) return;
    const s = this.game();
    if ((e.ctrlKey || e.metaKey) && e.code === "KeyC") this.copy();
    else if ((e.ctrlKey || e.metaKey) && e.code === "KeyV") this.paste();
    else if (e.key === "Delete") {
      // Only plans can be deleted from the board. Real machines are demolished in their window.
      for (const id of [...this.selected]) {
        if (s.ghosts.some((g) => g.id === id)) {
          removeGhost(s, id);
          this.selected.delete(id);
        }
      }
      this.changed();
    }
  }

  private makeGhost(ghost: Ghost): GhostView {
    const root = document.createElement("div");
    root.className = "node plan";
    root.dataset.status = "idle";
    const body = document.createElement("button");
    body.type = "button";
    body.className = "node-body";
    const drop = document.createElement("button");
    drop.type = "button";
    drop.className = "link";
    drop.textContent = "x";
    drop.setAttribute("aria-label", "청사진 지우기");
    drop.addEventListener("click", () => {
      removeGhost(this.game(), ghost.id);
      this.selected.delete(ghost.id);
      this.changed();
    });
    root.append(body, drop);
    body.addEventListener("pointerdown", (e) => {
      this.drag = { id: ghost.id, dx: e.clientX, dy: e.clientY, moved: false };
    });
    body.addEventListener("click", (e) => {
      if (this.dragged) {
        this.dragged = false;
        return;
      }
      if (e.shiftKey) return this.toggleSelected(ghost.id);
      if (buildGhost(this.game(), ghost.id)) {
        this.selected.delete(ghost.id);
        this.changed();
        return;
      }
      root.classList.add("refused");
      setTimeout(() => root.classList.remove("refused"), 260);
    });
    this.board.append(root);
    return { root, body, key: "" };
  }

  private drawGhosts(s: GameState): void {
    for (const [id, view] of this.ghostViews) {
      if (!s.ghosts.some((g) => g.id === id)) {
        view.root.remove();
        this.ghostViews.delete(id);
      }
    }
    const query = this.search.value.trim().toLowerCase();
    for (const ghost of s.ghosts) {
      let view = this.ghostViews.get(ghost.id);
      if (!view) {
        view = this.makeGhost(ghost);
        this.ghostViews.set(ghost.id, view);
      }
      view.root.style.transform = `translate(${ghost.x}px, ${ghost.y}px)`;
      view.root.classList.toggle("selected", this.selected.has(ghost.id));
      const found = machineName(ghost.type).toLowerCase().includes(query);
      view.root.classList.toggle("dim", !!query && !found);
      view.root.classList.toggle("found", !!query && found);
      view.body.dataset.tip = countOf(s, ghost.type) ? "클릭해서 설치" : "기계가 필요합니다";
      const html = this.ghostHtml(s, ghost);
      if (html !== view.key) {
        view.key = html;
        view.body.innerHTML = html;
      }
    }
    const live = new Set<string>();
    for (const line of s.ghostLines) {
      const a = this.spotOf(s, line.from);
      const b = this.spotOf(s, line.to);
      if (!a || !b) continue;
      const key = `${line.from}>${line.to}:${line.material}`;
      live.add(key);
      let path = this.ghostWires.get(key);
      if (!path) {
        path = document.createElementNS(SVG, "path");
        path.setAttribute("class", "wire plan-wire");
        path.setAttribute("marker-end", "url(#wire-arrow)");
        this.svg.append(path);
        this.ghostWires.set(key, path);
      }
      const [p0, c1, c2, p3] = this.curve(a, b, false);
      path.setAttribute("d", `M${p0[0]} ${p0[1]} C${c1[0]} ${c1[1]} ${c2[0]} ${c2[1]} ${p3[0]} ${p3[1]}`);
      path.style.stroke = itemColor(line.material);
      path.classList.toggle("muted", this.channel !== "all" && channelOf(line.material) !== this.channel);
    }
    for (const [key, path] of this.ghostWires) {
      if (!live.has(key)) {
        path.remove();
        this.ghostWires.delete(key);
      }
    }
  }

  /** The same card as a real node, with nothing in it: no code, no materials. */
  private ghostHtml(s: GameState, ghost: Ghost): string {
    const used = s.ghostLines.filter((l) => l.from === ghost.id || l.to === ghost.id).length;
    const form = machineForms(ghost.type).length > 1 ? ` (${formLabel(ghost.form)})` : "";
    const ports = "●".repeat(used) + "○".repeat(Math.max(0, MAX_PORTS - used));
    const plain = ghost.type === WAREHOUSE || ghost.type === MOTOR || ghost.type === ENGINE;
    return `<b>${machineName(ghost.type)}${form}</b><span class="ports">${ports}</span><span class="flow">&nbsp;</span>` +
      (plain ? "" : `<span class="progress">[${".".repeat(14)}]</span>`);
  }

  /** Whether a node matches the search: its name, code or anything it holds. */
  private matches(s: GameState, node: GameNode, query: string): boolean {
    const held = [
      ...Object.values(node.ins).flatMap((stack) => (stack ? [stack.id] : [])),
      ...Object.keys(node.outs).filter((id) => node.outs[id] > 0),
      ...node.store.flatMap((stack) => (stack ? [stack.id] : [])),
    ];
    return [nodeLabel(s, node), ...held.flatMap((id) => [itemName(id), itemCode(id)])].some((text) => text.toLowerCase().includes(query));
  }

  constructor(
    private readonly game: () => GameState,
    private readonly open: (id: number) => void,
    private readonly build: (type: string) => void,
    private readonly openRoute: (from: number, to: number) => void,
    private readonly changed: () => void,
  ) {
    this.root.className = "graph-view";
    this.roster.className = "roster";
    this.roster.setAttribute("aria-label", "기지 설비");
    this.projectChip.type = "button";
    this.projectChip.className = "facility building";
    this.projectChip.hidden = true;
    this.projectChip.addEventListener("click", () => {
      const project = this.game().project;
      if (project) this.build(project.type);
    });
    this.roster.append(this.projectChip);
    this.palette.className = "palette";
    this.makeTools();
    this.marquee.className = "marquee";
    this.marquee.hidden = true;
    this.view.className = "box board-scroll";
    this.view.addEventListener("wheel", (e) => this.onWheel(e), { passive: false });
    this.board.className = "board";
    this.svg.setAttribute("class", "wires");
    this.svg.innerHTML = '<defs><marker id="wire-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path class="wire-arrow" d="M0 0 L10 5 L0 10 z"/></marker></defs>';
    this.board.append(this.svg, this.marquee);
    this.view.append(this.board);
    this.rosterList.className = "roster-list";
    this.rosterList.hidden = true;
    this.root.append(this.roster, this.rosterList, this.palette, this.tools, this.view);
    this.board.addEventListener("click", (e) => {
      if (e.target !== this.board && e.target !== this.svg) return;
      this.cancelLink();
      const s = this.game();
      // A machine in hand goes down where the player clicks.
      if (s.cursor && isMachine(s.cursor.id)) {
        const at = this.boardPoint(e);
        if (installHeld(s, Math.max(0, at.x - NODE_W / 2), Math.max(0, at.y - NODE_H / 2))) this.changed();
      }
    });
    this.board.addEventListener("pointermove", (e) => {
      this.pointer = this.boardPoint(e);
    });
    this.board.addEventListener("pointerleave", () => {
      this.pointer = null;
    });
    // No scrollbars: drag the ground to look around.
    this.board.addEventListener("pointerdown", (e) => {
      const target = e.target as Element;
      if (target !== this.board && target !== this.svg) return;
      const cursor = this.game().cursor;
      if (cursor && isMachine(cursor.id)) return;
      // Shift-drag draws a box around nodes. A plain drag moves the view.
      if (e.shiftKey) {
        this.boxFrom = this.boardPoint(e);
        return;
      }
      this.selected.clear();
      this.panFrom = { x: e.clientX - this.pan.x, y: e.clientY - this.pan.y };
      this.board.classList.add("panning");
    });
    window.addEventListener("pointermove", (e) => this.onDrag(e));
    window.addEventListener("pointerup", (e) => {
      if (this.boxFrom) this.endBox(e);
      this.endDrag();
    });
    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        this.cancelLink();
        this.closeList();
        this.selected.clear();
      }
      this.onKey(e);
    });
    // A click anywhere else closes the dropdown.
    document.addEventListener("click", (e) => {
      const target = e.target as Node;
      if (!this.roster.contains(target) && !this.rosterList.contains(target)) this.closeList();
    });
  }

  private closeList(): void {
    if (this.expanded === null) return;
    this.expanded = null;
    this.changed();
  }

  private cancelLink(): void {
    this.linkFrom = null;
    this.board.classList.remove("linking");
  }

  private clickNode(id: number): void {
    if (this.linkFrom === null) return this.open(id);
    const from = this.linkFrom;
    if (from === id) return this.cancelLink();
    const s = this.game();
    this.cancelLink();
    if (routeMaterials(s, from, id).length) {
      this.openRoute(from, id);
      return;
    }
    this.nodes.get(id)?.root.classList.add("refused");
    setTimeout(() => this.nodes.get(id)?.root.classList.remove("refused"), 260);
  }

  private makeNode(node: GameNode): NodeView {
    const root = document.createElement("div");
    root.className = "node";
    const body = document.createElement("button");
    body.type = "button";
    body.className = "node-body";
    const link = document.createElement("button");
    link.type = "button";
    link.className = "link";
    link.textContent = "+";
    link.setAttribute("aria-label", `${machineName(node.type)}에서 선 연결`);
    link.addEventListener("click", () => {
      this.linkFrom = node.id;
      this.board.classList.add("linking");
    });
    root.append(body, link);
    body.addEventListener("pointerdown", (e) => {
      this.drag = { id: node.id, dx: e.clientX, dy: e.clientY, moved: false };
    });
    body.addEventListener("click", (e) => {
      if (this.dragged) {
        this.dragged = false;
        return;
      }
      if (e.shiftKey) return this.toggleSelected(node.id);
      this.clickNode(node.id);
    });
    this.board.append(root);
    return { root, body, link, key: "" };
  }

  private dragged = false;

  private onDrag(e: PointerEvent): void {
    if (this.panFrom) {
      this.pan = { x: Math.min(0, e.clientX - this.panFrom.x), y: Math.min(0, e.clientY - this.panFrom.y) };
      this.applyView();
      return;
    }
    if (this.boxFrom) {
      const at = this.boardPoint(e);
      const left = Math.min(at.x, this.boxFrom.x);
      const top = Math.min(at.y, this.boxFrom.y);
      this.marquee.hidden = false;
      this.marquee.style.transform = `translate(${left}px, ${top}px)`;
      this.marquee.style.width = `${Math.abs(at.x - this.boxFrom.x)}px`;
      this.marquee.style.height = `${Math.abs(at.y - this.boxFrom.y)}px`;
      return;
    }
    if (!this.drag) return;
    const s = this.game();
    const dx = (e.clientX - this.drag.dx) / this.zoom;
    const dy = (e.clientY - this.drag.dy) / this.zoom;
    if (!this.drag.moved && Math.abs(dx) + Math.abs(dy) <= 3) return;
    this.drag.moved = true;
    this.drag.dx = e.clientX;
    this.drag.dy = e.clientY;
    // Dragging one of the selected nodes carries the whole selection.
    const moving = this.selected.has(this.drag.id) ? [...this.selected] : [this.drag.id];
    for (const id of moving) {
      const spot = this.spotOf(s, id);
      if (!spot) continue;
      spot.x = Math.max(0, spot.x + dx);
      spot.y = Math.max(0, spot.y + dy);
    }
    this.draw(); // keep dragging smooth between ticks
  }

  /** Selects everything inside the drawn box. */
  private endBox(e: PointerEvent): void {
    const from = this.boxFrom!;
    const at = this.boardPoint(e);
    const [left, right] = [Math.min(from.x, at.x), Math.max(from.x, at.x)];
    const [top, bottom] = [Math.min(from.y, at.y), Math.max(from.y, at.y)];
    const s = this.game();
    for (const item of [...s.nodes, ...s.ghosts]) {
      if (item.x + NODE_W > left && item.x < right && item.y + NODE_H > top && item.y < bottom) this.selected.add(item.id);
    }
    this.boxFrom = null;
    this.marquee.hidden = true;
    this.draw();
  }

  private endDrag(): void {
    this.panFrom = null;
    this.board.classList.remove("panning");
    if (this.drag?.moved) this.dragged = true;
    this.drag = null;
  }

  private nodeHtml(s: GameState, node: GameNode): string {
    const used = portsUsed(s, node.id);
    const ports = "●".repeat(used) + "○".repeat(MAX_PORTS - used);
    const tag = (id: string, n: number) => `<span style="color:${itemColor(id)}" data-tip="${itemName(id)}">${itemCode(id)}</span>${n}${unitOf(id)}`;
    if (node.type === WAREHOUSE) {
      const kinds = node.store.filter(Boolean).map((x) => tag(x!.id, x!.n)).slice(0, 4).join(" ");
      return `<b>${nodeLabel(s, node)}</b><span class="ports">${ports}</span><span class="flow">${kinds || "·"}</span>`;
    }
    if (node.type === RIVERBANK) {
      const site = s.sites[node.siteId!];
      return `<b>${nodeLabel(s, node)}</b><span class="ports">${ports}</span><span class="flow">${tag(site.ore, site.left)}/${site.total}L</span>`;
    }
    if (node.type === ENGINE) {
      const load = powerLoad(s, node);
      const fuel = nodeProcess(node).slots.map(({ key }) => tag(node.ins[key]?.id ?? key, node.ins[key]?.n ?? 0)).join(" ");
      return `<b>${nodeLabel(s, node)}</b><span class="ports">${ports}</span><span class="flow">${fuel}</span>` +
        `<span class="flow">동력 ${load.now}/${load.limit} · 연결 ${load.connected}</span>`;
    }
    if (node.type === MOTOR) {
      const load = powerLoad(s, node);
      return `<b>${nodeLabel(s, node)}</b><span class="ports">${ports}</span>` +
        `<span class="flow">힘 ${Math.floor(node.energy)}/${SPRING_MAX}</span>` +
        `<span class="flow">동력 ${load.now}/${load.limit} · 연결 ${load.connected}</span>`;
    }
    const recipe = recipeOf(node);
    const ins = nodeProcess(node).slots.map(({ key }, i) => tag(node.ins[key]?.id ?? Object.keys(recipe.in)[i], node.ins[key]?.n ?? 0)).join(" ");
    const outs = Object.keys(recipe.out).map((k) => tag(k, node.outs[k])).join(" ");
    const fill = Math.round(node.progress * 14);
    return `<b>${nodeLabel(s, node)}</b><span class="ports">${ports}</span>` +
      `<span class="flow">${ins}${outs ? ` &gt; ${outs}` : ""}</span>` +
      `<span class="progress">[${"#".repeat(fill).padEnd(14, ".")}]</span>`;
  }

  /**
   * The curve of a route. It leaves from the side facing its target, and when traffic
   * runs both ways each direction keeps to its own lane, like a two-way road.
   */
  private curve(a: { x: number; y: number }, b: { x: number; y: number }, twoWay: boolean): Curve {
    const ax = a.x + NODE_W / 2;
    const ay = a.y + NODE_H / 2;
    const bx = b.x + NODE_W / 2;
    const by = b.y + NODE_H / 2;
    const flat = Math.abs(bx - ax) / NODE_W >= Math.abs(by - ay) / NODE_H;
    const sx = bx >= ax ? 1 : -1;
    const sy = by >= ay ? 1 : -1;
    const start: Point2 = flat ? [ax + (sx * NODE_W) / 2, ay] : [ax, ay + (sy * NODE_H) / 2];
    const end: Point2 = flat ? [bx - (sx * NODE_W) / 2, by] : [bx, by - (sy * NODE_H) / 2];
    // Both directions shift to their own right, so they end up on opposite sides.
    const lane = twoWay ? LANE : 0;
    const shift: Point2 = flat ? [0, sx * lane] : [-sy * lane, 0];
    const p0: Point2 = [start[0] + shift[0], start[1] + shift[1]];
    const p3: Point2 = [end[0] + shift[0], end[1] + shift[1]];
    const bend = Math.max(30, Math.hypot(p3[0] - p0[0], p3[1] - p0[1]) * 0.4);
    const out: Point2 = flat ? [sx * bend, 0] : [0, sy * bend];
    return [p0, [p0[0] + out[0], p0[1] + out[1]], [p3[0] - out[0], p3[1] - out[1]], p3];
  }

  private makeLine(from: number, to: number): LineView {
    const path = document.createElementNS(SVG, "path");
    path.setAttribute("class", "wire");
    path.setAttribute("marker-end", "url(#wire-arrow)");
    // A wide invisible stroke makes the thin line easy to click.
    const hit = document.createElementNS(SVG, "path");
    hit.setAttribute("class", "wire-hit");
    hit.addEventListener("click", () => this.openRoute(from, to));
    const mover = document.createElementNS(SVG, "text");
    mover.setAttribute("class", "mover");
    const tag = document.createElementNS(SVG, "text");
    tag.setAttribute("class", "wire-tag");
    tag.addEventListener("click", () => this.openRoute(from, to));
    this.svg.append(path, hit, mover, tag);
    return { path, hit, mover, tag };
  }

  /** One entry per kind of facility. Clicking it lists every machine of that kind. */
  private drawRoster(s: GameState): void {
    const counts = new Map<string, GameNode[]>();
    for (const node of s.nodes) counts.set(node.type, [...(counts.get(node.type) ?? []), node]);
    for (const [type, b] of this.rosterItems) {
      if (!counts.has(type)) {
        b.remove();
        this.rosterItems.delete(type);
      }
    }
    for (const [type, group] of counts) {
      let b = this.rosterItems.get(type);
      if (!b) {
        b = document.createElement("button");
        b.type = "button";
        b.className = "facility";
        b.addEventListener("click", () => {
          this.expanded = this.expanded === type ? null : type;
          this.changed();
        });
        this.rosterItems.set(type, b);
        this.roster.insertBefore(b, this.projectChip);
      }
      const label = `${machineName(type)} ${group.length}`;
      if (b.textContent !== label) b.textContent = label;
      b.dataset.status = STATUS_ORDER.find((state) => group.some((n) => status(n) === state)) ?? "idle";
      b.classList.toggle("open", this.expanded === type);
    }
    this.drawList(s, this.expanded ? counts.get(this.expanded) ?? [] : []);
    const project = s.project;
    this.projectChip.hidden = !project;
    if (project) {
      const label = `${machineName(project.type)} ${project.done}/${machineWork(project.type)}`;
      if (this.projectChip.textContent !== label) this.projectChip.textContent = label;
    }
  }

  /** The machines of the open kind, each with its code and state. */
  private drawList(s: GameState, group: GameNode[]): void {
    this.rosterList.hidden = !group.length;
    // Drop down directly under the kind that was clicked.
    const anchor = this.expanded ? this.rosterItems.get(this.expanded) : undefined;
    if (anchor) {
      const box = anchor.getBoundingClientRect();
      const root = this.root.getBoundingClientRect();
      this.rosterList.style.left = `${box.left - root.left}px`;
      this.rosterList.style.top = `${box.bottom - root.top}px`;
    }
    for (const [id, b] of this.listItems) {
      if (!group.some((n) => n.id === id)) {
        b.remove();
        this.listItems.delete(id);
      }
    }
    for (const node of group) {
      let b = this.listItems.get(node.id);
      if (!b) {
        b = document.createElement("button");
        b.type = "button";
        b.className = "facility";
        b.addEventListener("click", () => {
          this.expanded = null;
          this.open(node.id);
          this.changed();
        });
        this.listItems.set(node.id, b);
        this.rosterList.append(b);
      }
      const state = status(node);
      const label = node.type === WAREHOUSE || node.type === RIVERBANK ? nodeLabel(s, node)
        : node.type === MOTOR ? `${nodeLabel(s, node)} · 힘 ${Math.floor(node.energy)}`
        : `${nodeLabel(s, node)} · ${STATUS_LABEL[state]}`;
      if (b.textContent !== label) b.textContent = label;
      b.dataset.status = state;
    }
  }

  draw(): void {
    const s = this.game();
    this.drawRoster(s);
    for (const [type, b] of this.paletteItems) {
      const owned = countOf(s, type);
      const label = `${machineName(type)} ${owned ? `x${owned}` : "+"}`;
      if (b.textContent !== label) b.textContent = label;
    }
    for (const [channel, b] of this.channels) b.classList.toggle("selected", channel === this.channel);
    this.copyButton.disabled = !this.selected.size;
    this.pasteButton.disabled = !this.clip.length;
    this.buildAll.hidden = !s.ghosts.length;
    const allLabel = `청사진 설치 ${s.ghosts.filter((g) => countOf(s, g.type) > 0).length}/${s.ghosts.length}`;
    if (this.buildAll.textContent !== allLabel) this.buildAll.textContent = allLabel;
    const query = this.search.value.trim().toLowerCase();
    for (const [id, view] of this.nodes) {
      if (!nodeById(s, id)) {
        view.root.remove();
        this.nodes.delete(id);
      }
    }
    let width = 1200;
    let height = 720;
    for (const node of s.nodes) {
      let view = this.nodes.get(node.id);
      if (!view) {
        view = this.makeNode(node);
        this.nodes.set(node.id, view);
      }
      view.root.style.transform = `translate(${node.x}px, ${node.y}px)`;
      const state = status(node);
      view.root.dataset.status = state;
      view.root.classList.toggle("source", this.linkFrom === node.id);
      view.root.classList.toggle("selected", this.selected.has(node.id));
      const found = !!query && this.matches(s, node, query);
      view.root.classList.toggle("dim", !!query && !found);
      view.root.classList.toggle("found", found);
      const html = this.nodeHtml(s, node);
      if (html !== view.key) {
        view.key = html;
        view.body.innerHTML = html;
      }
      width = Math.max(width, node.x + NODE_W + 60);
      height = Math.max(height, node.y + NODE_H + 60);
    }
    for (const ghost of s.ghosts) {
      width = Math.max(width, ghost.x + NODE_W + 60);
      height = Math.max(height, ghost.y + NODE_H + 60);
    }
    this.drawGhosts(s);
    // Zoomed out, the board still has to fill the view so the ground stays draggable.
    this.board.style.width = `${Math.max(width, this.view.clientWidth / this.zoom)}px`;
    this.board.style.height = `${Math.max(height, this.view.clientHeight / this.zoom)}px`;

    // All materials between the same two nodes share one line.
    const routes = new Map<string, Line[]>();
    for (const line of s.lines) {
      const key = `${line.from}>${line.to}`;
      routes.set(key, [...(routes.get(key) ?? []), line]);
    }
    for (const [key, view] of this.lines) {
      if (!routes.has(key)) {
        view.path.remove();
        view.hit.remove();
        view.mover.remove();
        view.tag.remove();
        this.lines.delete(key);
      }
    }
    for (const [key, group] of routes) {
      let view = this.lines.get(key);
      if (!view) {
        view = this.makeLine(group[0].from, group[0].to);
        this.lines.set(key, view);
      }
      const twoWay = routes.has(`${group[0].to}>${group[0].from}`);
      const [p0, c1, c2, p3] = this.curve(nodeById(s, group[0].from)!, nodeById(s, group[0].to)!, twoWay);
      const shape = `M${p0[0]} ${p0[1]} C${c1[0]} ${c1[1]} ${c2[0]} ${c2[1]} ${p3[0]} ${p3[1]}`;
      view.path.setAttribute("d", shape);
      view.hit.setAttribute("d", shape);
      view.path.style.stroke = group.length === 1 ? itemColor(group[0].material) : "";
      const lit = this.channel === "all" || group.some((l) => channelOf(l.material) === this.channel);
      for (const mark of [view.path, view.tag, view.mover]) mark.classList.toggle("muted", !lit);
      view.path.classList.toggle("lit", lit && this.channel !== "all");
      const names = group.map((l) => itemName(l.material)).join(", ");
      view.hit.dataset.tip = names;
      view.tag.dataset.tip = names;
      const codes = group.map((l) => l.material).join();
      if (view.tag.dataset.codes !== codes) {
        view.tag.dataset.codes = codes;
        view.tag.replaceChildren(...group.map((l, i) => {
          const span = document.createElementNS(SVG, "tspan");
          span.style.fill = itemColor(l.material);
          span.textContent = (i ? " " : "") + itemCode(l.material);
          return span;
        }));
      }
      const at = (t: number): Point2 => {
        const u = 1 - t;
        const axis = (i: 0 | 1) => u ** 3 * p0[i] + 3 * u * u * t * c1[i] + 3 * u * t * t * c2[i] + t ** 3 * p3[i];
        return [axis(0), axis(1)];
      };
      const [cx, cy] = at(0.5);
      view.tag.setAttribute("x", String(cx));
      view.tag.setAttribute("y", String(cy + 4));
      const moving = group.find((l) => l.active);
      view.mover.style.display = moving ? "" : "none";
      if (moving) {
        const [mx, my] = at(moving.timer / LINE_MS);
        view.mover.style.fill = itemColor(moving.material);
        if (view.mover.textContent !== itemCode(moving.material)) view.mover.textContent = itemCode(moving.material);
        view.mover.setAttribute("x", String(mx));
        view.mover.setAttribute("y", String(my + 4));
      }
    }
  }
}
