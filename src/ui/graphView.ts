// Base screen: machines as nodes, lines drawn between them.
import { tr } from "../i18n";
import { BELT_DRIVE, ENGINE, MANIFOLD, MAX_PORTS, TANK, TAR, PLAYABLE_STAGES, STAGES, isPassive, isStore, formLabel, machineForms, MOTOR, isMachine, unitOf, itemCode, itemColor, itemName, machineName } from "../content";
import {
  NAME_MAX, TAR_TANK_CAP, addGhost, nextSpot, needsModule, powerLoad, rename, buildAllGhosts, buildGhost, copyToGhosts, countOf, createGroup, installHeld, removeGhost, removeGroup,
  Ghost, Group, GameNode, GameState, LINE_LAYERS, LINE_MS, Line, LineLayer, SPRING_MAX, BELT_MAX, DRIVE_RATE, beltNetOf, lineLayer, nodeById, nodeLabel, nodeProcess, portsUsed, recipeOf, routeMaterials, status,
} from "../engine/game";
import { SIZE } from "./theme";

const NODE_W = SIZE.nodeW;
const NODE_H = SIZE.nodeH;
const SVG = "http://www.w3.org/2000/svg";
type Point2 = [number, number];
/** A wire's corners. Every run is straight or at 45 degrees. */
type Wire = Point2[];
/** How far a wire leaves a node straight before it turns. */
const WIRE_STUB = 14;
/** Widest gap between wires sharing one side of a node. */
const SLOT_GAP = 18;
/** Gap between wires whose middle runs would share a track. */
const TRACK_GAP = 9;
/** Line widths, matching style.css: a plain strand, and the outside of a pipe. */
const STRAND_W = 3;
const PIPE_W = 7;
/** Size of the arrowhead at a wire's end. */
const ARROW = 10;
/** A wire's tag width per character and padding, its height, and where along the wire it may sit. */
const TAG_CHAR = 8;
const TAG_PAD = 6;
const TAG_H = 15;
const TAG_SPOTS = [0.5, 0.38, 0.62, 0.28, 0.72, 0.2, 0.8];

const wirePath = (wire: Wire): string => `M${wire.map((p) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" L")}`;

type Side = "L" | "R" | "T" | "B";
type Box = { x: number; y: number };
/** Where a wire between two boxes leaves and arrives, before it is spread along the side. */
interface Attach { flat: boolean; start: Point2; end: Point2; out: Side; into: Side }
const centreOf = (b: Box): Point2 => [b.x + NODE_W / 2, b.y + NODE_H / 2];

/** A wire leaves from the side facing its target. */
function attach(a: Box, b: Box): Attach {
  const [ax, ay] = centreOf(a);
  const [bx, by] = centreOf(b);
  const flat = Math.abs(bx - ax) / NODE_W >= Math.abs(by - ay) / NODE_H;
  const sx = bx >= ax ? 1 : -1;
  const sy = by >= ay ? 1 : -1;
  return {
    flat,
    start: flat ? [ax + (sx * NODE_W) / 2, ay] : [ax, ay + (sy * NODE_H) / 2],
    end: flat ? [bx - (sx * NODE_W) / 2, by] : [bx, by - (sy * NODE_H) / 2],
    out: flat ? (sx > 0 ? "R" : "L") : (sy > 0 ? "B" : "T"),
    into: flat ? (sx > 0 ? "L" : "R") : (sy > 0 ? "T" : "B"),
  };
}

/**
 * The corners between two attach points. With room to go straight it splits around one
 * diagonal; otherwise two diagonals with a run between, so it still enters head on.
 * `shift` moves that middle run sideways, keeping the corners at 45 degrees.
 */
function route(p0: Point2, p3: Point2, flat: boolean, shift = 0): Wire {
  const ahead = Math.abs(flat ? p3[0] - p0[0] : p3[1] - p0[1]);
  const side = Math.abs(flat ? p3[1] - p0[1] : p3[0] - p0[0]);
  const signX = Math.sign(p3[0] - p0[0]) || 1;
  const signY = Math.sign(p3[1] - p0[1]) || 1;
  const at = (a: number, c: number): Point2 => (flat
    ? [p0[0] + signX * a, p0[1] + signY * c]
    : [p0[0] + signX * c, p0[1] + signY * a]);
  if (side <= ahead) {
    const straight = (ahead - side) / 2;
    return [p0, at(straight, 0), at(straight + side, side), p3];
  }
  const stub = Math.min(WIRE_STUB, ahead / 4);
  const room = ahead - stub * 2;
  const first = Math.max(0, Math.min(room, room / 2 + shift * (flat ? signX : signY)));
  return [p0, at(stub, 0), at(stub + first, first), at(stub + first, side - (room - first)), at(ahead - stub, side), p3];
}

/** A wire moved sideways by `d`, with mitred corners, for the strands of a bundle. */
function offsetWire(wire: Wire, d: number): Wire {
  if (!d) return wire;
  const normal = (a: Point2, b: Point2): Point2 => {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    return [-(b[1] - a[1]) / len, (b[0] - a[0]) / len];
  };
  return wire.map((p, i) => {
    const n1 = i > 0 ? normal(wire[i - 1], p) : undefined;
    const n2 = i < wire.length - 1 ? normal(p, wire[i + 1]) : undefined;
    if (!n1 || !n2) {
      const n = (n1 ?? n2)!;
      return [p[0] + n[0] * d, p[1] + n[1] * d];
    }
    const mx = n1[0] + n2[0];
    const my = n1[1] + n2[1];
    const len = Math.hypot(mx, my) || 1;
    const cos = (mx / len) * n1[0] + (my / len) * n1[1];
    return [p[0] + ((mx / len) * d) / cos, p[1] + ((my / len) * d) / cos];
  });
}

