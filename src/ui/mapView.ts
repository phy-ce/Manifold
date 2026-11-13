// World map, shown whenever the player isn't working at the base, with its column: the fight view, the
// gathering panel (gatherPanel.ts) and the finder (finder.ts).
// The map is one canvas: 1,200 DOM cells were slow to update while walking.
import { tr } from "../i18n";
import { BIOMES, CAVE, CAVES, GATHER, WATER, itemColor, itemName } from "../content";
import { GameState, creaturesInSight, weaponOf, actionKey, eatProgress, digProgress, startDig, cantCarry, VeinSpot, attack, canStrike, creatureInfo, clearLine, mobVisible, stairHere, caveDoorHere, underSeenAt, nearestStair, enterCave, leaveCave, onThisMap, setSafeWalk, canHarvest, harvestTarget, isRevealed, isVisible, nextVeinCell, standBeside, startProbe, veinCellAt, walkTo } from "../engine/game";
import { BASE, CELL_ASPECT, Point, ROCK, Site, rockGrade, biomeAt, underCell, cellsOf, groundColor, groundGather, layerOf, terrain, waterKind } from "../engine/world";
import { keyHintHtml } from "./keyHint";
import { SOUND } from "./sound";
import { FightPanel } from "./fightPanel";
import { GatherPanel } from "./gatherPanel";
import { Finder } from "./finder";
import { COLOR, siteName } from "./mapLook";

/**
 * The window onto the endless map stays centred on the player and fills the middle of the screen, up to this
 * many cells (1080×900px at 1920×1080). A smaller screen shows fewer cells at the same size.
 */
const MAX_VIEW_W = 120;
const MAX_VIEW_H = 50;
const CELL_W = 9;
const CELL_H = 18;
/** How many steps the dig bar under the player fills in. */
const DIG_BAR = 12;
/**
 * The map's zoom steps. At 1 and 2 the pixel font is drawn at 12px and 24px, the sizes it is crisp at; at 0.5 a
 * glyph would be 6px and unreadable, so cells are drawn as small blocks of the glyph's colour, like a minimap.
 */
const ZOOMS = [0.5, 1, 2];
const ZOOM_KEY = "manifold-map-zoom";
const savedZoom = (): number => {
  try {
    const kept = Number(localStorage.getItem(ZOOM_KEY));
    return ZOOMS.includes(kept) ? kept : 1;
  } catch {
    return 1;
  }
};
/**
 * How strongly the map points a cell out, by level. `ms` is how long it lasts; a blink flashes amber on and off,
 * otherwise the amber fades out; `fill` is how solid the amber is; `outline` draws a box round the cell.
 * Tune a level here and every use of it follows.
 */
const EMPHASIS = {
  /** A dig, pick or fill landing. */
  soft: { ms: 400, blink: false, fill: 0.55, outline: true },
  /** Vein cells prospecting has just found. */
  medium: { ms: 900, blink: true, fill: 1, outline: false },
  /** Where to go next: the nearest cell still holding ore when the one underfoot is empty. */
  strong: { ms: 1500, blink: true, fill: 1, outline: true },
} as const;
type Emphasis = keyof typeof EMPHASIS;
/** Half a blink, in ms. */
const BLINK_MS = 150;

/**
 * A surface cell's back: the dark map back tinted by the biome's ground (BACK_TINT), lighter the higher a hill
 * stands (HILL_LIFT a level), bluer on water. Remembered cells take half the tint and sit darker, as before. Kept
 * dark so the glyph on it always reads. Worked out once per kind of cell, not per cell.
 */
const BACK_TINT = 0.22;
const HILL_LIFT = 0.07;
const backs = new Map<string, string>();
function groundBack(s: GameState, x: number, y: number, seen: boolean): string {
  const [, cls, height] = terrain(x, y, s.seed);
  const biome = biomeAt(x, y, s.seed);
  const key = `${biome}|${cls}|${height}|${seen}`;
  let back = backs.get(key);
  if (!back) {
    const base = hexRgb(seen ? COLOR.seenBg : COLOR.memoryBg);
    const tint = hexRgb(cls === "t-water" ? COLOR["t-water"] : cls === "t-ice" ? COLOR["t-ice"] : BIOMES[biome].ground);
    const amount = (seen ? BACK_TINT : BACK_TINT / 2) * (cls === "t-water" || cls === "t-ice" ? 1.3 : 1);
    const lift = cls === "t-hill" ? height * HILL_LIFT * (seen ? 1 : 0.5) : 0;
    const mix = base.map((b, i) => Math.round(b + (tint[i] - b) * amount + (255 - b) * lift));
    back = `rgb(${mix.join(",")})`;
    backs.set(key, back);
  }
  return back;
}
const hexRgb = (hex: string): number[] => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

/** Where ore has been dug out: bare stone ground on the surface, stone floor in a cave. */
const STONE = "_";

/**
 * The ASCII stroke for a direction: - | / \. Along the direction for a spine in flight,
 * or across it for the rim of a ring, so a ring of them reads as a circle.
 */
function strokeGlyph(dx: number, dy: number, across: boolean): string {
  const [x, y] = across ? [-dy, dx] : [dx, dy];
  const angle = Math.abs(Math.atan2(y, x) * (180 / Math.PI));
  if (angle < 22.5 || angle > 157.5) return "-";
  if (angle > 67.5 && angle < 112.5) return "|";
  // Screen y runs down, so down-right is a backslash.
  return (x > 0) === (y > 0) ? "\\" : "/";
}

/** Open water on the map, by the kind of water it is. */
const WATER_CELL = { river: tr("강"), pond: tr("저수지"), oasis: tr("오아시스"), ice: tr("얼음") };

