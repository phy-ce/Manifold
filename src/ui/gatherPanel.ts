// The gathering window in the map's column: what lies underfoot (a vein, a patch, a river, a carcass) drawn as a
// picture to press, with its gauges, the F hint and the player's note on the place.
import { tr } from "../i18n";
import { DEER, WATER, forageSeasons, itemCode, itemColor, itemName } from "../content";
import { GameState, Gather, Corpse, NOTE_MAX, actionKey, chosenGather, gathersHere, pickGather, butcherChances, knownReserve, setNote, SEASON_NAMES, canHarvest, canWork, harvestTarget, siteHere, veinCellAt } from "../engine/game";
import { Site, hash } from "../engine/world";
import { keyHintHtml } from "./keyHint";
import { COLOR, siteName } from "./mapLook";

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

/** The word on the F hint for what working a site does. */
const actionWord = (site: Site): string => (site.ore === WATER ? tr("뜨기") : forageSeasons(site.ore) ? tr("줍기") : site.ore === "wood" ? tr("베기") : tr("캐기"));

export class GatherPanel {
  readonly root = document.createElement("div");
  private readonly head = document.createElement("div");
  private readonly vein = document.createElement("button");
  private readonly art = document.createElement("pre");
  /** The list of things underfoot to pick from, when there are several. */
  private readonly choices = document.createElement("div");
  private readonly note = document.createElement("input");
  private veins = new Map<number, Vein>();
  /** Set by the map when a dig comes up: the picture flashes for this many draws. */
  hit = 0;
  private drawnVein = "";

  /**
   * `work` runs when the picture is pressed; `pointNext` lets the map point at where the vein goes on; `noted`
   * tells the finder a note changed, so its list is drawn again.
   */
  constructor(
    private readonly game: () => GameState,
    private readonly changed: () => void,
    work: () => void,
    private readonly pointNext: (again: boolean) => void,
    noted: () => void,
  ) {
    this.root.className = "box vein-panel";
    this.head.className = "vein-head";
    this.vein.type = "button";
    this.vein.className = "vein";
    this.vein.append(this.art);
    this.vein.addEventListener("click", () => work());
    // A note on this place: typed in, kept when the box loses focus or Enter is pressed.
    this.note.type = "text";
    this.note.className = "site-note";
    this.note.maxLength = NOTE_MAX;
    this.note.placeholder = tr("메모");
    this.note.setAttribute("aria-label", tr("이 자리 메모"));
    const keep = () => {
      const site = siteHere(this.game());
      if (site && setNote(this.game(), site.id, this.note.value)) {
        noted();
        this.changed();
      }
    };
    this.note.addEventListener("change", keep);
    this.note.addEventListener("keydown", (e) => {
      e.stopPropagation(); // typing a note must not walk, toggle or open anything
      if (e.key === "Enter") this.note.blur();
    });
    this.choices.className = "gather-choices";
    // The way back from one thing to the list, in whichever head is showing.
    this.head.addEventListener("click", (e) => {
      if (!(e.target as HTMLElement).closest("[data-back]")) return;
      pickGather(this.game(), null);
      this.drawnVein = "";
      this.changed();
    });
    this.root.append(this.head, this.choices, this.note, this.vein);
  }