/** The arrowhead at a wire's end, pointing the way the last run goes. */
function arrowPoints(wire: Wire): string {
  const end = wire[wire.length - 1];
  const before = wire[wire.length - 2];
  const angle = Math.atan2(end[1] - before[1], end[0] - before[0]);
  const at = (r: number, t: number) => `${(end[0] + Math.cos(angle + t) * r).toFixed(1)},${(end[1] + Math.sin(angle + t) * r).toFixed(1)}`;
  return `${at(0, 0)} ${at(ARROW, Math.PI - 0.5)} ${at(ARROW, Math.PI + 0.5)}`;
}

/** The spot a share of the way along a wire, by distance. */
function alongWire(wire: Wire, share: number): Point2 {
  const lengths = wire.slice(1).map((p, i) => Math.hypot(p[0] - wire[i][0], p[1] - wire[i][1]));
  let left = lengths.reduce((a, b) => a + b, 0) * share;
  for (let i = 0; i < lengths.length; i += 1) {
    if (left <= lengths[i] && lengths[i] > 0) {
      const k = left / lengths[i];
      return [wire[i][0] + (wire[i + 1][0] - wire[i][0]) * k, wire[i][1] + (wire[i + 1][1] - wire[i][1]) * k];
    }
    left -= lengths[i];
  }
  return wire[wire.length - 1];
}
/** Which state a kind of facility shows when its machines differ: the one needing attention. */
const STATUS_ORDER = ["blocked", "manual", "run", "idle"] as const;
const STATUS_LABEL = { blocked: tr("출력 막힘"), manual: tr("작업 대기"), run: tr("가동 중"), idle: tr("재료 부족") };

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
/** What a belt drive is doing: how many belts it runs and how fast, or why it stands. */
export function beltSummary(node: GameNode, detail = false): string {
  const net = beltNetOf(node.id);
  if (!net?.belts) return tr("연결된 벨트 없음");
  // What this drive alone puts in, then, in the window, how the whole network shares it out.
  const own = `${tr("공급")} ${node.speed ? DRIVE_RATE : 0}${tr("개/초")}`;
  if (!node.speed) return `${own} · ${tr("동력 없음")}`;
  const short = (n: number) => Math.round(n * 100) / 100;
  const whole = `${tr("구동기")} ${net.running}${tr("대")} · ${tr("벨트")} ${net.belts}${tr("줄")} · ${tr("벨트당")} ${short(net.rate)}${tr("개/초")}${net.rate >= BELT_MAX ? ` (${tr("최대")})` : ""}`;
  return detail ? `${own} · ${whole}` : `${own} · ${tr("벨트")} ${net.belts}${tr("줄")}`;
}

/** The layers the board shows one at a time. Lines on the other layers are not drawn at all. */
const LAYERS: [LineLayer, string][] = [["item", tr("재료")], ["fluid", tr("유체")], ["power", tr("동력")]];
/** Remembers the layer between visits. It is a view setting, so it stays out of the save. */
const LAYER_KEY = "modpack-simulator-graph-layer";
function savedLayer(): LineLayer {
  try {
    const value = localStorage.getItem(LAYER_KEY);
    return LINE_LAYERS.find((l) => l === value) ?? "item";
  } catch {
    return "item";
  }
}
/** Board zoom limits, and how much one wheel notch changes it. */
const ZOOM_MIN = 0.4;
const ZOOM_MAX = 1.6;
const ZOOM_STEP = 1.1;
/** How far a paste lands from the original when the pointer isn't over the board. */
const PASTE_OFFSET = 40;

/** A route's wire as it is laid out for one frame. */
interface WirePlan {
  group: Line[];
  view: LineView;
  /** Which box each end sits on: a node, or the card of a folded group. */
  fromKey: string;
  toKey: string;
  fromBox: Box;
  toBox: Box;
  at: Attach;
  p0: Point2;
  p3: Point2;
  wire: Wire;
  /** Same at both ends, to break ties the same way on each side. */
  rank: number;
}
/** One material's mark on a wire: a plain or dashed strand, or a pipe with its core. */
interface Strand { paths: SVGPathElement[] }
interface LineView {
  /** Holds the casing, the strands and the arrowhead, so they fade together. */
  set: SVGGElement;
  casing: SVGPathElement;
  strands: Strand[];
  arrow: SVGPolygonElement;
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
  private readonly palette = document.createElement("div");
  private readonly board = document.createElement("div");
  private readonly svg = document.createElementNS(SVG, "svg");
  /** Wires underneath, then their click strips, then their tags, so no wire hides another's tag. */
  private readonly wireLayer = document.createElementNS(SVG, "g");
  private readonly hitLayer = document.createElementNS(SVG, "g");
  private readonly tagLayer = document.createElementNS(SVG, "g");
  private readonly nodes = new Map<number, NodeView>();
  private readonly lines = new Map<string, LineView>();
  private linkFrom: number | null = null;
  private drag: { id: number; dx: number; dy: number; moved: boolean; copy: boolean } | null = null;
  private pan = { x: 0, y: 0 };
  private zoom = 1;
  private readonly view = document.createElement("div");
  private readonly zoomButton = document.createElement("button");
  private panFrom: { x: number; y: number } | null = null;