/** A vein cell's glyph by its vein's grade. */
/** Every vein cell looks alike on the map: how rich a vein is, the player finds out by digging. */
const ORE_GLYPH = "*";

/** The known vein cells on the layer the player is on, by "x,y". Underground, only found cells; buried ones never. */
function knownCells(s: GameState): Map<string, VeinSpot> {
  const spots = new Map<string, VeinSpot>();
  for (const site of s.sites) {
    if (site.ore === CAVE) continue;
    for (const cell of cellsOf(site)) {
      if (layerOf(cell) !== s.z || (s.z < 0 && (!cell.found || cell.buried))) continue;
      spots.set(`${cell.x},${cell.y}`, { site, cell });
    }
  }
  return spots;
}

/** Noted sites by the "x,y" of their own spot: a note is the player's own, so it shows on either layer. */
const notedSpots = (s: GameState): Map<string, Site> =>
  new Map(s.sites.filter((site) => site.note).map((site) => [`${site.x},${site.y}`, site]));

export class MapView {
  /** The map itself, in the middle of the screen. */
  readonly root = document.createElement("section");
  /** Everything about the map, in the left column: where, keys, the view ahead, the place underfoot, search. */
  readonly side = document.createElement("div");
  private viewW = 60;
  private viewH = 20;
  private zoom = savedZoom();
  private readonly canvas = document.createElement("canvas");
  /** The paused mark over the map. */
  private readonly paused = document.createElement("div");
  /** Over the map while a creature in sight is within a blow: F strikes. */
  private readonly fightAlert = document.createElement("div");
  /** Over the map while something is being gathered or eaten. */
  private readonly workAlert = document.createElement("div");
  private readonly ctx = this.canvas.getContext("2d")!;
  private readonly fight: FightPanel;
  private readonly gather: GatherPanel;
  private readonly finder: Finder;
  /** A cave entrance or a stair double-clicked: the layer changes once the player gets there. */
  private layerAt: { x: number; y: number; z: number } | null = null;
  /** How far and which way home lies, for the top bar beside the button that goes there: "H 15칸 서". */
  where = "";
  /** Going in and out of a cave, and prospecting inside one. */
  private readonly caveBar = document.createElement("div");
  private readonly enter = document.createElement("button");
  private readonly leave = document.createElement("button");
  private readonly probe = document.createElement("button");
  /** Cells blinking until `until`: vein cells prospecting just found, or the next cell of a vein to go to; and the cells already known. */
  /** Cells pointed out on the map right now, each with how strongly and since when. */
  private marks: { cells: Set<string>; at: number; level: Emphasis }[] = [];
  private known = { z: 0, cells: new Set<string>() };
  /** The emptied cell the next cell was last pointed out from, so it blinks once on arrival, not all the time. */
  private pointedFrom = "";
  private readonly safe = document.createElement("button");
  /** What safe mode stopped for, shown for a moment at the top of the screen. */
  private readonly haltFlash = document.createElement("div");
  /** When the last drop shown happened; null until the first draw, so a loaded game shows no old one. */
  private dropShown: number | null = null;
  private spentShown: number | null = null;
  /** When the last dig shown came up; null until the first draw. */
  private dugShown: number | null = null;
  /** When the last broken tool shown broke; null until the first draw. */
  private brokeShown: number | null = null;
  private blockedShown: string | null = null;
  /** The too-steep cell last noted, so the note shows once per stop. */
  private steepShown = "";
  private haltShown = "";
  private drawnMap = "";
  private originX = 0;
  private originY = 0;

