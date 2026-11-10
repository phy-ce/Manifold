// World map and vein panel, shown whenever the player isn't working at the base.
// The map is one canvas: 1,200 DOM cells were slow to update while walking.
import { tr } from "../i18n";
import { BIOMES, CAVE, CAVES, WATER, YETI, forageSeasons, itemCode, itemColor, itemMatches, itemName } from "../content";
import { GameState, NOTE_MAX, actionKey, knownReserve, tooHeavyToWork, VeinSpot, setNote, attack, canStrike, creatureInfo, SEASON_NAMES, clearLine, mobVisible, stairHere, caveDoorHere, underSeenAt, nearestStair, enterCave, leaveCave, onThisMap, siteSpotHere, setSafeWalk, canHarvest, canWork, harvestTarget, isRevealed, isVisible, mine, nextVeinCell, siteHere, standBeside, startProbe, veinCellAt, walkTo } from "../engine/game";
import { BASE, CELL_ASPECT, Point, ROCK, Site, biomeAt, underCell, cellsOf, groundColor, hash, layerOf, orderSites, terrain, waterKind } from "../engine/world";
import { CLICK, keyHintHtml } from "./keyHint";
import { SOUND } from "./sound";
import { FightPanel } from "./fightPanel";

/**
 * The window onto the endless map stays centred on the player and fills the middle of the screen, up to this
 * many cells (1080×900px at 1920×1080). A smaller screen shows fewer cells at the same size.
 */
const MAX_VIEW_W = 120;
const MAX_VIEW_H = 50;
const CELL_W = 9;
const CELL_H = 18;
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
/** Height of one search result row and the gap under it, matching .route-row in style.css (--control + --gap-sm). */
const RESULT_ROW = 36;
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

const COLOR: Record<string, string> = {
  "t-plain": "#3c4955", "t-hill1": "#7c8b9b", "t-hill2": "#a9b6c2", "t-hill3": "#e6ebef", "t-water": "#4d8fc4", "t-ice": "#a9d4ec",
  player: "#8fd16f", base: "#dfe5ea", path: "#ffb238", remembered: "#3a4552", memoryBg: "#141a22", seenBg: "#1d2631",
  cave: "#c9a27a", rock: "#2b3541", probe: "#ffb238", wolf: "#ff5f56", spitter: "#c678dd", yeti: "#8fe3ff", shot: "#ff8c5a",
  stone: "#5b6670",
};
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

/** One character of a panel picture. `unit` groups the characters that go together when harvested. */
interface PanelCell {
  ch: string;
  color: string;
  unit?: number;
  /** What shows once the unit has been taken. */
  under?: PanelCell;
}
/** A vein or a patch: its picture, and how many harvestable units it shows when full, outermost first to go. */
interface Vein {
  grid: PanelCell[][];
  units: number;
}

const PANEL_ROWS = 9;
const PANEL_COLS = 44;
/** Two tones of rock bedding, and the soil, leaves and litter of a forage patch. */
const BED = ["#3a4652", "#4a5966"];
const CRACK = "#5d6d7b";
const SOIL = ["#4a3a2c", "#5c4734"];
const LEAF = ["#3f6b34", "#5b8a45", "#2f5228"];
const LITTER = ["#6b5236", "#4f5b38", "#7a6a4a"];
const STEM = "#d8cfba";

/** A colour darkened (k < 1) or lightened (k > 1) toward black or white. */
function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v: number) => Math.round(k <= 1 ? v * k : v + (255 - v) * (k - 1));
  return `rgb(${ch(n >> 16)},${ch((n >> 8) & 255)},${ch(n & 255)})`;
}


/**
 * A vein in the rock face: bedded strata in two tones with the odd crack, and the ore running through
 * them brightest at its core; mining takes the edges first. Every grade looks the same: the grade is never shown.
 */