  private stage = -1;
  private readonly paletteItems = new Map<string, HTMLButtonElement>();
  private readonly tools = document.createElement("div");
  private readonly search = document.createElement("input");
  private readonly layerButtons = new Map<LineLayer, HTMLButtonElement>();
  private readonly copyButton = document.createElement("button");
  private readonly pasteButton = document.createElement("button");
  private readonly buildAll = document.createElement("button");
  private readonly ghostViews = new Map<number, GhostView>();
  private readonly ghostWires = new Map<string, SVGPathElement>();
  /** The node under the pointer, whose wires stay while the rest fade. */
  private tracing: number | undefined;
  private readonly marquee = document.createElement("div");
  private readonly menu = document.createElement("div");
  private readonly groupButton = document.createElement("button");
  private readonly groupViews = new Map<number, GhostView>();
  /** Waiting for the player to click the node that will face the outside. */
  private pickingPort = false;
  private readonly selected = new Set<number>();
  private clip: number[] = [];
  /** The layer on screen. New lines are made on it, and the route window lists only its channels. */
  layer: LineLayer = savedLayer();
  private pointer: { x: number; y: number } | null = null;
  private boxFrom: { x: number; y: number } | null = null;

  /** Fills the build list with what the current stage has opened. */
  setStage(stage: number): void {
    if (stage === this.stage) return;
    this.stage = stage;
    this.paletteItems.clear();
    // One entry per stage. Pointing at it drops down that stage's machines.
    this.palette.replaceChildren(...STAGES.slice(0, Math.min(stage + 1, PLAYABLE_STAGES)).map((tier) => {
      const group = document.createElement("div");
      group.className = "tier";
      const head = document.createElement("button");
      head.type = "button";
      head.className = "tech";
      head.textContent = tier.id;
      const list = document.createElement("div");
      list.className = "tier-list";
      const name = document.createElement("span");
      name.className = "tier-name";
      name.textContent = tier.name;
      list.append(name);
      for (const type of tier.unlockMachines) {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "tech";
        b.dataset.tip = tr("청사진을 놓습니다. 기계는 건설대에서 만듭니다");
        b.addEventListener("click", () => this.plan(type));
        this.paletteItems.set(type, b);
        list.append(b);
      }
      group.append(head, list);
      return group;
    }));
  }