  constructor(private readonly game: () => GameState, private readonly changed: () => void) {
    this.root.className = "box map-box map-view";
    // While time is stopped, a mark over the top of the map says so; it never takes a click.
    this.paused.className = "paused-mark";
    this.paused.textContent = `|| ${tr("일시정지")}`;
    this.paused.hidden = true;
    this.paused.setAttribute("aria-hidden", "true");
    this.side.className = "map-side";
    this.fight = new FightPanel(game, changed);
    this.canvas.className = "map";
    this.canvas.setAttribute("aria-label", tr("지도, 칸을 클릭해 이동"));
    this.setView(this.viewW, this.viewH);
    // The map takes as many whole cells as fit in the middle of the screen.
    new ResizeObserver(() => this.fit()).observe(this.root);
    // The wheel zooms the map in and out, a step at a time (ZOOMS), and the choice is kept.
    this.canvas.addEventListener("wheel", (e) => {
      e.preventDefault();
      const at = ZOOMS.indexOf(this.zoom);
      const next = ZOOMS[Math.min(ZOOMS.length - 1, Math.max(0, at + (e.deltaY < 0 ? 1 : -1)))];
      if (next === this.zoom) return;
      this.zoom = next;
      try {
        localStorage.setItem(ZOOM_KEY, String(next));
      } catch {
        // Only a convenience.
      }
      this.fit(true);
    }, { passive: false });
    this.canvas.addEventListener("click", (e) => {
      const [x, y] = this.cellAt(e);
      const s = this.game();
      // A creature in reach is struck; anywhere else, or one out of reach, is walked to.
      const mob = s.mobs.find((m) => m.x === x && m.y === y && mobVisible(s, m));
      // Ore in an underground wall is worked from the floor beside it.
      const spot = s.z < 0 ? knownCells(s).get(`${x},${y}`) : undefined;
      const wall = spot?.cell.wall && spot.cell.left > 0 ? standBeside(s, x, y) : undefined;
      if (mob && attack(s, mob.id)) SOUND.good();
      else if (wall) walkTo(s, wall);
      else if (!mob || canStrike(s)) walkTo(s, { x, y });
      this.changed();
    });
    // Double-clicking a cave entrance goes down into it, and double-clicking a stair goes back up: walk there,
    // then change layer on arrival.
    this.canvas.addEventListener("dblclick", (e) => {
      const [x, y] = this.cellAt(e);
      const s = this.game();
      const seen = s.z < 0 ? underSeenAt(s, x, y) : isRevealed(s, x, y);
      if (!seen || !s.sites.some((v) => v.ore === CAVE && v.x === x && v.y === y)) return;
      this.layerAt = { x, y, z: s.z };
      walkTo(s, { x, y });
      this.changeLayer();
      this.changed();
    });
    this.canvas.addEventListener("pointermove", (e) => {
      const [x, y] = this.cellAt(e);
      this.canvas.dataset.tip = this.describe(x, y);
    });

    this.gather = new GatherPanel(game, changed, () => this.work(), (again) => this.pointNext(again), () => this.finder.stale());

    // Every line in the column keeps to one line: long text is cut short rather than wrapped, so nothing moves.
    const walkMode = document.createElement("div");
    walkMode.className = "box map-tools";
    // One switch: safe mode stops a walk short of a known hazard and says what it is.
    this.safe.type = "button";
    this.safe.className = "key-button";
    this.safe.dataset.tip = tr("켜면 위험 지역에 들어가기 전에 멈추고 알려 줍니다 (T)");
    this.safe.addEventListener("click", () => {
      const s = this.game();
      setSafeWalk(s, !s.safeWalk);
      this.changed();
    });
    walkMode.append(this.safe);
    this.haltFlash.className = "hurt halt-flash";
    this.haltFlash.setAttribute("aria-hidden", "true");
    document.body.append(this.haltFlash);
    // The cave's buttons share the safe-mode row, so the bar above the map is one row wherever the player is.
    this.caveBar.className = "map-actions";
    const action = (b: HTMLButtonElement, label: string, act: (s: GameState) => boolean, tip?: string) => {
      b.type = "button";
      b.className = "tech";
      b.textContent = label;
      if (tip) b.dataset.tip = tip;
      b.addEventListener("click", () => {
        act(this.game());
        this.changed();
      });
      this.caveBar.append(b);
    };
    action(this.enter, tr("동굴로 들어가기"), enterCave);
    action(this.leave, tr("나가기"), leaveCave);
    action(this.probe, "", startProbe, tr("멈춰서 주변 바위를 두드려 광맥을 찾습니다 (Q)"));
    this.probe.className = "key-button";
    walkMode.append(this.caveBar);
    this.fightAlert.className = "fight-alert";
    this.fightAlert.hidden = true;
    this.workAlert.className = "fight-alert work-alert";
    this.workAlert.hidden = true;
    this.root.append(this.canvas, this.paused, this.fightAlert, this.workAlert);

    this.finder = new Finder(game, changed);

    this.side.append(walkMode, this.fight.root, this.gather.root, this.finder.root);
  }

  /** As many whole cells at the current zoom as fit in the box; redraws if that changed or `force`. */
  private fit(force = false): void {
    const box = this.root.getBoundingClientRect();
    if (!box.width) return; // hidden while the base shows
    const pad = parseFloat(getComputedStyle(this.root).paddingLeft) * 2 + 2;
    const w = Math.min(Math.round(MAX_VIEW_W / this.zoom), Math.max(10, Math.floor((box.width - pad) / (CELL_W * this.zoom))));
    const h = Math.min(Math.round(MAX_VIEW_H / this.zoom), Math.max(5, Math.floor((box.height - pad) / (CELL_H * this.zoom))));
    if (!force && w === this.viewW && h === this.viewH) return;
    this.setView(w, h);
    this.drawnMap = "";
    this.draw();
  }

  /**
   * Sizes the map canvas to so many cells, sharp on high-density screens. Drawing is always in cells of
   * CELL_W×CELL_H; the zoom only scales the canvas, so the pixel font lands on 12px or 24px and stays crisp.
   */
  private setView(w: number, h: number): void {
    const scale = (window.devicePixelRatio || 1) * this.zoom;
    this.viewW = w;
    this.viewH = h;
    this.canvas.width = Math.round(w * CELL_W * scale);
    this.canvas.height = Math.round(h * CELL_H * scale);
    this.canvas.style.width = `${w * CELL_W * this.zoom}px`;
    this.canvas.style.height = `${h * CELL_H * this.zoom}px`;
    this.ctx.setTransform(scale, 0, 0, scale, 0, 0);
    this.ctx.textBaseline = "middle";
    this.ctx.textAlign = "center";
  }

  /**
   * Draws one cell's glyph in the current fill colour: as text, or zoomed out as a block of that colour, a dot for
   * ground marks (`.,'`) so open land stays quiet next to what matters.
   */
  private glyph(ch: string, vx: number, vy: number): void {
    const g = this.ctx;
    if (this.zoom >= 1) {
      g.fillText(ch, vx * CELL_W + CELL_W / 2, vy * CELL_H + CELL_H / 2);
      return;
    }
    const small = ".,'`:\"_-".includes(ch);
    const [w, h] = small ? [CELL_W / 3, CELL_H / 6] : [CELL_W - 2, CELL_H - 4];
    g.fillRect(vx * CELL_W + (CELL_W - w) / 2, vy * CELL_H + (CELL_H - h) / 2, w, h);
  }

  /** Shows or hides the paused mark over the map. */
  setPaused(paused: boolean): void {
    this.paused.hidden = !paused;
  }

  /** C: walks up to the nearest creature in sight. */
  approach(): void {
    this.fight.approachNearest();
  }