function buildVein(site: Site): Vein {
  const seed = site.seed;
  const color = itemColor(site.ore);
  const grid: PanelCell[][] = [];
  const ore: { x: number; y: number; d: number }[] = [];
  for (let y = 0; y < PANEL_ROWS; y += 1) {
    grid.push([]);
    for (let x = 0; x < PANEL_COLS; x += 1) {
      const r = hash(x, y, seed);
      // Bedding: bands that dip and rise gently across the face.
      const band = Math.floor((y + Math.sin(x * 0.12 + seed) * 1.3) / 2) & 1;
      const ch = r > 0.97 ? (hash(y, x, seed + 5) < 0.5 ? "/" : "\\") : band ? (r < 0.35 ? " " : r < 0.7 ? "-" : r < 0.9 ? "_" : "=") : (r < 0.45 ? " " : r < 0.75 ? "." : r < 0.92 ? ":" : "'");
      grid[y].push({ ch, color: r > 0.97 ? CRACK : BED[band] });
      const d = Math.abs(y - (4 + Math.sin(x * 0.3 + seed) * 2));
      const reach = 1.5 + Math.sin(x * 0.21 + seed * 2) * 0.7;
      if (x > 1 && x < PANEL_COLS - 2 && d < reach) ore.push({ x, y, d: d / reach });
    }
  }
  // Core first in the list, so the last units, the first to go, are the edges.
  ore.sort((a, b) => a.d - b.d);
  ore.forEach(({ x, y, d }, i) => {
    const pick = hash(y, x, seed + 1);
    const ch = d > 1 ? "o" : d < 0.35 ? "#$"[Math.floor(pick * 2)] : d < 0.7 ? "%&#"[Math.floor(pick * 3)] : "*+%"[Math.floor(pick * 3)];
    grid[y][x] = { ch, color: shade(color, d < 0.35 ? 1.18 : d < 0.7 ? 1 : 0.72), unit: i };
  });
  return { grid, units: ore.length };
}

/** A riverbank: the far bank, slow water in bands, and the near bank of mud. The level drops as it is drawn down. */
function buildRiver(site: Site): Vein {
  const blue = itemColor(WATER);
  const grid: PanelCell[][] = [];
  for (let y = 0; y < PANEL_ROWS; y += 1) {
    grid.push([]);
    for (let x = 0; x < PANEL_COLS; x += 1) {
      const r = hash(x, y, site.seed);
      if (y === 0 || y === PANEL_ROWS - 1) grid[y].push({ ch: r < 0.5 ? "," : r < 0.8 ? "." : "'", color: y ? SOIL[1] : LEAF[0] });
      else grid[y].push({ ch: r < 0.3 ? "~" : r < 0.45 ? "-" : " ", color: shade(blue, y % 2 ? 1 : 0.75), unit: y - 1 });
    }
  }
  // Top rows go first as the level drops.
  for (const row of grid) for (const cell of row) if (cell.unit !== undefined) cell.unit = PANEL_ROWS - 3 - cell.unit;
  return { grid, units: PANEL_ROWS - 2 };
}

/**
 * A forage patch on the ground, nothing like a rock face: soil and grass along the bottom, and either
 * berry bushes hung with fruit or mushrooms in leaf litter. Each berry or mushroom is one unit.
 */