  /** The tools above the board: find, pick which lines stand out, copy and paste. */
  private makeTools(): void {
    this.tools.className = "graph-tools";
    this.search.id = "graph-search";
    this.search.type = "search";
    this.search.placeholder = tr("노드 찾기");
    this.search.setAttribute("aria-label", tr("노드 찾기"));
    this.search.addEventListener("input", () => this.draw());
    const lines = document.createElement("div");
    lines.className = "modes layers";
    lines.setAttribute("role", "group");
    lines.setAttribute("aria-label", tr("레이어"));
    for (const [layer, label] of LAYERS) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "tech";
      b.dataset.layer = layer;
      b.dataset.tip = tr("L 키로 다음 레이어");
      b.textContent = label;
      b.addEventListener("click", () => this.setLayer(layer));
      this.layerButtons.set(layer, b);
      lines.append(b);
    }
    const action = (b: HTMLButtonElement, label: string, tip: string, run: () => void) => {
      b.type = "button";
      b.className = "tech";
      b.textContent = label;
      b.dataset.tip = tip;
      b.addEventListener("click", run);
    };
    action(this.copyButton, tr("복사"), tr("Shift+클릭으로 고른 노드를 복사합니다 (Ctrl+C)"), () => this.copy());
    action(this.pasteButton, tr("붙여넣기"), tr("복사한 구성을 청사진으로 놓습니다 (Ctrl+V)"), () => this.paste());
    action(this.buildAll, "", tr("가진 기계로 청사진을 실제로 바꿉니다"), () => {
      buildAllGhosts(this.game());
      this.changed();
    });
    action(this.zoomButton, "100%", tr("휠로 확대/축소합니다. 누르면 100%로 돌아갑니다"), () => {
      this.zoom = 1;
      this.applyView();
      this.draw();
    });
    action(this.groupButton, tr("묶기"), tr("고른 노드를 하나로 묶습니다. 누른 뒤 외부와 연결할 노드를 클릭하세요"), () => {
      this.pickingPort = !this.pickingPort;
      this.draw();
    });
    this.tools.append(this.search, lines, this.copyButton, this.pasteButton, this.groupButton, this.buildAll, this.zoomButton);
  }

  /** Lays down a blueprint of a machine at the next free spot. */
  private plan(type: string): void {
    const s = this.game();
    const at = nextSpot(s);
    addGhost(s, type, at.x, at.y);
    this.changed();
  }

  private setLayer(layer: LineLayer): void {
    if (layer === this.layer) return;
    this.layer = layer;
    this.cancelLink();
    try {
      localStorage.setItem(LAYER_KEY, layer);
    } catch {
      // Without storage the board just starts on the item layer next time.
    }
    this.changed();
  }

  private copy(): void {
    const s = this.game();
    // A group copies as the nodes inside it.
    if (this.selected.size) this.clip = [...this.selected].flatMap((id) => s.groups.find((g) => g.id === id)?.nodes ?? [id]);
    this.draw();
  }

  /** The group card that stands in for a node, while that group is folded. */
  private cardOf(s: GameState, id: number): Group | undefined {
    return s.groups.find((group) => !group.open && group.nodes.includes(id));
  }

  private makeGroup(group: Group): GhostView {
    const root = document.createElement("div");
    root.className = "node group";
    root.dataset.id = String(group.id);
    const body = document.createElement("button");
    body.type = "button";
    body.className = "node-body";
    const link = document.createElement("button");
    link.type = "button";
    link.className = "link";
    link.textContent = "+";
    link.setAttribute("aria-label", tr("묶음의 외부 연결 노드에서 선 연결"));
    link.addEventListener("click", () => {
      this.linkFrom = group.port;
      this.board.classList.add("linking");
    });
    const split = document.createElement("button");
    split.type = "button";
    split.className = "link split";
    split.textContent = "x";
    split.dataset.tip = tr("묶음을 풉니다. 기계와 선은 그대로입니다");
    split.setAttribute("aria-label", tr("묶음 풀기"));
    split.addEventListener("click", () => {
      removeGroup(this.game(), group.id);
      this.selected.delete(group.id);
      this.changed();
    });
    root.append(body, link, split);
    body.addEventListener("pointerdown", (e) => {
      this.drag = { id: group.id, dx: e.clientX, dy: e.clientY, moved: false, copy: false };
    });
    body.addEventListener("click", (e) => {
      if (this.dragged) {
        this.dragged = false;
        return;
      }
      if (e.shiftKey) return this.toggleSelected(group.id);
      if (this.linkFrom !== null) return this.clickNode(group.port);
      group.open = !group.open;
      this.changed();
    });
    this.board.append(root);
    return { root, body, key: "" };
  }

  private drawGroups(s: GameState, query: string): void {
    for (const [id, view] of this.groupViews) {
      if (!s.groups.some((g) => g.id === id)) {
        view.root.remove();
        this.groupViews.delete(id);
      }
    }
    for (const group of s.groups) {
      let view = this.groupViews.get(group.id);
      if (!view) {
        view = this.makeGroup(group);
        this.groupViews.set(group.id, view);
      }
      const members = group.nodes.flatMap((id) => nodeById(s, id) ?? []);
      const port = nodeById(s, group.port)!;
      view.root.style.transform = `translate(${group.x}px, ${group.y}px)`;
      view.root.classList.toggle("selected", this.selected.has(group.id));
      view.root.classList.toggle("open", group.open);
      view.root.dataset.status = STATUS_ORDER.find((state) => members.some((n) => status(n) === state)) ?? "idle";
      const found = !!query && members.some((n) => this.matches(s, n, query));
      view.root.classList.toggle("dim", !!query && !found);
      view.root.classList.toggle("found", found);
      const used = portsUsed(s, port.id);
      const running = members.filter((n) => status(n) === "run").length;
      const html = `<b>${group.name ?? tr("묶음")} ${group.code}</b><span class="ports">${"●".repeat(used)}${"○".repeat(Math.max(0, MAX_PORTS - used))}</span>` +
        `<span class="flow">${tr("외부:")} ${nodeLabel(s, port)}</span>` +
        `<span class="flow">${tr("노드")} ${members.length} · ${tr("가동")} ${running}${group.open ? tr(" · 펼침") : ""}</span>`;
      if (html !== view.key) {
        view.key = html;
        view.body.innerHTML = html;
      }
    }
  }

  /** Right-click: what can be done to this node, or to the ground. */
  private openMenu(e: MouseEvent): void {
    e.preventDefault();
    const s = this.game();
    const card = (e.target as Element).closest<HTMLElement>(".node");
    const id = card ? Number(card.dataset.id) : null;
    // Right-clicking something outside the selection works on just that thing.
    if (id !== null && !this.selected.has(id)) {
      this.selected.clear();
      this.selected.add(id);
    }
    const at = this.boardPoint(e);
    const ghost = s.ghosts.find((g) => g.id === id);
    const group = s.groups.find((g) => g.id === id);
    const items: [string, boolean, () => void][] = [];
    if (id !== null && nodeById(s, id)) items.push([tr("열기"), true, () => this.open(id)]);
    if (id !== null && (nodeById(s, id) || group)) items.push([tr("이름 바꾸기"), true, () => this.askName(id)]);
    if (ghost) {
      items.push([tr("설치"), countOf(s, ghost.type) > 0, () => {
        buildGhost(s, ghost.id);
        this.selected.delete(ghost.id);
      }]);
      items.push([tr("청사진 지우기"), true, () => {
        removeGhost(s, ghost.id);
        this.selected.delete(ghost.id);
      }]);
    }
    if (group) {
      items.push([group.open ? tr("접기") : tr("펼치기"), true, () => {
        group.open = !group.open;
      }]);
      items.push([tr("묶음 풀기"), true, () => {
        removeGroup(s, group.id);
        this.selected.delete(group.id);
      }]);
    }
    if (this.selected.size) items.push([tr("복사"), true, () => this.copy()]);
    items.push([tr("붙여넣기"), this.clip.length > 0, () => this.paste(at)]);
    if ([...this.selected].filter((n) => nodeById(s, n)).length >= 2) {
      items.push([tr("묶기"), true, () => {
        this.pickingPort = true;
      }]);
    }
    if (s.ghosts.length) items.push([tr("청사진 모두 설치"), s.ghosts.some((g) => countOf(s, g.type) > 0), () => buildAllGhosts(s)]);
    if (this.selected.size) items.push([tr("선택 풀기"), true, () => this.selected.clear()]);
    this.menu.replaceChildren(...items.map(([label, enabled, run]) => {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = label;
      b.disabled = !enabled;
      b.addEventListener("click", (e) => {
        // The menu may turn into a name box, which an outside click would close.
        e.stopPropagation();
        this.menu.hidden = true;
        run();
        this.changed();
      });
      return b;
    }));
    this.menu.hidden = false;
    // Keep the whole menu on screen near the window's edges.
    const box = this.menu.getBoundingClientRect();
    this.menu.style.left = `${Math.min(e.clientX, window.innerWidth - box.width)}px`;
    this.menu.style.top = `${Math.min(e.clientY, window.innerHeight - box.height)}px`;
    this.draw();
  }

  /** Turns the menu into a name box, in the same spot. */
  private askName(id: number): void {
    const s = this.game();
    const target = nodeById(s, id) ?? s.groups.find((g) => g.id === id);
    const input = document.createElement("input");
    input.id = "node-name";
    input.type = "text";
    input.maxLength = NAME_MAX;
    input.value = target?.name ?? "";
    input.placeholder = tr("비우면 기본 이름");
    input.setAttribute("aria-label", tr("노드 이름"));
    const finish = (save: boolean) => {
      if (this.menu.hidden) return;
      this.menu.hidden = true;
      if (save) rename(this.game(), id, input.value);
      this.changed();
    };
    input.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Enter") finish(true);
      if (e.key === "Escape") finish(false);
    });
    input.addEventListener("blur", () => finish(true));
    this.menu.replaceChildren(input);
    this.menu.hidden = false;
    input.focus();
    input.select();
  }

  /** Lays the copied nodes down as a plan, at the given spot or the pointer if it is over the board. */
  private paste(spot?: { x: number; y: number }): void {
    const s = this.game();
    const spots = this.clip.flatMap((id) => {
      const at = this.spotOf(s, id);
      return at ? [at] : [];
    });
    if (!spots.length) return;
    const left = Math.min(...spots.map((p) => p.x));
    const top = Math.min(...spots.map((p) => p.y));
    const target = spot ?? this.pointer;
    const dx = target ? Math.max(0, target.x) - left : PASTE_OFFSET;
    const dy = target ? Math.max(0, target.y) - top : PASTE_OFFSET;
    const copies = copyToGhosts(s, this.clip, dx, dy);
    this.selected.clear();
    for (const ghost of copies) this.selected.add(ghost.id);
    this.changed();
  }

  private spotOf(s: GameState, id: number): { x: number; y: number } | undefined {
    return nodeById(s, id) ?? s.ghosts.find((g) => g.id === id) ?? s.groups.find((g) => g.id === id);
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
    else if (e.code === "KeyL" && !e.ctrlKey && !e.metaKey && !e.altKey && !e.repeat && !document.querySelector(".window-back:not([hidden])")) {
      this.setLayer(LINE_LAYERS[(LINE_LAYERS.indexOf(this.layer) + 1) % LINE_LAYERS.length]);
    }
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
    root.dataset.id = String(ghost.id);
    root.dataset.status = "idle";
    const body = document.createElement("button");
    body.type = "button";
    body.className = "node-body";
    const drop = document.createElement("button");
    drop.type = "button";
    drop.className = "link";
    drop.textContent = "x";
    drop.setAttribute("aria-label", tr("청사진 지우기"));
    drop.addEventListener("click", () => {
      removeGhost(this.game(), ghost.id);
      this.selected.delete(ghost.id);
      this.changed();
    });
    root.append(body, drop);
    body.addEventListener("pointerdown", (e) => {
      this.drag = { id: ghost.id, dx: e.clientX, dy: e.clientY, moved: false, copy: e.ctrlKey || e.metaKey };
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
      view.body.dataset.tip = countOf(s, ghost.type) ? tr("클릭해서 설치") : tr("기계가 필요합니다");
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
      if (!a || !b || lineLayer(s, line.from, line.material) !== this.layer) continue;
      const key = `${line.from}>${line.to}:${line.material}`;
      live.add(key);
      let path = this.ghostWires.get(key);
      if (!path) {
        path = document.createElementNS(SVG, "path");
        path.setAttribute("class", "wire plan-wire");
        path.setAttribute("marker-end", "url(#wire-arrow)");
        this.wireLayer.append(path);
        this.ghostWires.set(key, path);
      }
      const at = attach(a, b);
      path.setAttribute("d", wirePath(route(at.start, at.end, at.flat)));
      path.style.stroke = itemColor(line.material);
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
    const plain = isPassive(ghost.type) || ghost.type === MOTOR || ghost.type === ENGINE;
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
    private readonly openRoute: (from: number, to: number) => void,
    private readonly changed: () => void,
  ) {
    this.root.className = "graph-view";
    this.roster.className = "roster";
    this.roster.setAttribute("aria-label", tr("기지 설비"));
    this.palette.className = "palette";
    this.makeTools();
    this.menu.className = "context-menu";
    this.menu.hidden = true;
    this.marquee.className = "marquee";
    this.marquee.hidden = true;
    this.view.className = "box board-scroll";
    this.view.addEventListener("wheel", (e) => this.onWheel(e), { passive: false });
    this.board.className = "board";
    this.svg.setAttribute("class", "wires");
    this.svg.innerHTML = '<defs><marker id="wire-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path class="wire-arrow" d="M0 0 L10 5 L0 10 z"/></marker></defs>';
    this.svg.append(this.wireLayer, this.hitLayer, this.tagLayer);
    this.board.append(this.svg, this.marquee);
    this.view.append(this.board);
    this.rosterList.className = "roster-list";
    this.rosterList.hidden = true;
    this.root.append(this.roster, this.rosterList, this.palette, this.tools, this.view, this.menu);
    this.board.addEventListener("contextmenu", (e) => this.openMenu(e));
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
        this.pickingPort = false;
        this.menu.hidden = true;
      }
      this.onKey(e);
    });
    // A click anywhere else closes the dropdown.
    document.addEventListener("click", (e) => {
      const target = e.target as Node;
      if (!this.menu.contains(target)) this.menu.hidden = true;
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
    // A line is made on the layer on screen, so the target has to take something on it.
    if (routeMaterials(s, from, id).some((m) => lineLayer(s, from, m) === this.layer)) {
      this.openRoute(from, id);
      return;
    }
    this.nodes.get(id)?.root.classList.add("refused");
    const target = nodeById(s, id);
    if (target && needsModule(target) && !target.module) this.nodes.get(id)!.root.dataset.tip = tr("증기 모듈이 있어야 증기 동력을 받습니다");
    setTimeout(() => this.nodes.get(id)?.root.classList.remove("refused"), 260);
  }

  private makeNode(node: GameNode): NodeView {
    const root = document.createElement("div");
    root.className = "node";
    root.dataset.id = String(node.id);
    const body = document.createElement("button");
    body.type = "button";
    body.className = "node-body";
    const link = document.createElement("button");
    link.type = "button";
    link.className = "link";
    link.textContent = "+";
    link.setAttribute("aria-label", `${machineName(node.type)}${tr("에서 선 연결")}`);
    link.addEventListener("click", () => {
      this.linkFrom = node.id;
      this.board.classList.add("linking");
    });
    root.append(body, link);
    root.addEventListener("mouseenter", () => {
      this.tracing = node.id;
      this.draw();
    });
    root.addEventListener("mouseleave", () => {
      if (this.tracing !== node.id) return;
      this.tracing = undefined;
      this.draw();
    });
    body.addEventListener("pointerdown", (e) => {
      this.drag = { id: node.id, dx: e.clientX, dy: e.clientY, moved: false, copy: e.ctrlKey || e.metaKey };
    });
    body.addEventListener("click", (e) => {
      if (this.dragged) {
        this.dragged = false;
        return;
      }
      if (e.shiftKey) return this.toggleSelected(node.id);
      if (this.pickingPort) {
        this.pickingPort = false;
        const s = this.game();
        const group = createGroup(s, [...this.selected], node.id);
        if (group) this.selected.clear();
        this.changed();
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
    // Ctrl-drag leaves the originals alone and carries a blueprint copy instead.
    if (this.drag.copy && !this.drag.moved) {
      const ids = this.selected.has(this.drag.id) ? [...this.selected] : [this.drag.id];
      const copies = copyToGhosts(s, ids, 0, 0);
      if (!copies.length) {
        this.drag = null;
        return;
      }
      this.selected.clear();
      for (const ghost of copies) this.selected.add(ghost.id);
      this.drag.id = copies[0].id;
    }
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
    for (const item of [...s.nodes.filter((n) => !this.cardOf(s, n.id)), ...s.ghosts, ...s.groups]) {
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
    if (node.type === TANK) {
      return `<b>${nodeLabel(s, node)}</b><span class="ports">${ports}</span><span class="flow">${tag(TAR, node.ins[TAR]?.n ?? 0)}/${TAR_TANK_CAP}L</span>`;
    }
    if (node.type === MANIFOLD) {
      return `<b>${nodeLabel(s, node)}</b><span class="ports">${ports}</span><span class="flow">${tr("동력을 나눕니다")}</span>`;
    }
    if (node.type === BELT_DRIVE) {
      return `<b>${nodeLabel(s, node)}</b><span class="ports">${ports}</span><span class="flow">${beltSummary(node)}</span>`;
    }
    if (isStore(node.type)) {
      const kinds = node.store.filter(Boolean).map((x) => tag(x!.id, x!.n)).slice(0, 4).join(" ");
      return `<b>${nodeLabel(s, node)}</b><span class="ports">${ports}</span><span class="flow">${kinds || "·"}</span>`;
    }
    if (node.type === ENGINE) {
      const load = powerLoad(s, node);
      const fuel = nodeProcess(node).slots.map(({ key }) => tag(node.ins[key]?.id ?? key, node.ins[key]?.n ?? 0)).join(" ");
      return `<b>${nodeLabel(s, node)}</b><span class="ports">${ports}</span><span class="flow">${fuel}</span>` +
        `<span class="flow">${tr("동력")} ${load.now}/${load.limit} · ${tr("연결")} ${load.connected}</span>`;
    }
    if (node.type === MOTOR) {
      const load = powerLoad(s, node);
      return `<b>${nodeLabel(s, node)}</b><span class="ports">${ports}</span>` +
        `<span class="flow">${tr("힘")} ${Math.floor(node.energy)}/${SPRING_MAX}</span>` +
        `<span class="flow">${tr("동력")} ${load.now}/${load.limit} · ${tr("연결")} ${load.connected}</span>`;
    }
    const recipe = recipeOf(node);
    const ins = nodeProcess(node).slots.map(({ key }, i) => tag(node.ins[key]?.id ?? Object.keys(recipe.in)[i], node.ins[key]?.n ?? 0)).join(" ");
    const outs = Object.keys(recipe.out).map((k) => tag(k, node.outs[k])).join(" ");
    const fill = Math.round(node.progress * 14);
    return `<b>${nodeLabel(s, node)}</b><span class="ports">${ports}</span>` +
      `<span class="flow">${ins}${outs ? ` &gt; ${outs}` : ""}</span>` +
      `<span class="progress">[${"#".repeat(fill).padEnd(14, ".")}]</span>`;
  }

  private makeLine(from: number, to: number): LineView {
    const set = document.createElementNS(SVG, "g");
    set.setAttribute("class", "wire-set");
    // Drawn just under its own strands, the casing cuts a gap where a later wire crosses an earlier one.
    const casing = document.createElementNS(SVG, "path");
    casing.setAttribute("class", "wire-case");
    const arrow = document.createElementNS(SVG, "polygon");
    set.append(casing, arrow);
    // A wide invisible stroke makes the thin line easy to click.
    const hit = document.createElementNS(SVG, "path");
    hit.setAttribute("class", "wire-hit");
    hit.addEventListener("click", () => this.openRoute(from, to));
    const mover = document.createElementNS(SVG, "text");
    mover.setAttribute("class", "mover");
    const tag = document.createElementNS(SVG, "text");
    tag.setAttribute("class", "wire-tag");
    tag.addEventListener("click", () => this.openRoute(from, to));
    this.wireLayer.append(set);
    this.hitLayer.append(hit);
    this.tagLayer.append(mover, tag);
    // Pointing at a wire enlarges its tag.
    hit.addEventListener("mouseenter", () => tag.classList.add("hot"));
    hit.addEventListener("mouseleave", () => tag.classList.remove("hot"));
    return { set, casing, strands: [], arrow, hit, mover, tag };
  }

  /** Remakes a wire's strands when its materials change: power dashes, fluids run in pipes. */
  private makeStrands(view: LineView, materials: string[], layer: LineLayer): void {
    for (const strand of view.strands) for (const path of strand.paths) path.remove();
    view.strands = materials.map((id) => {
      const kind = layer === "power" ? "power" : layer === "fluid" ? "pipe" : "solid";
      const paths = [document.createElementNS(SVG, "path")];
      if (kind === "pipe") paths.push(document.createElementNS(SVG, "path"));
      paths[0].setAttribute("class", `strand ${kind}`);
      paths[0].style.stroke = itemColor(id);
      paths[1]?.setAttribute("class", "strand pipe-core");
      view.arrow.before(...paths);
      return { paths };
    });
    view.arrow.style.fill = itemColor(materials[0]);
  }

  /**
   * Spreads the wires on each side of a box along that side, ordered by where their other
   * ends lie, so they no longer meet at one point. A wire keeps the same rank at both ends,
   * so two wires running between the same boxes stay side by side instead of crossing.
   */
  private spreadEnds(plans: WirePlan[]): void {
    const sides = new Map<string, { plan: WirePlan; end: "p0" | "p3"; along: number }[]>();
    for (const plan of plans) {
      for (const [box, side, other, end] of [
        [plan.fromKey, plan.at.out, plan.toBox, "p0"],
        [plan.toKey, plan.at.into, plan.fromBox, "p3"],
      ] as const) {
        const key = `${box}${side}`;
        const across = side === "L" || side === "R" ? 1 : 0;
        sides.set(key, [...(sides.get(key) ?? []), { plan, end, along: centreOf(other)[across] }]);
      }
    }
    for (const [key, list] of sides) {
      const upright = key.endsWith("L") || key.endsWith("R");
      const room = upright ? NODE_H : NODE_W;
      list.sort((p, q) => p.along - q.along || p.plan.rank - q.plan.rank);
      const gap = list.length > 1 ? Math.min(SLOT_GAP, (room - 20) / (list.length - 1)) : 0;
      list.forEach(({ plan, end }, i) => {
        const shift = (i - (list.length - 1) / 2) * gap;
        const base = end === "p0" ? plan.at.start : plan.at.end;
        plan[end] = upright ? [base[0], base[1] + shift] : [base[0] + shift, base[1]];
      });
    }
  }

  /** Wires whose middle runs would lie on one track move apart onto lanes of their own. */
  private separateTracks(plans: WirePlan[]): void {
    const tracks = new Map<string, WirePlan[]>();
    for (const plan of plans) {
      if (plan.wire.length !== 6) continue;
      const key = `${plan.at.flat ? "x" : "y"}${Math.round(plan.wire[2][plan.at.flat ? 0 : 1] / 6)}`;
      tracks.set(key, [...(tracks.get(key) ?? []), plan]);
    }
    for (const group of tracks.values()) {
      if (group.length < 2) continue;
      const across = group[0].at.flat ? 1 : 0;
      group.sort((p, q) => p.p0[across] - q.p0[across] || p.rank - q.rank);
      group.forEach((plan, i) => {
        plan.wire = route(plan.p0, plan.p3, plan.at.flat, (i - (group.length - 1) / 2) * TRACK_GAP);
      });
    }
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
        this.roster.append(b);
      }
      const label = `${machineName(type)} ${group.length}`;
      if (b.textContent !== label) b.textContent = label;
      b.dataset.status = STATUS_ORDER.find((state) => group.some((n) => status(n) === state)) ?? "idle";
      b.classList.toggle("open", this.expanded === type);
    }
    this.drawList(s, this.expanded ? counts.get(this.expanded) ?? [] : []);
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
      const label = isPassive(node.type) ? nodeLabel(s, node)
        : node.type === MOTOR ? `${nodeLabel(s, node)} · ${tr("힘")} ${Math.floor(node.energy)}`
        : `${nodeLabel(s, node)} · ${STATUS_LABEL[state]}`;
      if (b.textContent !== label) b.textContent = label;
      b.dataset.status = state;
    }
  }

  draw(): void {
    const s = this.game();
    this.drawRoster(s);
    // The build list only makes machines. What is already made shows as items in the bag and warehouses.
    for (const [type, b] of this.paletteItems) {
      const label = machineName(type);
      if (b.textContent !== label) b.textContent = label;
    }
    for (const [layer, b] of this.layerButtons) {
      b.classList.toggle("selected", layer === this.layer);
      b.setAttribute("aria-pressed", String(layer === this.layer));
    }
    this.copyButton.disabled = !this.selected.size;
    const canGroup = [...this.selected].filter((id) => nodeById(s, id)).length >= 2;
    if (!canGroup) this.pickingPort = false;
    this.groupButton.disabled = !canGroup;
    this.groupButton.classList.toggle("selected", this.pickingPort);
    const groupLabel = this.pickingPort ? tr("외부 연결 노드를 클릭") : tr("묶기");
    if (this.groupButton.textContent !== groupLabel) this.groupButton.textContent = groupLabel;
    this.board.classList.toggle("picking", this.pickingPort);
    this.pasteButton.disabled = !this.clip.length;
    this.buildAll.hidden = !s.ghosts.length;
    const allLabel = `${tr("청사진 설치")} ${s.ghosts.filter((g) => countOf(s, g.type) > 0).length}/${s.ghosts.length}`;
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
      view.root.hidden = !!this.cardOf(s, node.id);
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
    for (const group of s.groups) {
      width = Math.max(width, group.x + NODE_W + 60);
      height = Math.max(height, group.y + NODE_H + 60);
    }
    this.drawGhosts(s);
    this.drawGroups(s, query);
    // Zoomed out, the board still has to fill the view so the ground stays draggable.
    this.board.style.width = `${Math.max(width, this.view.clientWidth / this.zoom)}px`;
    this.board.style.height = `${Math.max(height, this.view.clientHeight / this.zoom)}px`;

    // Only the layer on screen is drawn. Its materials between the same two nodes share one line.
    const routes = new Map<string, Line[]>();
    for (const line of s.lines) {
      if (lineLayer(s, line.from, line.material) !== this.layer) continue;
      const key = `${this.layer}:${line.from}>${line.to}`;
      routes.set(key, [...(routes.get(key) ?? []), line]);
    }
    for (const [key, view] of this.lines) {
      if (!routes.has(key)) {
        view.set.remove();
        view.hit.remove();
        view.mover.remove();
        view.tag.remove();
        this.lines.delete(key);
      }
    }
    const plans: WirePlan[] = [];
    for (const [key, group] of routes) {
      let view = this.lines.get(key);
      if (!view) {
        view = this.makeLine(group[0].from, group[0].to);
        this.lines.set(key, view);
      }
      // A folded group's lines run to its card, and lines inside it disappear.
      const fromCard = this.cardOf(s, group[0].from);
      const toCard = this.cardOf(s, group[0].to);
      const inside = !!fromCard && fromCard === toCard;
      for (const mark of [view.set, view.hit, view.tag]) mark.style.display = inside ? "none" : "";
      if (inside) {
        view.mover.style.display = "none";
        continue;
      }
      const fromBox = fromCard ?? nodeById(s, group[0].from)!;
      const toBox = toCard ?? nodeById(s, group[0].to)!;
      const at = attach(fromBox, toBox);
      plans.push({
        group, view, at, fromBox, toBox,
        fromKey: fromCard ? `g${fromCard.id}` : `n${group[0].from}`,
        toKey: toCard ? `g${toCard.id}` : `n${group[0].to}`,
        p0: at.start, p3: at.end, wire: [],
        rank: group[0].from * 1e6 + group[0].to,
      });
    }
    this.spreadEnds(plans);
    for (const plan of plans) plan.wire = route(plan.p0, plan.p3, plan.at.flat);
    this.separateTracks(plans);

    const traced = this.tracing !== undefined && !!nodeById(s, this.tracing) ? this.tracing : undefined;
    const near = new Set<number>(traced === undefined ? [] : [traced]);
    // Tags already placed this frame, so the next one can slide clear of them.
    const placed: { x: number; y: number; w: number }[] = [];
    for (const { group, view, wire } of plans) {
      const shape = wirePath(wire);
      view.hit.setAttribute("d", shape);
      const materials = group.map((l) => l.material);
      const codes = materials.join();
      if (view.set.dataset.codes !== codes) {
        view.set.dataset.codes = codes;
        this.makeStrands(view, materials, this.layer);
      }
      // A bundle lays its materials side by side, so none of them loses its colour.
      const widest = this.layer === "fluid" ? PIPE_W : STRAND_W;
      const gap = widest + 1.5;
      const span = (materials.length - 1) * gap;
      view.casing.setAttribute("d", shape);
      view.casing.style.strokeWidth = String(widest + span + 5);
      view.strands.forEach((strand, i) => {
        const d = wirePath(offsetWire(wire, i * gap - span / 2));
        for (const path of strand.paths) path.setAttribute("d", d);
      });
      view.arrow.setAttribute("points", arrowPoints(wire));

      const linked = traced === undefined || group[0].from === traced || group[0].to === traced;
      if (traced !== undefined && linked) for (const id of [group[0].from, group[0].to]) near.add(id);
      for (const mark of [view.set, view.tag, view.mover]) mark.classList.toggle("faded", !linked);
      const names = group.map((l) => itemName(l.material)).join(", ");
      view.hit.dataset.tip = names;
      view.tag.dataset.tip = names;
      if (view.tag.dataset.codes !== codes) {
        view.tag.dataset.codes = codes;
        view.tag.replaceChildren(...group.map((l, i) => {
          const span = document.createElementNS(SVG, "tspan");
          span.style.fill = itemColor(l.material);
          span.textContent = (i ? " " : "") + itemCode(l.material);
          return span;
        }));
      }
      const tagW = group.map((l) => itemCode(l.material)).join(" ").length * TAG_CHAR + TAG_PAD;
      let [cx, cy] = alongWire(wire, 0.5);
      for (const share of TAG_SPOTS) {
        const [x, y] = alongWire(wire, share);
        if (!placed.some((p) => Math.abs(p.x - x) < (p.w + tagW) / 2 && Math.abs(p.y - y) < TAG_H)) {
          [cx, cy] = [x, y];
          break;
        }
      }
      placed.push({ x: cx, y: cy, w: tagW });
      view.tag.setAttribute("x", cx.toFixed(1));
      view.tag.setAttribute("y", (cy + 4).toFixed(1));
      const moving = group.find((l) => l.active);
      view.mover.style.display = moving ? "" : "none";
      if (moving) {
        const [mx, my] = alongWire(wire, moving.timer / LINE_MS);
        view.mover.style.fill = itemColor(moving.material);
        if (view.mover.textContent !== itemCode(moving.material)) view.mover.textContent = itemCode(moving.material);
        view.mover.setAttribute("x", String(mx));
        view.mover.setAttribute("y", String(my + 4));
      }
    }
    // Pointing at a node leaves only it, its wires and the nodes at their other ends.
    for (const [id, view] of this.nodes) view.root.classList.toggle("faded", traced !== undefined && !near.has(id));
  }
}