  private cellAt(e: MouseEvent): [number, number] {
    const box = this.canvas.getBoundingClientRect();
    return [
      this.originX + Math.floor((e.clientX - box.left) / (CELL_W * this.zoom)),
      this.originY + Math.floor((e.clientY - box.top) / (CELL_H * this.zoom)),
    ];
  }

  private describe(x: number, y: number): string {
    const s = this.game();
    if (s.z < 0) {
      // The player's own note shows wherever its mark is, seen or not.
      const noted = notedSpots(s).get(`${x},${y}`);
      if (!underSeenAt(s, x, y)) return noted?.note ?? "";
      const mob = s.mobs.find((m) => m.x === x && m.y === y && mobVisible(s, m) && isVisible(s, m.x, m.y));
      if (mob) return `${tr(creatureInfo(mob.kind).name)} ${mob.hp}/${creatureInfo(mob.kind).hp}`;
      if (s.sites.some((v) => v.ore === CAVE && v.x === x && v.y === y)) return tr("출구");
      // A wall cell dug out is plain rock again.
      const spot = knownCells(s).get(`${x},${y}`);
      const vein = spot && (spot.cell.left > 0 || !spot.cell.wall) ? spot.site : undefined;
      if (vein) return vein.note ? `${siteName(s, vein)} · ${vein.note}` : siteName(s, vein);
      if (noted) return noted.note!;
      return underCell(x, y, s.seed) === ROCK ? `${tr("암반")} ${rockGrade(x, y, s.seed)}` : "";
    }
    if (x === BASE.x && y === BASE.y) return tr("기지");
    // A creature in sight is named.
    const beast = s.mobs.find((m) => m.x === x && m.y === y && mobVisible(s, m));
    if (beast) return tr(creatureInfo(beast.kind).name);
    const noted = notedSpots(s).get(`${x},${y}`);
    if (!isRevealed(s, x, y)) return noted?.note ?? "";
    // The ground first, its biome and height, then what lies on it: a vein, a tree, a cave mouth, a note.
    const site = knownCells(s).get(`${x},${y}`)?.site ?? s.sites.find((v) => v.ore === CAVE && v.x === x && v.y === y && onThisMap(s, v));
    const [, cls, height] = terrain(x, y, s.seed);
    const biome = BIOMES[biomeAt(x, y, s.seed)].name;
    const ground = cls === "t-hill" ? `${tr("산 고도")} ${height}` : cls === "t-water" ? WATER_CELL[waterKind(x, y, s.seed)] : cls === "t-ice" ? tr("얼음") : "";
    const on = site ? siteName(s, site) : "";
    const note = site?.note ?? noted?.note ?? "";
    return [biome, ground, on, note].filter(Boolean).join(" · ");
  }

  /** Goes down or up once the player stands on the entrance or stair they double-clicked; gives up if they walk elsewhere. */
  private changeLayer(): void {
    const s = this.game();
    const goal = this.layerAt;
    if (!goal) return;
    if (s.z !== goal.z || (!s.path.length && (s.player.x !== goal.x || s.player.y !== goal.y))) {
      this.layerAt = null;
      return;
    }
    if (s.path.length) return;
    this.layerAt = null;
    if (s.z === 0 ? enterCave(s) : leaveCave(s)) this.changed();
  }

  /** F in a cave: strikes, or closes in on, the nearest creature in sight. */
  strikeNearest(): void {
    this.fight.strikeNearest();
  }

  /**
   * F, the one action key, as actionKey decides: with a creature in sight it only fights; otherwise it works the
   * place underfoot, digging a vein, picking food or filling a drum, the same as pressing the picture. Held, only
   * a fight repeats.
   */
  useKey(repeat: boolean): void {
    const s = this.game();
    const use = actionKey(s);
    if (use === "fight") {
      if (!repeat || canStrike(s)) this.fight.strikeNearest();
    } else if (use === "work") {
      // Held, F starts the next dig as soon as one ends; a dig under way just goes on.
      if (!repeat) this.work();
      else if (!s.dig) startDig(s);
    }
  }

  /** Starts working the vein; with nothing left to dig here, shows again where the vein goes on. */
  private work(): void {
    const s = this.game();
    if (s.dig) return;
    if (startDig(s)) {
      // Nothing to show yet: the bar under the player fills, and the cell flashes when the dig comes up.
    } else if (!cantCarry(s)) this.pointNext(true);
    // Otherwise carrying is what's in the way, and s.blocked has the screen say so (see the flashes in draw).
    this.changed();
  }

  /** Points cells out on the map, as strongly as the level says (see EMPHASIS). The one way the map draws attention. */
  private emphasize(cells: Iterable<Point | string>, level: Emphasis): void {
    const keys = new Set([...cells].map((c) => (typeof c === "string" ? c : `${c.x},${c.y}`)));
    if (keys.size) this.marks.push({ cells: keys, at: performance.now(), level });
  }

  /** Whether anything is still being pointed out, so the map keeps redrawing until it is done. */
  private marking(): boolean {
    const now = performance.now();
    this.marks = this.marks.filter((m) => now - m.at < EMPHASIS[m.level].ms);
    return this.marks.length > 0;
  }