function buildPatch(site: Site): Vein {
  const seed = site.seed;
  const color = itemColor(site.ore);
  const berries = site.ore === "Be";
  const grid: PanelCell[][] = [];
  for (let y = 0; y < PANEL_ROWS; y += 1) {
    grid.push([]);
    for (let x = 0; x < PANEL_COLS; x += 1) {
      const r = hash(x, y, seed);
      // Open air above, the ground at the bottom two rows, grass tufts on its top edge.
      if (y >= PANEL_ROWS - 2) grid[y].push({ ch: r < 0.4 ? "~" : r < 0.75 ? "," : r < 0.9 ? "." : "o", color: SOIL[y & 1] });
      else if (y === PANEL_ROWS - 3) grid[y].push(r < 0.55 ? { ch: r < 0.3 ? "\"" : "'", color: LEAF[Math.floor(r * 6) % 3] } : berries ? { ch: " ", color: SOIL[0] } : { ch: r < 0.8 ? "," : "_", color: LITTER[Math.floor(r * 9) % 3] });
      else grid[y].push({ ch: !berries && r > 0.96 ? "." : " ", color: LITTER[1] });
    }
  }
  const spots: { x: number; y: number; ch: string }[][] = [];
  if (berries) {
    // Three to five round bushes, leaves dense at the middle, berries hung through them.
    const count = 3 + Math.floor(hash(1, 2, seed) * 3);
    for (let b = 0; b < count; b += 1) {
      const cx = Math.round(((b + 0.5) / count) * PANEL_COLS + (hash(b, 3, seed) - 0.5) * 4);
      const rx = 4 + hash(b, 4, seed) * 2;
      const ry = 2.4 + hash(b, 5, seed) * 1;
      const cy = PANEL_ROWS - 3 - ry + 0.6;
      for (let y = 0; y < PANEL_ROWS - 2; y += 1) {
        for (let x = 0; x < PANEL_COLS; x += 1) {
          const e = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
          if (e > 1) continue;
          const r = hash(x, y, seed + 2);
          grid[y][x] = { ch: e < 0.5 ? (r < 0.5 ? "&" : "%") : r < 0.5 ? "*" : "^", color: LEAF[e < 0.35 ? 2 : e < 0.75 ? 0 : 1] };
          if (r > 0.72) spots.push([{ x, y, ch: "o" }]);
        }
      }
    }
  } else {
    // Mushrooms in the litter: small ones a cap on a stem, the odd big one a wide cap.
    for (let x = 1; x < PANEL_COLS - 3; x += 1) {
      const r = hash(x, 11, seed);
      if (r < 0.62) continue;
      const big = r > 0.9;
      const y = PANEL_ROWS - 3;
      if (big && x < PANEL_COLS - 4) {
        spots.push([{ x, y: y - 2, ch: "." }, { x: x + 1, y: y - 2, ch: "-" }, { x: x + 2, y: y - 2, ch: "." }, { x, y: y - 1, ch: "(" }, { x: x + 1, y: y - 1, ch: "_" }, { x: x + 2, y: y - 1, ch: ")" }, { x: x + 1, y, ch: "|" }]);
        x += 4;
      } else {
        spots.push([{ x, y: y - 1, ch: hash(x, 12, seed) < 0.5 ? "n" : "m" }, { x, y, ch: "|" }]);
        x += 1;
      }
    }
  }
  // Middle first, so picking starts from the edges of the patch.
  spots.sort((a, b) => Math.abs(a[0].x - PANEL_COLS / 2) - Math.abs(b[0].x - PANEL_COLS / 2));
  spots.forEach((group, i) => {
    for (const { x, y, ch } of group) grid[y][x] = { ch, color: ch === "|" ? STEM : shade(color, ch === "o" ? 1.1 : 1), unit: i, under: grid[y][x] };
  });
  return { grid, units: spots.length };
}

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

/** A water site by the kind of water it draws from, and open water itself on the map. */
const WATER_SITE = { river: tr("강가"), pond: tr("저수지"), oasis: tr("오아시스"), ice: tr("얼음 구멍") };
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

/** The word on the F hint for what working a site does. */
const actionWord = (site: Site): string => (site.ore === WATER ? tr("뜨기") : forageSeasons(site.ore) ? tr("줍기") : tr("캐기"));

const siteName = (s: GameState, site: Site): string =>
  site.ore === CAVE ? tr("자연 동굴") : site.ore === WATER ? `${WATER_SITE[waterKind(site.x, site.y, s.seed)]} ${site.code ?? ""}`.trim() : itemName(site.ore) + (site.left <= 0 ? tr(" (고갈됨)") : canHarvest(s, site) ? "" : tr(" (수확 불가)"));

