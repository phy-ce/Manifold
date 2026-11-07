// World map and vein panel, shown whenever the player isn't working at the base.
// The map is one canvas: 1,200 DOM cells were slow to update while walking.
import { WATER, forageSeasons, itemCode, itemColor, itemName } from "../content";
import { GameState, SEASON_NAMES, canHarvest, isRevealed, isVisible, mine, siteHere, walkTo } from "../engine/game";
import { BASE, Site, hash, terrain } from "../engine/world";

/** Size of the window onto the endless map, which stays centred on the player. */
const VIEW_W = 60;
const VIEW_H = 20;
const CELL_W = 9;
const CELL_H = 18;
const MAX_RESULTS = 10;

const COLOR: Record<string, string> = {
  "t-plain": "#3c4955", "t-hill1": "#7c8b9b", "t-hill2": "#a9b6c2", "t-hill3": "#e6ebef", "t-water": "#4d8fc4",
  player: "#8fd16f", base: "#dfe5ea", path: "#ffb238", remembered: "#3a4552", memoryBg: "#141a22", seenBg: "#1d2631",
};

interface VeinCell {
  x: number;
  y: number;
  glyph: string;
}
interface Vein {
  rock: string[][];
  cells: VeinCell[];
}

function buildVein(site: Site): Vein {
  const rows = 9;
  const cols = 44;
  const rock: string[][] = [];
  const found: (VeinCell & { d: number })[] = [];
  for (let y = 0; y < rows; y += 1) {
    rock.push([]);
    for (let x = 0; x < cols; x += 1) {
      const r = hash(x, y, site.seed);
      rock[y].push(r < 0.45 ? " " : r < 0.7 ? "." : r < 0.86 ? ":" : r < 0.95 ? "," : "'");
      const d = Math.abs(y - (4 + Math.sin(x * 0.3 + site.seed) * 2));
      if (x > 2 && x < cols - 3 && d < 1.7 + Math.sin(x * 0.21 + site.seed * 2) * 0.8) {
        found.push({ x, y, d, glyph: "%&#$"[Math.floor(hash(y, x, site.seed + 1) * 4)] });
      }
    }
  }
  found.sort((a, b) => a.d - b.d); // core first, so mining wears the vein from its edges
  return { rock, cells: found };
}

const siteName = (s: GameState, site: Site): string =>
  site.ore === WATER ? "강가" : itemName(site.ore) + (site.left <= 0 ? " (고갈됨)" : canHarvest(s, site) ? "" : " (수확 불가)");

export class MapView {
  readonly root = document.createElement("section");
  private readonly canvas = document.createElement("canvas");
  private readonly ctx = this.canvas.getContext("2d")!;
  private readonly panel = document.createElement("div");
  private readonly head = document.createElement("div");
  private readonly vein = document.createElement("button");
  private readonly art = document.createElement("pre");
  private readonly search = document.createElement("input");
  private readonly results = document.createElement("div");
  private readonly place = document.createElement("div");
  private veins = new Map<number, Vein>();
  private hit = 0;
  private drawnVein = "";
  private drawnMap = "";
  private drawnResults = "";
  private originX = 0;
  private originY = 0;