  /**
   * Draws the marks on one cell under its glyph. True when a blink is in its lit half, so the glyph goes dark over it.
   */
  private markCell(vx: number, vy: number, key: string): boolean {
    const now = performance.now();
    const g = this.ctx;
    let lit = false;
    for (const mark of this.marks) {
      if (!mark.cells.has(key)) continue;
      const look = EMPHASIS[mark.level];
      const t = (now - mark.at) / look.ms;
      if (t >= 1) continue;
      if (look.blink) {
        const on = Math.floor((now - mark.at) / BLINK_MS) % 2 === 0;
        g.globalAlpha = look.fill;
        g.fillStyle = on ? COLOR.probe : COLOR.seenBg;
        g.fillRect(vx * CELL_W, vy * CELL_H, CELL_W, CELL_H);
        lit ||= on;
      } else {
        g.globalAlpha = look.fill * (1 - t);
        g.fillStyle = COLOR.probe;
        g.fillRect(vx * CELL_W, vy * CELL_H, CELL_W, CELL_H);
      }
      g.globalAlpha = 1;
      if (look.outline) {
        g.strokeStyle = COLOR.probe;
        g.lineWidth = 1;
        g.strokeRect(vx * CELL_W + 0.5, vy * CELL_H + 0.5, CELL_W - 1, CELL_H - 1);
      }
    }
    return lit;
  }

  /** When the cell underfoot is dug out but its vein isn't, blinks the nearest cell that still holds some. */
  private pointNext(again: boolean): void {
    const s = this.game();
    const here = veinCellAt(s, s.player.x, s.player.y);
    const from = here && here.cell.left <= 0 && !harvestTarget(s) ? `${here.site.id},${s.player.x},${s.player.y}` : "";
    if (from && (again || from !== this.pointedFrom)) {
      const next = nextVeinCell(s, here!.site);
      if (next) this.emphasize([next], "strong");
    }
    this.pointedFrom = from;
  }

  /** Points the tutorial at the search box, or stops. */
  pointSearch(on: boolean): void {
    this.finder.pointSearch(on);
  }