export class MapView {
  /** The map itself, in the middle of the screen. */
  readonly root = document.createElement("section");
  /** Everything about the map, in the left column: where, keys, the view ahead, the place underfoot, search. */
  readonly side = document.createElement("div");
  private viewW = 60;
  private viewH = 20;
  private zoom = savedZoom();
  /** Which page of search results shows; the list never scrolls. */
  private resultPage = 0;
  private readonly pagerBar = document.createElement("div");
  private readonly canvas = document.createElement("canvas");
  private readonly ctx = this.canvas.getContext("2d")!;
  private readonly panel = document.createElement("div");
  private readonly fight: FightPanel;
  private readonly head = document.createElement("div");
  private readonly vein = document.createElement("button");
  private readonly art = document.createElement("pre");
  private readonly search = document.createElement("input");
  private readonly results = document.createElement("div");
  private readonly note = document.createElement("input");
  private readonly hideButton = document.createElement("button");
  /** Emptied veins are left out of search results unless asked for. */
  private hideEmpty = true;
  /** A cave entrance or a stair double-clicked: the layer changes once the player gets there. */
  private layerAt: { x: number; y: number; z: number } | null = null;
  private readonly place = document.createElement("div");
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
  private readonly warn = document.createElement("div");
  /** What safe mode stopped for, shown for a moment at the top of the screen. */
  private readonly haltFlash = document.createElement("div");
  private veins = new Map<number, Vein>();
  private hit = 0;
  private drawnVein = "";
  private drawnMap = "";
  private drawnResults = "";
  private originX = 0;
  private originY = 0;

