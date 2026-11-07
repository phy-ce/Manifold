// Base screen: machines as nodes, lines drawn between them.
import { MACHINE_TYPES, MAX_PORTS, MOTOR, WAREHOUSE, itemCode, itemColor, itemName, machineName, machineWork } from "../content";
import {
  GameNode, GameState, LINE_MS, Line, SPRING_MAX, nodeById, nodeLabel, nodeProcess, portsUsed, recipeOf, routeMaterials, status,
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
  private panFrom: { x: number; y: number } | null = null;

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
    for (const type of MACHINE_TYPES) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "tech";
      b.textContent = `${machineName(type)} +`;
      b.addEventListener("click", () => this.build(type));
      this.palette.append(b);
    }
    const scroll = document.createElement("div");
    scroll.className = "box board-scroll";
    this.board.className = "board";
    this.svg.setAttribute("class", "wires");
    this.svg.innerHTML = '<defs><marker id="wire-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path class="wire-arrow" d="M0 0 L10 5 L0 10 z"/></marker></defs>';
    this.board.append(this.svg);
    scroll.append(this.board);
    this.rosterList.className = "roster-list";
    this.rosterList.hidden = true;
    this.root.append(this.roster, this.rosterList, this.palette, scroll);
    this.board.addEventListener("click", (e) => {
      if (e.target === this.board) this.cancelLink();
    });
    // No scrollbars: drag the ground to look around.
    this.board.addEventListener("pointerdown", (e) => {
      const target = e.target as Element;
      if (target !== this.board && target !== this.svg) return;
      this.panFrom = { x: e.clientX - this.pan.x, y: e.clientY - this.pan.y };
      this.board.classList.add("panning");
    });
    window.addEventListener("pointermove", (e) => this.onDrag(e));
    window.addEventListener("pointerup", () => this.endDrag());
    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        this.cancelLink();
        this.closeList();
      }
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
      const current = nodeById(this.game(), node.id)!;
      this.drag = { id: node.id, dx: e.clientX - current.x, dy: e.clientY - current.y, moved: false };
    });
    body.addEventListener("click", () => {
      if (this.dragged) {
        this.dragged = false;
        return;
      }
      this.clickNode(node.id);
    });
    this.board.append(root);
    return { root, body, link, key: "" };
  }

  private dragged = false;

  private onDrag(e: PointerEvent): void {
    if (this.panFrom) {
      this.pan = { x: Math.min(0, e.clientX - this.panFrom.x), y: Math.min(0, e.clientY - this.panFrom.y) };
      this.board.style.transform = `translate(${this.pan.x}px, ${this.pan.y}px)`;
      return;
    }
    if (!this.drag) return;
    const node = nodeById(this.game(), this.drag.id);
    if (!node) return;
    const x = Math.max(0, e.clientX - this.drag.dx);
    const y = Math.max(0, e.clientY - this.drag.dy);
    if (Math.abs(x - node.x) + Math.abs(y - node.y) > 3) this.drag.moved = true;
    if (this.drag.moved) {
      node.x = x;
      node.y = y;
      this.draw(); // keep dragging smooth between ticks
    }
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
    const tag = (id: string, n: number) => `<span style="color:${itemColor(id)}" data-tip="${itemName(id)}">${itemCode(id)}</span>${n}`;
    if (node.type === WAREHOUSE) {
      const kinds = node.store.filter(Boolean).map((x) => tag(x!.id, x!.n)).slice(0, 4).join(" ");
      return `<b>${nodeLabel(s, node)}</b><span class="ports">${ports}</span><span class="flow">${kinds || "·"}</span>`;
    }
    if (node.type === MOTOR) {
      const wound = Math.round((node.energy / SPRING_MAX) * 14);
      return `<b>${nodeLabel(s, node)}</b><span class="ports">${ports}</span>` +
        `<span class="flow">힘 ${Math.floor(node.energy)}/${SPRING_MAX}</span>` +
        `<span class="progress">[${"#".repeat(wound).padEnd(14, ".")}]</span>`;
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
  private curve(s: GameState, line: Line, twoWay: boolean): Curve {
    const a = nodeById(s, line.from)!;
    const b = nodeById(s, line.to)!;
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
      const label = node.type === WAREHOUSE ? nodeLabel(s, node)
        : node.type === MOTOR ? `${nodeLabel(s, node)} · 힘 ${Math.floor(node.energy)}`
        : `${nodeLabel(s, node)} · ${STATUS_LABEL[state]}`;
      if (b.textContent !== label) b.textContent = label;
      b.dataset.status = state;
    }
  }

  draw(): void {
    const s = this.game();
    this.drawRoster(s);
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
      const html = this.nodeHtml(s, node);
      if (html !== view.key) {
        view.key = html;
        view.body.innerHTML = html;
      }
      width = Math.max(width, node.x + NODE_W + 60);
      height = Math.max(height, node.y + NODE_H + 60);
    }
    this.board.style.width = `${width}px`;
    this.board.style.height = `${height}px`;

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
      const [p0, c1, c2, p3] = this.curve(s, group[0], twoWay);
      const shape = `M${p0[0]} ${p0[1]} C${c1[0]} ${c1[1]} ${c2[0]} ${c2[1]} ${p3[0]} ${p3[1]}`;
      view.path.setAttribute("d", shape);
      view.hit.setAttribute("d", shape);
      view.path.style.stroke = group.length === 1 ? itemColor(group[0].material) : "";
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