  draw(): void {
    const s = this.game();
    this.changeLayer();
    // The safe switch and prospecting read as key hints: lit while on.
    const safeLabel = keyHintHtml("T", tr("안전 모드"), s.safeWalk ? "on" : "off");
    if (this.safe.dataset.shown !== safeLabel) this.safe.innerHTML = this.safe.dataset.shown = safeLabel;
    this.safe.setAttribute("aria-pressed", String(s.safeWalk));
    // A creature in sight and within a blow: the map says F strikes, lit when the weapon is ready.
    const reach = weaponOf(s).range;
    const inReach = creaturesInSight(s).some((m) => Math.max(Math.abs(m.x - s.player.x), Math.abs(m.y - s.player.y)) <= reach);
    this.fightAlert.hidden = !inReach;
    const alert = inReach ? keyHintHtml("F", tr("공격"), canStrike(s) ? "on" : "off") : "";
    if (this.fightAlert.dataset.shown !== alert) this.fightAlert.innerHTML = this.fightAlert.dataset.shown = alert;
    // A dig, a cut or a meal under way says so in the same place: "채집 중", "먹는 중 · 날고기".
    const busy = s.eating ? `${tr("먹는 중")} · ${itemName(s.eating.id)}` : s.dig ? tr("채집 중") : "";
    this.workAlert.hidden = !busy || inReach;
    if (this.workAlert.textContent !== busy) this.workAlert.textContent = busy;
    // Where safe mode stopped the walk: the cell blinks, then stays boxed in red until the walk goes on, and the
    // middle of the map says what it saw and what it would cost, with safe mode named small beneath.
    const halt = s.halt;
    const haltKey = halt ? `${halt.x},${halt.y},${halt.target.x},${halt.target.y}` : "";
    if (haltKey !== this.haltShown) {
      this.haltShown = haltKey;
      if (halt) {
        this.emphasize([halt], "strong");
        this.haltFlash.innerHTML = `${halt.kind === "water" ? tr("물") : tr("고도 변화")} ${tr("감지")} (-${halt.damage} ${tr("데미지")})` +
          `<small class="flash-sub">${tr("안전 모드 켜짐")}</small>`;
        this.haltFlash.classList.remove("hit", "gain");
        void this.haltFlash.offsetWidth;
        this.haltFlash.classList.add("hit");
      }
    }
    // A step too steep to take stopped the walk: the same box and note, once per stop.
    const steep = s.steep ? `${s.steep.x},${s.steep.y}` : "";
    if (steep !== this.steepShown) {
      this.steepShown = steep;
      if (s.steep) {
        this.emphasize([s.steep], "strong");
        this.haltFlash.textContent = tr("너무 가파름");
        this.haltFlash.classList.remove("hit", "gain");
        void this.haltFlash.offsetWidth;
        this.haltFlash.classList.add("hit");
      }
    }
    // A tool worn out: "돌 곡괭이 부서짐", in the same place, amber.
    const broke = s.broke?.at ?? -1;
    if (broke !== this.brokeShown) {
      const first = this.brokeShown === null;
      this.brokeShown = broke;
      if (s.broke && !first) {
        this.haltFlash.textContent = `${itemName(s.broke.id)} ${tr("부서짐")}`;
        this.haltFlash.classList.remove("hit", "gain");
        void this.haltFlash.offsetWidth;
        this.haltFlash.classList.add("hit");
      }
    }
    // Carrying stopped a dig, pick or butchering: "가방이 가득 참" or "너무 무거움", in the same place, amber.
    const blocked = s.blocked ? `${s.blocked.why},${s.blocked.at}` : "";
    if (blocked !== this.blockedShown) {
      const first = this.blockedShown === null;
      this.blockedShown = blocked;
      if (s.blocked && !first) {
        this.haltFlash.textContent = s.blocked.why === "full" ? tr("가방이 가득 참") : tr("너무 무거움");
        this.haltFlash.classList.remove("hit", "gain");
        void this.haltFlash.offsetWidth;
        this.haltFlash.classList.add("hit");
        if (s.blocked.why === "heavy") window.dispatchEvent(new Event("manifold:too-heavy"));
      }
    }
    // A beast's carcass taken apart: what went into the bag, in the same place, in green: "날고기 +2 가죽 +1".
    // A vein dug to the end: "철광석 고갈됨!", in the same place, amber.
    const spent = s.depleted?.at ?? -1;
    if (spent !== this.spentShown) {
      const first = this.spentShown === null;
      this.spentShown = spent;
      if (s.depleted && !first) {
        this.haltFlash.textContent = `${itemName(s.depleted.ore)} ${s.depleted.what === "cell" ? tr("칸 고갈됨!") : tr("광맥 고갈됨!")}`;
        this.haltFlash.classList.remove("hit", "gain");
        void this.haltFlash.offsetWidth;
        this.haltFlash.classList.add("hit");
      }
    }
    const drop = s.drop?.at ?? -1;
    if (drop !== this.dropShown) {
      const first = this.dropShown === null;
      this.dropShown = drop;
      if (s.drop && !first) {
        this.haltFlash.textContent = Object.entries(s.drop.got).map(([id, n]) => `${itemName(id)} +${n}`).join(" ");
        this.haltFlash.classList.remove("hit");
        void this.haltFlash.offsetWidth;
        this.haltFlash.classList.add("hit", "gain");
      }
    }
    this.fight.draw();
    this.gather.draw(s);
    const cave = s.z < 0;
    const probing = s.probe === null ? -1 : Math.min(1, (s.time - s.probe) / CAVES.probeMs);
    this.enter.hidden = !caveDoorHere(s);
    this.leave.hidden = !stairHere(s);
    this.probe.hidden = !cave;
    const probeLabel = keyHintHtml("Q", probing >= 0 ? `${tr("탐사")} ${"▮".repeat(Math.round(probing * 4)).padEnd(4, "▯")}` : tr("탐사"), probing >= 0 ? "on" : "off");
    if (this.probe.dataset.shown !== probeLabel) this.probe.innerHTML = this.probe.dataset.shown = probeLabel;
    this.caveBar.hidden = this.enter.hidden && this.leave.hidden && this.probe.hidden;
    // Newly found vein cells blink for a moment.
    const found = cave ? new Set(knownCells(s).keys()) : new Set<string>();
    if (this.known.z === s.z) {
      const fresh = [...found].filter((key) => !this.known.cells.has(key));
      this.emphasize(fresh, "medium");
    }
    this.known = { z: s.z, cells: found };
    // A dig just came up: the vein picture flashes and the cell blinks, as a dig used to at once.
    const dug = s.dug?.at ?? -1;
    if (dug !== this.dugShown) {
      if (this.dugShown !== null && s.dug) {
        this.gather.hit = 4;
        this.emphasize([s.dug], "soft");
      }
      this.dugShown = dug;
    }
    // A dig, a cut or a meal under way: the same bar, under the cell worked or under the player eating.
    const digging = digProgress(s) ?? eatProgress(s);
    const barAt = s.dig ?? (s.eating ? s.player : null);
    // On the surface the map only changes when the player moves, a cell empties or something blinks; underground creatures move every step.
    const emptied = s.sites.reduce((n, site) => n + (site.left > 0 ? 0 : 1) + (site.found ? 1000 : 0) + (site.note ? 31 : 0) + 7 * (site.cells?.filter((c) => c.left <= 0).length ?? 0), 0);
    const live = cave || s.mobs.length || this.marking() ? `${s.time},${Math.floor(performance.now() / 150)}` : "";
    const key = `${s.z},${s.player.x},${s.player.y},${s.facing?.x},${s.facing?.y},${s.path.length},${s.sites.length},${emptied},${s.season},${s.halt?.x},${s.halt?.y},${s.steep?.x},${s.steep?.y},${digging === null ? "" : Math.round(digging * DIG_BAR)},${(s.corpses ?? []).reduce((n, c) => n + c.left + 100, 0)},${live}`;
    if (key === this.drawnMap) return;
    this.drawnMap = key;
    this.originX = s.player.x - Math.floor(this.viewW / 2);
    this.originY = s.player.y - Math.floor(this.viewH / 2);
    if (cave) this.paintUnder(s, probing);
    else this.paint(s);
    // A dig under way: a bar three cells wide under the cell being worked, filling as it goes.
    if (barAt && digging !== null) {
      const vx = barAt.x - this.originX;
      const vy = barAt.y - this.originY;
      const g = this.ctx;
      const left = (vx - 1) * CELL_W + 1;
      const top = (vy + 1) * CELL_H - 4;
      const width = CELL_W * 3 - 2;
      g.fillStyle = COLOR.seenBg;
      g.fillRect(left - 1, top - 1, width + 2, 5);
      g.fillStyle = COLOR.probe;
      g.fillRect(left, top, Math.round((width * Math.round(digging * DIG_BAR)) / DIG_BAR), 3);
    }
    // Where safe mode stopped: the hazard cell boxed in red, as long as the stop holds.
    for (const cell of [s.halt, s.steep]) {
      if (!cell) continue;
      const vx = cell.x - this.originX;
      const vy = cell.y - this.originY;
      this.ctx.strokeStyle = COLOR.wolf;
      this.ctx.lineWidth = 2;
      this.ctx.strokeRect(vx * CELL_W + 1, vy * CELL_H + 1, CELL_W - 2, CELL_H - 2);
    }
    // The way home may be off screen, so always say how far away it is: underground, the nearest stair seen.
    const home: Point | undefined = cave ? nearestStair(s) : BASE;
    const steps = home ? Math.max(Math.abs(s.player.x - home.x), Math.abs(s.player.y - home.y)) : 0;
    const mark = cave ? `${tr("지하")} ${CAVES.layer} · <` : "H";
    const where = home && steps ? `${mark} ${steps}${tr("칸")} ${this.direction(s, home)}` : mark;
    this.where = where;
    this.finder.drawResults();
  }