  constructor(private readonly game: () => GameState, private readonly changed: () => void) {
    this.root.className = "map-view";
    const scale = window.devicePixelRatio || 1;
    this.canvas.className = "map";
    this.canvas.width = VIEW_W * CELL_W * scale;
    this.canvas.height = VIEW_H * CELL_H * scale;
    this.canvas.style.width = `${VIEW_W * CELL_W}px`;
    this.canvas.style.height = `${VIEW_H * CELL_H}px`;
    this.canvas.setAttribute("aria-label", "지도, 칸을 클릭해 이동");
    this.ctx.scale(scale, scale);
    this.ctx.textBaseline = "middle";
    this.ctx.textAlign = "center";
    this.canvas.addEventListener("click", (e) => {
      const [x, y] = this.cellAt(e);
      walkTo(this.game(), { x, y });
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
    this.vein.addEventListener("click", () => {
      if (mine(this.game())) this.hit = 4;
      this.changed();
    });
    this.panel.append(this.head, this.vein);

    const mapBox = document.createElement("div");
    mapBox.className = "box scroll";
    this.place.className = "bar-row";
    const legend = document.createElement("div");
    legend.className = "card-note map-legend";
    legend.textContent = "밝은 칸: 보이는 곳 · 어두운 칸: 기억 · 빈 칸: 미탐색";
    mapBox.append(this.place, this.canvas, legend);

    const finder = document.createElement("div");
    finder.className = "box finder";
    this.search.id = "map-search";
    this.search.type = "search";
    this.search.placeholder = "본 적 있는 곳에서 찾기";
    this.search.setAttribute("aria-label", "지도 검색");
    this.search.addEventListener("input", () => this.drawResults());
    this.results.className = "route-list";
    finder.append(this.search, this.results);

    const side = document.createElement("div");
    side.className = "map-side";
    side.append(this.panel, finder);
    this.root.append(mapBox, side);
  }

  private cellAt(e: MouseEvent): [number, number] {
    const box = this.canvas.getBoundingClientRect();
    return [
      this.originX + Math.floor((e.clientX - box.left) / CELL_W),
      this.originY + Math.floor((e.clientY - box.top) / CELL_H),
    ];
  }

  private describe(x: number, y: number): string {
    const s = this.game();
    if (x === BASE.x && y === BASE.y) return "기지";
    if (!isRevealed(s, x, y)) return "";
    const site = s.sites.find((v) => v.x === x && v.y === y);
    if (site) return siteName(s, site);
    const [, cls, height] = terrain(x, y, s.seed);
    return cls === "t-hill" ? `산 고도 ${height}` : cls === "t-water" ? "강" : "";
  }

  draw(): void {
    const s = this.game();
    this.drawVein(s);
    // The map only changes when the player moves or a vein empties.
    const emptied = s.sites.reduce((n, site) => n + (site.left > 0 ? 0 : 1), 0);
    const key = `${s.player.x},${s.player.y},${s.path.length},${s.sites.length},${emptied},${s.season}`;
    if (key === this.drawnMap) return;
    this.drawnMap = key;
    this.originX = s.player.x - Math.floor(VIEW_W / 2);
    this.originY = s.player.y - Math.floor(VIEW_H / 2);
    this.paint(s);
    // The base may be off screen, so always say how far away it is.
    const steps = Math.max(Math.abs(s.player.x - BASE.x), Math.abs(s.player.y - BASE.y));
    const where = steps ? `H ${steps}칸 ${this.direction(s)}` : "H";
    if (this.place.textContent !== where) this.place.textContent = where;
    this.drawResults();
  }

  private paint(s: GameState): void {
    const g = this.ctx;
    g.clearRect(0, 0, VIEW_W * CELL_W, VIEW_H * CELL_H);
    g.font = "15px 'JetBrains Mono', Consolas, monospace";
    const sites = new Map(s.sites.map((site) => [`${site.x},${site.y}`, site]));
    const path = new Set(s.path.map((p) => `${p.x},${p.y}`));
    for (let vy = 0; vy < VIEW_H; vy += 1) {
      for (let vx = 0; vx < VIEW_W; vx += 1) {
        const x = this.originX + vx;
        const y = this.originY + vy;
        if (!isRevealed(s, x, y)) continue;
        const seen = isVisible(s, x, y);
        g.fillStyle = seen ? COLOR.seenBg : COLOR.memoryBg;
        g.fillRect(vx * CELL_W, vy * CELL_H, CELL_W, CELL_H);
        const key = `${x},${y}`;
        const site = sites.get(key);
        let glyph: string;
        let color: string;
        if (s.player.x === x && s.player.y === y) [glyph, color] = ["@", COLOR.player];
        else if (x === BASE.x && y === BASE.y) [glyph, color] = ["H", COLOR.base];
        else if (site) {
          glyph = site.ore === WATER ? "W" : site.left <= 0 ? "x" : canHarvest(s, site) ? "*" : "'";
          color = itemColor(site.ore);
        } else if (path.has(key)) [glyph, color] = ["-", COLOR.path];
        else {
          const [ch, cls, height] = terrain(x, y, s.seed);
          glyph = ch;
          color = COLOR[cls === "t-hill" ? `t-hill${height}` : cls];
        }
        if (glyph === " ") continue;
        g.globalAlpha = seen ? 1 : 0.45;
        g.fillStyle = color;
        g.fillText(glyph, vx * CELL_W + CELL_W / 2, vy * CELL_H + CELL_H / 2);
        g.globalAlpha = 1;
      }
    }
  }

  /** Finds things the player has seen: nothing in unexplored ground is listed. */
  private drawResults(): void {
    const s = this.game();
    const query = this.search.value.trim().toLowerCase();
    const key = `${query}|${s.player.x},${s.player.y}|${s.sites.length}`;
    if (key === this.drawnResults) return;
    this.drawnResults = key;
    if (!query) {
      this.results.replaceChildren();
      return;
    }
    const steps = (v: Site) => Math.max(Math.abs(v.x - s.player.x), Math.abs(v.y - s.player.y));
    const found = s.sites
      .filter((v) => isRevealed(s, v.x, v.y))
      .filter((v) => [itemName(v.ore), itemCode(v.ore), siteName(s, v)].some((t) => t.toLowerCase().includes(query)))
      .sort((a, b) => steps(a) - steps(b))
      .slice(0, MAX_RESULTS);
    this.results.replaceChildren(...found.map((site) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "route-row";
      const code = document.createElement("span");
      code.style.color = itemColor(site.ore);
      code.textContent = itemCode(site.ore);
      const name = document.createElement("span");
      name.textContent = siteName(s, site);
      const where = document.createElement("span");
      where.className = "push card-note";
      where.textContent = `${isVisible(s, site.x, site.y) ? "보임" : "기억"} · ${steps(site)}칸`;
      b.append(code, name, where);
      b.addEventListener("click", () => {
        walkTo(this.game(), site);
        this.changed();
      });
      return b;
    }));
    if (!found.length) this.results.textContent = "본 적 있는 곳에 없습니다";
  }

  /** Which way the base lies from the player. */
  private direction(s: GameState): string {
    const dx = BASE.x - s.player.x;
    const dy = BASE.y - s.player.y;
    const ns = Math.abs(dy) * 2 > Math.abs(dx) ? (dy < 0 ? "북" : "남") : "";
    const ew = Math.abs(dx) * 2 > Math.abs(dy) ? (dx < 0 ? "서" : "동") : "";
    return ns + ew;
  }

  private drawVein(s: GameState): void {
    const site = siteHere(s);
    this.panel.hidden = !site;
    if (!site) return;
    const open = canHarvest(s, site);
    this.vein.disabled = site.left <= 0 || !open;
    this.vein.setAttribute("aria-label", `${itemName(site.ore)} 캐기`);
    if (this.hit > 0) this.hit -= 1;
    const key = `${site.id}|${site.left}|${this.hit > 0}|${open}`;
    if (key === this.drawnVein) return;
    this.drawnVein = key;

    if (!this.veins.has(site.id)) this.veins.set(site.id, buildVein(site));
    const vein = this.veins.get(site.id)!;
    const shown = Math.ceil((site.left / site.total) * vein.cells.length);
    const ore = new Map(vein.cells.slice(0, shown).map((c) => [`${c.x},${c.y}`, c]));
    const flash = this.hit > 0 ? vein.cells[Math.min(shown, vein.cells.length - 1)] : null;
    const color = itemColor(site.ore);
    let html = "";
    vein.rock.forEach((row, y) => {
      row.forEach((ch, x) => {
        const cell = ore.get(`${x},${y}`);
        if (flash && flash.x === x && flash.y === y) html += '<span class="hit">*</span>';
        else if (cell) html += `<span style="color:${color}">${cell.glyph}</span>`;
        else html += `<span class="rock">${ch}</span>`;
      });
      html += "\n";
    });
    this.art.innerHTML = html;
    const fill = Math.round((site.left / site.total) * 14);
    this.head.innerHTML = `<span style="color:${color}">${itemCode(site.ore)}</span><span>${siteName(s, site)}</span>` +
      `<span class="push">[${"#".repeat(fill).padEnd(14, ".")}] ${site.left}/${site.total}</span>` +
      (site.ore === WATER ? `<span class="short">기지에서 강가 펌프로 끌어옵니다</span>`
        : open ? "" : `<span class="short">${(forageSeasons(site.ore) ?? []).map((n) => SEASON_NAMES[n]).join(", ")}에만 수확</span>`);
  }
}