  /**
   * The gathering window. One thing underfoot shows straight away; two or more (a vein and a carcass, two
   * carcasses) are listed first, and picking one opens it, with a way back to the list.
   */
  draw(s: GameState): void {
    const gathers = gathersHere(s);
    const chosen = chosenGather(s);
    const several = gathers.length > 1;
    this.choices.hidden = !several || !!chosen;
    this.note.hidden = !!chosen?.corpse || (several && !chosen);
    this.vein.hidden = several && !chosen;
    if (several && !chosen) {
      this.root.classList.remove("vacant");
      this.drawChoices(s, gathers);
      return;
    }
    if (chosen?.corpse) {
      this.root.classList.remove("vacant");
      this.drawCorpse(s, chosen.corpse, several);
      return;
    }
    const site = siteHere(s);
    // The panel keeps its room in the column with nothing underfoot, so the search below never moves.
    this.root.classList.toggle("vacant", !site);
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
    const key = `${site.id}|${site.left}|${known.total}|${spot?.cell.x},${spot?.cell.y}|${this.hit > 0}|${open}|${ready}|${several}`;
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
    // Two fixed lines, whatever the gauges hold: the name with the F hint at its right, then the gauges (or the
    // seasons a patch can be picked in). Nothing wraps, so the hint never jumps from one line to the other.
    this.head.innerHTML = `<div class="vein-line">${several ? BACK_BUTTON : ""}<span style="color:${itemColor(site.ore)}" data-tip="${itemName(site.ore)}">${itemCode(site.ore)}</span><span class="vein-name">${siteName(s, site)}</span>` +
      `<span class="push">${keyHintHtml("F", actionWord(site), ready ? "on" : "off")}</span></div>` +
      `<div class="vein-line">${open ? `<span class="reserve-gauges">${gauges}</span>` : `<span class="short">${(forageSeasons(site.ore) ?? []).map((n) => SEASON_NAMES[n]).join(", ")}${tr("에만 수확")}</span>`}</div>`;
  }

  /** Several things underfoot: the window names it gathering and lists them, each a button that opens it. */
  private drawChoices(s: GameState, gathers: Gather[]): void {
    const key = `choices|${gathers.map((g) => `${g.key}:${g.corpse?.left ?? g.site?.left}`).join()}`;
    if (key === this.drawnVein) return;
    this.drawnVein = key;
    this.head.innerHTML = `<div class="vein-line"><span class="vein-name">${tr("채집")}</span></div>`;
    this.choices.replaceChildren(...gathers.map((g) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "tech gather-choice";
      const [code, color, name, left] = g.corpse
        ? ["Dc", COLOR.corpse, `${tr(DEER.name)} ${tr("시체")}`, g.corpse.left]
        : [itemCode(g.site!.ore), itemColor(g.site!.ore), siteName(s, g.site!), g.site!.left];
      b.innerHTML = `<span style="color:${color}">${code}</span> <span class="vein-name">${name}</span><b class="push">${left}</b>`;
      b.addEventListener("click", () => {
        pickGather(this.game(), g.key);
        this.drawnVein = "";
        this.changed();
      });
      return b;
    }));
  }

  /** A carcass picked: its name, F to cut, the cuts left, and the odds of what a cut gives. */
  private drawCorpse(s: GameState, corpse: Corpse, several: boolean): void {
    const ready = actionKey(s) === "work" && !s.dig;
    this.vein.disabled = !ready;
    this.vein.setAttribute("aria-label", `${tr(DEER.name)} ${tr("해체")}`);
    const key = `corpse|${corpse.id}|${corpse.left}|${ready}|${several}`;
    if (key === this.drawnVein) return;
    this.drawnVein = key;
    const cells = 14;
    const fill = Math.round((corpse.left / DEER.butcher.cuts) * cells);
    const odds = butcherChances().map(([id, share]) => `<span style="color:${itemColor(id)}" data-tip="${itemName(id)}">${itemCode(id)}</span> ${Math.round(share * 100)}%`).join(" ");
    this.head.innerHTML = `<div class="vein-line">${several ? BACK_BUTTON : ""}<span style="color:${COLOR.corpse}">Dc</span><span class="vein-name">${tr(DEER.name)} ${tr("시체")}</span>` +
      `<span class="push">${keyHintHtml("F", tr("해체"), ready ? "on" : "off")}</span></div>` +
      `<div class="vein-line"><span class="reserve-gauge"><span class="meter-bar">[${"#".repeat(fill).padEnd(cells, ".")}]</span><b>${corpse.left}/${DEER.butcher.cuts}</b></span><span class="push short">${odds}</span></div>`;
    this.art.innerHTML = carcassArt(corpse.left, DEER.butcher.cuts);
  }
}