  private paint(s: GameState): void {
    const g = this.ctx;
    g.clearRect(0, 0, this.viewW * CELL_W, this.viewH * CELL_H);
    g.font = "12px GalmuriMono11, 'JetBrains Mono', Consolas, monospace";
    const doors = new Map(s.sites.filter((site) => site.ore === CAVE && onThisMap(s, site)).map((site) => [`${site.x},${site.y}`, site]));
    const veins = knownCells(s);
    const path = new Set(s.path.map((p) => `${p.x},${p.y}`));
    for (let vy = 0; vy < this.viewH; vy += 1) {
      for (let vx = 0; vx < this.viewW; vx += 1) {
        const x = this.originX + vx;
        const y = this.originY + vy;
        if (!isRevealed(s, x, y)) continue;
        const seen = isVisible(s, x, y);
        g.fillStyle = groundBack(s, x, y, seen);
        g.fillRect(vx * CELL_W, vy * CELL_H, CELL_W, CELL_H);
        const key = `${x},${y}`;
        const spot = veins.get(key);
        let glyph: string;
        let color: string;
        if (s.player.x === x && s.player.y === y) [glyph, color] = ["@", COLOR.player];
        else if (x === BASE.x && y === BASE.y) [glyph, color] = ["H", COLOR.base];
        else if (doors.has(key)) [glyph, color] = [">", COLOR.cave];
        else if (spot && spot.site.cells && spot.cell.left <= 0) [glyph, color] = [STONE, COLOR.stone];
        else if (spot && GATHER.includes(spot.site.ore)) {
          // A tree or outcrop keeps its own look: a felled tree is a stump, broken stone bare hill.
          const [ch, , height] = terrain(x, y, s.seed);
          const left = spot.site.left > 0;
          glyph = left || spot.site.ore !== "wood" ? ch : ",";
          color = left ? itemColor(spot.site.ore) : spot.site.ore === "wood" ? COLOR.stone : COLOR[`t-hill${height}`];
        } else if (spot) {
          const site = spot.site;
          glyph = site.ore === WATER ? "W" : site.left <= 0 ? "x" : !canHarvest(s, site) ? "'" : ORE_GLYPH;
          color = itemColor(site.ore);
        } else if (path.has(key)) [glyph, color] = ["-", COLOR.path];
        else {
          const [ch, cls, height] = terrain(x, y, s.seed);
          glyph = ch;
          color = cls === "t-hill" ? COLOR[`t-hill${height}`] : groundColor(cls) ?? COLOR[cls] ?? COLOR["t-plain"];
          // Big trees and stone outcrops stand out from the ground around them.
          if (ch === "T" || cls === "t-hill") {
            const gather = groundGather(x, y, s.seed);
            if (gather) color = itemColor(gather);
          }
        }
        if (this.markCell(vx, vy, key)) color = "#10151c";
        if (glyph === " ") continue;
        g.globalAlpha = seen ? 1 : 0.45;
        g.fillStyle = color;
        this.glyph(glyph, vx, vy);
        g.globalAlpha = 1;
      }
    }
    // Notes on veins that lie only underground still mark their spot up here.
    for (const site of s.sites) if (site.note && (site.z ?? 0) !== 0) this.noteMark(site.x, site.y, isRevealed(s, site.x, site.y));
    // Carcasses lie where they fell, seen or remembered; several on one cell draw as one.
    for (const corpse of s.corpses ?? []) {
      const vx = corpse.x - this.originX;
      const vy = corpse.y - this.originY;
      if (corpse.z !== s.z || !isRevealed(s, corpse.x, corpse.y) || vx < 0 || vy < 0 || vx >= this.viewW || vy >= this.viewH) continue;
      if (corpse.x === s.player.x && corpse.y === s.player.y) continue;
      g.fillStyle = COLOR.seenBg;
      g.fillRect(vx * CELL_W, vy * CELL_H, CELL_W, CELL_H);
      g.fillStyle = COLOR.corpse;
      this.glyph("%", vx, vy);
    }
    // Surface creatures (a yeti, deer) show only where the player can see, like everything else on the map.
    for (const mob of s.mobs) {
      const vx = mob.x - this.originX;
      const vy = mob.y - this.originY;
      if (!mobVisible(s, mob) || !isVisible(s, mob.x, mob.y) || vx < 0 || vy < 0 || vx >= this.viewW || vy >= this.viewH) continue;
      g.fillStyle = COLOR.seenBg;
      g.fillRect(vx * CELL_W, vy * CELL_H, CELL_W, CELL_H);
      g.fillStyle = mob.kind === "deer" ? COLOR.deer : COLOR.yeti;
      this.glyph(mob.kind === "deer" ? "d" : "Y", vx, vy);
    }
  }

  /**
   * The player's note mark, amber "!", at a spot. Over a drawn cell it sits small in the corner so the cell still
   * shows; over dark ground it stands in the cell. It shows whether or not the spot has been seen: it is their own.
   */
  private noteMark(x: number, y: number, small: boolean): void {
    const vx = x - this.originX;
    const vy = y - this.originY;
    if (vx < 0 || vy < 0 || vx >= this.viewW || vy >= this.viewH) return;
    const g = this.ctx;
    g.fillStyle = COLOR.probe;
    if (small) {
      g.font = "10px 'JetBrains Mono', Consolas, monospace";
      g.fillText("!", vx * CELL_W + CELL_W - 2, vy * CELL_H + 4);
      g.font = "12px GalmuriMono11, 'JetBrains Mono', Consolas, monospace";
      return;
    }
    this.glyph("!", vx, vy);
  }