  constructor(private readonly game: () => GameState, private readonly changed: () => void) {
    this.root.className = "box map-box map-view";
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

    this.panel.className = "box vein-panel";
    this.head.className = "bar-row";
    this.vein.type = "button";
    this.vein.className = "vein";
    this.vein.append(this.art);
    this.vein.addEventListener("click", () => this.work());
    // A note on this place: typed in, kept when the box loses focus or Enter is pressed.
    this.note.type = "text";
    this.note.className = "site-note";
    this.note.maxLength = NOTE_MAX;
    this.note.placeholder = tr("메모");
    this.note.setAttribute("aria-label", tr("이 자리 메모"));
    const keep = () => {
      const site = siteHere(this.game());
      if (site && setNote(this.game(), site.id, this.note.value)) {
        this.drawnResults = "";
        this.changed();
      }
    };
    this.note.addEventListener("change", keep);
    this.note.addEventListener("keydown", (e) => {
      e.stopPropagation(); // typing a note must not walk, toggle or open anything
      if (e.key === "Enter") this.note.blur();
    });
    this.panel.append(this.head, this.note, this.vein);

    // Every line in the column keeps to one line: long text is cut short rather than wrapped, so nothing moves.
    this.place.className = "box map-line";
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
    this.warn.className = "walk-warn";
    this.warn.setAttribute("role", "status");
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
    this.root.append(this.canvas);

    const finder = document.createElement("div");
    finder.className = "box finder";
    this.search.id = "map-search";
    this.search.type = "search";
    this.search.placeholder = tr("본 적 있는 곳에서 찾기");
    this.search.setAttribute("aria-label", tr("지도 검색"));
    this.search.addEventListener("input", () => this.drawResults());
    this.results.className = "map-results";
    this.hideButton.type = "button";
    this.hideButton.className = "tech";
    this.hideButton.textContent = tr("고갈 숨기기");
    this.hideButton.classList.add("selected");
    this.hideButton.addEventListener("click", () => {
      this.hideEmpty = !this.hideEmpty;
      this.hideButton.classList.toggle("selected", this.hideEmpty);
      this.drawResults();
    });
    const tools = document.createElement("div");
    tools.className = "bar-row";
    tools.append(this.hideButton);
    this.pagerBar.className = "pager";
    tools.append(this.pagerBar);
    finder.append(this.search, tools, this.results);
    // The results come in pages of as many rows as fit; a taller screen shows more per page.
    new ResizeObserver(() => {
      this.drawnResults = "";
      this.drawResults();
    }).observe(this.results);

    this.side.append(this.place, walkMode, this.warn, this.fight.root, this.panel, finder);
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
      return underCell(x, y, s.seed) === ROCK ? tr("암반") : "";
    }
    if (x === BASE.x && y === BASE.y) return tr("기지");
    // A yeti takes no wounds, so it is only named.
    if (s.mobs.some((m) => m.x === x && m.y === y && mobVisible(s, m))) return tr(YETI.name);
    const noted = notedSpots(s).get(`${x},${y}`);
    if (!isRevealed(s, x, y)) return noted?.note ?? "";
    const site = knownCells(s).get(`${x},${y}`)?.site ?? s.sites.find((v) => v.ore === CAVE && v.x === x && v.y === y && onThisMap(s, v));
    if (site) return site.note ? `${siteName(s, site)} · ${site.note}` : siteName(s, site);
    if (noted) return noted.note!;
    const [, cls, height] = terrain(x, y, s.seed);
    const biome = BIOMES[biomeAt(x, y, s.seed)].name;
    const what = cls === "t-hill" ? `${tr("산 고도")} ${height}` : cls === "t-water" ? WATER_CELL[waterKind(x, y, s.seed)] : cls === "t-ice" ? tr("얼음") : "";
    return what ? `${biome} · ${what}` : biome;
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
    const use = actionKey(this.game());
    if (use === "fight") {
      if (!repeat || canStrike(this.game())) this.fight.strikeNearest();
    } else if (use === "work" && !repeat) this.work();
  }

  /** Works the vein; with nothing left to dig here, shows again where the vein goes on. */
  private work(): void {
    const s = this.game();
    // The cell being worked: a vein cell underfoot or in the wall beside, else the place itself (food, water).
    const at = harvestTarget(s)?.cell ?? s.player;
    if (mine(s)) {
      this.hit = 4;
      this.emphasize([at], "soft");
    } else if (tooHeavyToWork(s)) {
      // The load is the only thing in the way: the load meter jolts, so it is plain why nothing came up.
      window.dispatchEvent(new Event("manifold:too-heavy"));
    } else this.pointNext(true);
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
    this.search.classList.toggle("tutorial-target", on);
  }

  draw(): void {
    const s = this.game();
    this.changeLayer();
    // The safe switch and prospecting read as key hints: lit while on.
    const safeLabel = keyHintHtml("T", tr("안전 모드"), s.safeWalk ? "on" : "off");
    if (this.safe.dataset.shown !== safeLabel) this.safe.innerHTML = this.safe.dataset.shown = safeLabel;
    this.safe.setAttribute("aria-pressed", String(s.safeWalk));
    // Where safe mode stopped the walk: what lies ahead, what it costs, and how to go on anyway.
    const halt = s.halt;
    const warning = halt ? `${keyHintHtml(CLICK(), tr("건너기"))} -${halt.damage}` : "";
    if (this.warn.dataset.shown !== warning) {
      this.warn.dataset.shown = warning;
      this.warn.innerHTML = warning;
      // The cell it stopped short of blinks on the map, then stays boxed in red until the walk goes on.
      if (halt) {
        this.emphasize([halt], "strong");
        // And says what it saw, over the top of the map like a hit does: "물 감지 -3".
        this.haltFlash.textContent = `${halt.kind === "water" ? tr("물") : tr("고도 변화")} ${tr("감지")} -${halt.damage}`;
        this.haltFlash.classList.remove("hit");
        void this.haltFlash.offsetWidth;
        this.haltFlash.classList.add("hit");
      }
    }
    this.fight.draw();
    this.drawVein(s);
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
    // On the surface the map only changes when the player moves, a cell empties or something blinks; underground creatures move every step.
    const emptied = s.sites.reduce((n, site) => n + (site.left > 0 ? 0 : 1) + (site.found ? 1000 : 0) + (site.note ? 31 : 0) + 7 * (site.cells?.filter((c) => c.left <= 0).length ?? 0), 0);
    const live = cave || s.mobs.length || this.marking() ? `${s.time},${Math.floor(performance.now() / 150)}` : "";
    const key = `${s.z},${s.player.x},${s.player.y},${s.facing?.x},${s.facing?.y},${s.path.length},${s.sites.length},${emptied},${s.season},${s.halt?.x},${s.halt?.y},${live}`;
    if (key === this.drawnMap) return;
    this.drawnMap = key;
    this.originX = s.player.x - Math.floor(this.viewW / 2);
    this.originY = s.player.y - Math.floor(this.viewH / 2);
    if (cave) this.paintUnder(s, probing);
    else this.paint(s);
    // Where safe mode stopped: the hazard cell boxed in red, as long as the stop holds.
    if (s.halt) {
      const vx = s.halt.x - this.originX;
      const vy = s.halt.y - this.originY;
      this.ctx.strokeStyle = COLOR.wolf;
      this.ctx.lineWidth = 2;
      this.ctx.strokeRect(vx * CELL_W + 1, vy * CELL_H + 1, CELL_W - 2, CELL_H - 2);
    }
    // The way home may be off screen, so always say how far away it is: underground, the nearest stair seen.
    const home: Point | undefined = cave ? nearestStair(s) : BASE;
    const steps = home ? Math.max(Math.abs(s.player.x - home.x), Math.abs(s.player.y - home.y)) : 0;
    const mark = cave ? `${tr("지하")} ${CAVES.layer} · <` : "H";
    const where = home && steps ? `${mark} ${steps}${tr("칸")} ${this.direction(s, home)}` : mark;
    if (this.place.textContent !== where) {
      this.place.textContent = where;
      this.place.dataset.tip = where;
    }
    this.drawResults();
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
        else if (spot) {
          const site = spot.site;
          glyph = site.ore === WATER ? "W" : site.left <= 0 ? "x" : !canHarvest(s, site) ? "'" : ORE_GLYPH;
          color = itemColor(site.ore);
        } else if (path.has(key)) [glyph, color] = ["-", COLOR.path];
        else {
          const [ch, cls, height] = terrain(x, y, s.seed);
          glyph = ch;
          color = cls === "t-hill" ? COLOR[`t-hill${height}`] : groundColor(cls) ?? COLOR[cls] ?? COLOR["t-plain"];
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
    // A yeti shows only where the player can see, like everything else on the map.
    for (const mob of s.mobs) {
      const vx = mob.x - this.originX;
      const vy = mob.y - this.originY;
      if (!mobVisible(s, mob) || !isVisible(s, mob.x, mob.y) || vx < 0 || vy < 0 || vx >= this.viewW || vy >= this.viewH) continue;
      g.fillStyle = COLOR.seenBg;
      g.fillRect(vx * CELL_W, vy * CELL_H, CELL_W, CELL_H);
      g.fillStyle = COLOR.yeti;
      this.glyph("Y", vx, vy);
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

  /** Finds things the player has seen: nothing in unexplored ground is listed. */
  private drawResults(): void {
    const s = this.game();
    const query = this.search.value.trim().toLowerCase();
    const emptied = s.sites.filter((v) => v.left <= 0).length;
    const prospected = s.sites.filter((v) => v.found).length;
    const key = `${query}|${s.z}|${s.player.x},${s.player.y}|${s.sites.length}|${emptied}|${prospected}|${this.hideEmpty}`;
    // A page holds as many rows as the box has room for.
    const perPage = Math.max(1, Math.floor((this.results.clientHeight + 4) / RESULT_ROW));
    const full = `${key}|${perPage}|${this.resultPage}`;
    if (full === this.drawnResults) return;
    if (!this.drawnResults.startsWith(`${key}|`)) this.resultPage = 0; // a new search starts on its first page
    this.drawnResults = `${key}|${perPage}|${this.resultPage}`;
    if (!query) {
      this.results.replaceChildren();
      this.pagerBar.replaceChildren();
      return;
    }
    const steps = (v: Site) => Math.max(Math.abs(v.x - s.player.x), Math.abs(v.y - s.player.y));
    // What the player knows on this layer, and their own notes on either.
    const here = (v: Site) => onThisMap(s, v) && (s.z < 0 || isRevealed(s, v.x, v.y));
    const matching = s.sites
      .filter((v) => here(v) || !!v.note)
      // By name, code or place name, or by category: "점토" finds every clay vein, "연료" every coal.
      .filter((v) => itemMatches(v.ore, query, [siteName(s, v), v.note ?? ""]));
    const all = orderSites(matching, steps, this.hideEmpty);
    const pages = Math.max(1, Math.ceil(all.length / perPage));
    this.resultPage = Math.min(this.resultPage, pages - 1);
    this.drawnResults = `${key}|${perPage}|${this.resultPage}`;
    const found = all.slice(this.resultPage * perPage, (this.resultPage + 1) * perPage);
    const turn = (label: string, to: number) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "tech";
      b.textContent = label;
      b.disabled = to < 0 || to >= pages;
      b.addEventListener("click", () => {
        this.resultPage = to;
        this.drawResults();
      });
      return b;
    };
    const count = document.createElement("span");
    count.textContent = `${this.resultPage + 1}/${pages}`;
    this.pagerBar.replaceChildren(...(pages > 1 ? [turn("<", this.resultPage - 1), count, turn(">", this.resultPage + 1)] : []));
    this.results.replaceChildren(...found.map((site) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "route-row";
      const code = document.createElement("span");
      code.style.color = itemColor(site.ore);
      code.textContent = itemCode(site.ore);
      const name = document.createElement("span");
      name.textContent = site.note ? `${siteName(s, site)} · ${site.note}` : siteName(s, site);
      name.className = "route-name";
      const where = document.createElement("span");
      where.className = "push card-note";
      // A note known only on the other layer is listed but can't be walked to from here.
      const spot = here(site) ? siteSpotHere(s, site) : undefined;
      const state = !spot ? (s.z < 0 ? tr("지표") : tr("지하")) : isVisible(s, spot.x, spot.y) ? tr("보임") : tr("기억");
      where.textContent = `${state} · ${steps(site)}${tr("칸")}`;
      b.disabled = !spot;
      b.append(code, name, where);
      b.addEventListener("click", () => {
        const g = this.game();
        const to = siteSpotHere(g, site);
        if (!to) return;
        // Ore in a wall is reached from the floor beside it.
        const wall = "wall" in to && to.wall ? standBeside(g, to.x, to.y) : undefined;
        walkTo(g, wall ?? to);
        this.changed();
      });
      return b;
    }));
    if (!found.length) this.results.textContent = tr("본 적 있는 곳에 없습니다");
  }

  /** Which way the base, or a cave's way out, lies from the player. */
  private direction(s: GameState, home: Point = BASE): string {
    const dx = home.x - s.player.x;
    const dy = home.y - s.player.y;
    const ns = Math.abs(dy) * 2 > Math.abs(dx) ? (dy < 0 ? tr("북") : tr("남")) : "";
    const ew = Math.abs(dx) * 2 > Math.abs(dy) ? (dx < 0 ? tr("서") : tr("동")) : "";
    return ns + ew;
  }

  private drawVein(s: GameState): void {
    const site = siteHere(s);
    // The panel keeps its room in the column with nothing underfoot, so the search below never moves.
    this.panel.classList.toggle("vacant", !site);
    if (!site) return;
    // The note box shows this place's note, unless the player is typing in it.
    if (document.activeElement !== this.note && this.note.value !== (site.note ?? "")) this.note.value = site.note ?? "";
    const river = site.ore === WATER;
    // The season or a drum decides whether food or water can be had at all; F works only on a cell with something in it.
    // With a creature in sight F only fights (actionKey), so working here waits and its hint goes dim.
    const open = river ? true : canHarvest(s, site);
    const target = harvestTarget(s);
    const ready = !!target && canWork(s, target) && actionKey(s) === "work";
    this.vein.disabled = !ready;
    this.vein.setAttribute("aria-label", river ? tr("빈 철 드럼통에 물 뜨기") : `${itemName(site.ore)} ${tr("캐기")}`);
    this.pointNext(false);
    if (this.hit > 0) this.hit -= 1;
    // The cell being worked and the vein as far as the player has seen it.
    const spot = harvestTarget(s) ?? veinCellAt(s, s.player.x, s.player.y);
    const known = knownReserve(s, site);
    const key = `${site.id}|${site.left}|${known.total}|${spot?.cell.x},${spot?.cell.y}|${this.hit > 0}|${open}|${ready}`;
    if (key === this.drawnVein) return;
    this.drawnVein = key;

    const forage = !!forageSeasons(site.ore);
    if (!this.veins.has(site.id)) this.veins.set(site.id, river ? buildRiver(site) : forage ? buildPatch(site) : buildVein(site));
    const vein = this.veins.get(site.id)!;
    const shown = Math.ceil((site.left / site.total) * vein.units);
    // The unit the last stroke took flashes; out of season a patch shows its bushes and litter bare.
    const flash = this.hit > 0 ? Math.min(shown, vein.units - 1) : -1;
    const bare = forage && !open;
    let html = "";
    for (const row of vein.grid) {
      for (const cell of row) {
        const taken = cell.unit !== undefined && (cell.unit >= shown || bare);
        const show = taken ? cell.under ?? (river ? { ch: " ", color: "" } : { ch: ".", color: BED[0] }) : cell;
        if (cell.unit === flash && !river && cell.ch !== "|") html += '<span class="hit">*</span>';
        else html += show.ch === " " ? " " : `<span style="color:${show.color}">${show.ch}</span>`;
      }
      html += "\n";
    }
    this.art.innerHTML = html;
    // Two gauges for a vein: this cell, what one can dig standing here; and the vein, as much of it as has been
    // seen. Food and water are a single place, so one gauge.
    const gauge = (label: string, left: number, total: number, width: number) => {
      const fill = total > 0 ? Math.round((Math.max(0, left) / total) * width) : 0;
      return `<span class="reserve-gauge">${label}<span class="meter-bar">[${"#".repeat(fill).padEnd(width, ".")}]</span><b>${Math.max(0, left)}/${total}</b></span>`;
    };
    const cell = spot && spot.site === site ? spot.cell : undefined;
    const gauges = site.cells
      ? gauge(tr("칸"), cell?.left ?? 0, cell ? cell.total ?? cell.left : 0, 6) + gauge(tr("광맥"), known.left, known.total, 8)
      : gauge("", site.left, site.total, 14);
    this.head.innerHTML = `<span style="color:${itemColor(site.ore)}">${itemCode(site.ore)}</span><span>${siteName(s, site)}</span>` +
      `<span class="push reserve-gauges">${gauges}</span>` +
      (open ? "" : `<span class="short">${(forageSeasons(site.ore) ?? []).map((n) => SEASON_NAMES[n]).join(", ")}${tr("에만 수확")}</span>`) +
      keyHintHtml("F", actionWord(site), ready ? "on" : "off");
  }
}