/** The way back from one thing underfoot to the list of them all. */
const BACK_BUTTON = `<button type="button" class="tech gather-back" data-back aria-label="${tr("채집 목록")}">&lt;</button>`;

/**
 * A deer lying on its side on the grass, the same size as a vein's picture: body and neck, the head with its
 * antler, legs folded out below. Cut by cut the hide is opened from the rump forward and the ribs show.
 */
function carcassArt(left: number, cuts: number): string {
  const HIDE = ["#8a5a3c", "#a8704a", "#c08a5c"];
  const BELLY = "#e0c8a0";
  const RIB = "#ece4d0";
  const RAW = "#b03a2e";
  const grid: { ch: string; color: string }[][] = [];
  for (let y = 0; y < PANEL_ROWS; y += 1) {
    grid.push([]);
    for (let x = 0; x < PANEL_COLS; x += 1) {
      const r = hash(x, y, 77);
      if (y >= PANEL_ROWS - 2) grid[y].push({ ch: r < 0.4 ? "~" : r < 0.75 ? "," : r < 0.9 ? "." : "o", color: SOIL[y & 1] });
      else if (y === PANEL_ROWS - 3) grid[y].push({ ch: r < 0.5 ? "\"" : r < 0.8 ? "'" : " ", color: LEAF[Math.floor(r * 6) % 3] });
      else grid[y].push({ ch: " ", color: LITTER[1] });
    }
  }
  const put = (x: number, y: number, ch: string, color: string) => {
    if (y >= 0 && y < PANEL_ROWS && x >= 0 && x < PANEL_COLS) grid[y][x] = { ch, color };
  };
  // The body: a long low oval, lit along the back, pale at the belly. Opened from the rump as cuts are taken.
  const [cx, cy, rx, ry] = [19, 4.2, 13, 2.4];
  const opened = Math.round((1 - left / cuts) * rx * 2);
  for (let y = 1; y < PANEL_ROWS - 1; y += 1) {
    for (let x = cx - rx; x <= cx + rx; x += 1) {
      const e = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
      if (e > 1) continue;
      const back = y < cy - 0.8;
      const belly = y > cy + 1;
      if (x - (cx - rx) < opened) put(x, y, e > 0.7 ? "(" : x % 2 ? "=" : "-", e > 0.7 ? RAW : RIB);
      else put(x, y, back ? "%" : belly ? "~" : "#", back ? HIDE[2] : belly ? BELLY : HIDE[e < 0.4 ? 1 : 0]);
    }
  }
  // Neck and head to the right, the eye shut, an antler branching up.
  for (const [x, y, ch] of [[32, 3, "#"], [33, 3, "#"], [34, 2, "%"], [35, 2, "#"], [36, 2, "#"], [37, 2, "#"], [38, 3, "#"], [39, 3, ">"], [36, 3, "#"], [37, 3, "#"], [33, 4, "#"], [34, 3, "#"]] as const) put(x, y, ch, HIDE[1]);
  put(37, 2, "-", "#2a1c14");
  for (const [x, y, ch] of [[35, 1, "\\"], [34, 0, "Y"], [36, 1, "/"], [37, 0, "Y"]] as const) put(x, y, ch, RIB);
  // Legs folded out under the belly.
  for (const [x, y, ch] of [[9, 6, "/"], [12, 6, "/"], [24, 6, "\\"], [27, 6, "\\"], [8, 7, "_"], [11, 7, "_"], [25, 7, "_"], [28, 7, "_"]] as const) put(x, y, ch, HIDE[0]);
  // A short tail at the rump.
  put(cx - rx - 1, 3, "~", BELLY);
  return grid.map((row) => row.map((c) => (c.ch === " " ? " " : `<span style="color:${c.color}">${c.ch}</span>`)).join("")).join("\n");
}