  /**
   * The underground, in the same glyphs as the surface: rock is a solid block, a stair up is <, and veins show
   * only once prospecting has found them. Only remembered cells are drawn; the rest is dark.
   */
  private paintUnder(s: GameState, probing: number): void {
    const g = this.ctx;
    g.clearRect(0, 0, this.viewW * CELL_W, this.viewH * CELL_H);
    g.font = "12px GalmuriMono11, 'JetBrains Mono', Consolas, monospace";
    const veins = knownCells(s);
    const stairs = new Set(s.sites.filter((v) => v.ore === CAVE).map((v) => `${v.x},${v.y}`));
    const path = new Set(s.path.map((p) => `${p.x},${p.y}`));
    for (let vy = 0; vy < this.viewH; vy += 1) {
      for (let vx = 0; vx < this.viewW; vx += 1) {
        const x = this.originX + vx;
        const y = this.originY + vy;
        if (!underSeenAt(s, x, y)) continue;
        const seen = isVisible(s, x, y);
        const cell = underCell(x, y, s.seed);
        g.globalAlpha = seen ? 1 : 0.5;
        g.fillStyle = cell === ROCK ? COLOR.rock : seen ? COLOR.seenBg : COLOR.memoryBg;
        g.fillRect(vx * CELL_W, vy * CELL_H, CELL_W, CELL_H);
        const key = `${x},${y}`;
        const spot = veins.get(key);
        let glyph = "";
        let color = COLOR["t-plain"];
        // Ore set in a wall shows on the rock and, dug out, leaves plain rock; ore on the floor leaves stone floor.
        if (s.player.x === x && s.player.y === y) [glyph, color] = ["@", COLOR.player];
        else if (stairs.has(key)) [glyph, color] = ["<", COLOR.base];
        else if (spot && spot.cell.left > 0) [glyph, color] = [ORE_GLYPH, itemColor(spot.site.ore)];
        else if (spot && !spot.cell.wall) [glyph, color] = [STONE, COLOR.stone];
        else if (path.has(key)) [glyph, color] = ["-", COLOR.path];
        else if (cell !== ROCK) glyph = ".";
        if (this.markCell(vx, vy, key)) color = "#10151c";
        if (glyph) {
          g.fillStyle = color;
          this.glyph(glyph, vx, vy);
        }
        g.globalAlpha = 1;
      }
    }
    const put = (x: number, y: number, glyph: string, color: string, alpha = 1) => {
      const vx = x - this.originX;
      const vy = y - this.originY;
      if (vx < 0 || vy < 0 || vx >= this.viewW || vy >= this.viewH) return;
      g.globalAlpha = alpha;
      g.fillStyle = COLOR.memoryBg;
      g.fillRect(vx * CELL_W, vy * CELL_H, CELL_W, CELL_H);
      g.fillStyle = color;
      this.glyph(glyph, vx, vy);
      g.globalAlpha = 1;
    };
    // The player's notes, on whichever layer they were written: the outcrop above, a vein found down here.
    for (const site of s.sites) if (site.note) this.noteMark(site.x, site.y, underSeenAt(s, site.x, site.y) || (site.x === s.player.x && site.y === s.player.y));
    // Spines in flight, drawn as the stroke they travel along.
    for (const shot of s.shots) {
      const at = { x: Math.round(shot.x), y: Math.round(shot.y) };
      // Like creatures, a spine shows only where the player can really see.
      if (!isVisible(s, at.x, at.y) || !clearLine(s.seed, at, s.player)) continue;
      put(at.x, at.y, strokeGlyph(shot.vx, shot.vy, false), COLOR.shot);
    }
    // Creatures show when near enough to see or hear, with open cave between.
    for (const mob of s.mobs) {
      // Only what the player can really see shows: a creature out in the dark is not drawn.
      if (!mobVisible(s, mob) || !isVisible(s, mob.x, mob.y)) continue;
      put(mob.x, mob.y, mob.kind === "melee" ? "w" : "s", mob.kind === "melee" ? COLOR.wolf : COLOR.spitter);
    }
    if (probing >= 0) {
      // Prospecting: three rings of sound spread out through the rock, drawn as an ASCII circle.
      const reach = CAVES.probeRadius;
      const fronts = [probing * reach, probing * reach - 2, probing * reach - 4];
      for (let y = s.player.y - reach; y <= s.player.y + reach; y += 1) {
        for (let x = s.player.x - reach; x <= s.player.x + reach; x += 1) {
          const dx = x - s.player.x;
          const dy = (y - s.player.y) / CELL_ASPECT;
          const d = Math.hypot(dx, dy);
          if (d > reach || (!dx && !dy)) continue;
          const ring = fronts.findIndex((r) => r > 0.5 && Math.abs(d - r) < 0.55);
          if (ring < 0) continue;
          put(x, y, strokeGlyph(dx, dy, true), COLOR.probe, [1, 0.6, 0.3][ring]);
        }
      }
    }
  }

  /** Which way the base, or a cave's way out, lies from the player. */
  private direction(s: GameState, home: Point = BASE): string {
    const dx = home.x - s.player.x;
    const dy = home.y - s.player.y;
    const ns = Math.abs(dy) * 2 > Math.abs(dx) ? (dy < 0 ? tr("북") : tr("남")) : "";
    const ew = Math.abs(dx) * 2 > Math.abs(dy) ? (dx < 0 ? tr("서") : tr("동")) : "";
    return ns + ew;
  }
}
