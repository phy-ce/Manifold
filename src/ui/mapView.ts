// World map and vein panel, shown whenever the player isn't working at the base.
// The map is one canvas: 1,200 DOM cells were slow to update while walking.
import { tr } from "../i18n";
import { CAVE, CAVES, WATER, categoryNames, forageSeasons, itemCode, itemColor, itemName, richnessName } from "../content";
import { GameState, REVEAL, SEASON_NAMES, clearLine, mobVisible, atCaveExit, caveDoorHere, caveSeenAt, currentCave, enterCave, leaveCave, onThisMap, setSafeWalk, canHarvest, isRevealed, isVisible, mine, siteHere, startProbe, walkTo } from "../engine/game";
import { BASE, CELL_ASPECT, Point, ROCK, Site, caveCell, hash, orderSites, terrain } from "../engine/world";

/** Size of the window onto the endless map, which stays centred on the player. */
const VIEW_W = 60;
const VIEW_H = 20;
const CELL_W = 9;
const CELL_H = 18;
const MAX_RESULTS = 10;

const COLOR: Record<string, string> = {
  "t-plain": "#3c4955", "t-hill1": "#7c8b9b", "t-hill2": "#a9b6c2", "t-hill3": "#e6ebef", "t-water": "#4d8fc4",
  player: "#8fd16f", base: "#dfe5ea", path: "#ffb238", remembered: "#3a4552", memoryBg: "#141a22", seenBg: "#1d2631",
  cave: "#c9a27a", rock: "#2b3541", probe: "#ffb238", wolf: "#ff5f56", spitter: "#c678dd", shot: "#ff8c5a",
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

const siteName = (s: GameState, site: Site): string =>
  site.ore === CAVE ? tr("자연 동굴") : site.ore === WATER ?`${tr("강가")} ${site.code ?? ""}`.trim() : itemName(site.ore) + (site.rich ? ` ${richnessName(site.rich)}` : "") + (site.left <= 0 ? tr(" (고갈됨)") : canHarvest(s, site) ? "" : tr(" (수확 불가)"));

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
  private readonly hideButton = document.createElement("button");
  private hideEmpty = false;
  private readonly place = document.createElement("div");
  /** Going in and out of a cave, and prospecting inside one. */
  private readonly caveBar = document.createElement("div");
  private readonly enter = document.createElement("button");
  private readonly leave = document.createElement("button");
  private readonly probe = document.createElement("button");
  /** Veins found by the last prospecting, blinking until `until`; and which were already known. */
  private flash = { ids: new Set<number>(), until: 0 };
  private known = { cave: null as number | null, ids: new Set<number>() };
  private readonly safe = document.createElement("button");
  private readonly straight = document.createElement("button");
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
    this.canvas.setAttribute("aria-label", tr("지도, 칸을 클릭해 이동"));
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
    const walkMode = document.createElement("div");
    walkMode.className = "modes";
    const mode = (b: HTMLButtonElement, label: string, tip: string, on: boolean) => {
      b.type = "button";
      b.className = "tech";
      b.textContent = label;
      b.dataset.tip = tip;
      b.addEventListener("click", () => {
        setSafeWalk(this.game(), on);
        this.changed();
      });
      walkMode.append(b);
    };
    mode(this.safe, tr("위험 피하기"), tr("아는 위험 지역을 돌아갑니다 (T)"), true);
    mode(this.straight, tr("직진"), tr("위험을 무시하고 곧장 갑니다 (T)"), false);
    this.caveBar.className = "modes";
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
    action(this.probe, tr("탐사"), startProbe, tr("멈춰서 주변 바위를 두드려 광맥을 찾습니다 (P)"));
    mapBox.append(this.place, walkMode, this.caveBar, this.canvas);

    const finder = document.createElement("div");
    finder.className = "box finder";
    this.search.id = "map-search";
    this.search.type = "search";
    this.search.placeholder = tr("본 적 있는 곳에서 찾기");
    this.search.setAttribute("aria-label", tr("지도 검색"));
    this.search.addEventListener("input", () => this.drawResults());
    this.results.className = "route-list";
    this.hideButton.type = "button";
    this.hideButton.className = "tech";
    this.hideButton.textContent = tr("고갈 숨기기");
    this.hideButton.addEventListener("click", () => {
      this.hideEmpty = !this.hideEmpty;
      this.hideButton.classList.toggle("selected", this.hideEmpty);
      this.drawResults();
    });
    const tools = document.createElement("div");
    tools.className = "bar-row";
    tools.append(this.hideButton);
    finder.append(this.search, tools, this.results);

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
    const cave = currentCave(s);
    if (cave) {
      if (!caveSeenAt(s, x, y)) return "";
      const mob = s.mobs.find((m) => m.x === x && m.y === y && mobVisible(s, m));
      if (mob) return tr(mob.kind === "melee" ? CAVES.creatures.melee.name : CAVES.creatures.ranged.name);
      if (x === cave.map.entry.x && y === cave.map.entry.y) return tr("출구");
      const vein = s.sites.find((v) => v.x === x && v.y === y && onThisMap(s, v));
      if (vein) return siteName(s, vein);
      return caveCell(cave.map, x, y) === ROCK ? tr("암반") : "";
    }
    if (x === BASE.x && y === BASE.y) return tr("기지");
    if (!isRevealed(s, x, y)) return "";
    const site = s.sites.find((v) => v.x === x && v.y === y && onThisMap(s, v));
    if (site) return siteName(s, site);
    const [, cls, height] = terrain(x, y, s.seed);
    return cls === "t-hill" ? `${tr("산 고도")} ${height}` : cls === "t-water" ? tr("강") : "";
  }

  draw(): void {
    const s = this.game();
    this.safe.classList.toggle("selected", s.safeWalk);
    this.straight.classList.toggle("selected", !s.safeWalk);
    this.drawVein(s);
    const cave = currentCave(s);
    const probing = s.probe === null ? -1 : Math.min(1, (s.time - s.probe) / CAVES.probeMs);
    this.enter.hidden = !caveDoorHere(s);
    this.leave.hidden = !atCaveExit(s);
    this.probe.hidden = !cave;
    this.probe.classList.toggle("selected", probing >= 0);
    const probeLabel = probing >= 0 ? `${tr("탐사 중")} ${"▮".repeat(Math.round(probing * 4)).padEnd(4, "▯")}` : tr("탐사");
    if (this.probe.textContent !== probeLabel) this.probe.textContent = probeLabel;
    this.caveBar.hidden = this.enter.hidden && this.leave.hidden && this.probe.hidden;
    // Newly found veins blink for a moment.
    const found = new Set(s.sites.filter((site) => site.cave !== undefined && site.cave === s.cave && site.found).map((site) => site.id));
    if (this.known.cave === s.cave) {
      const fresh = [...found].filter((id) => !this.known.ids.has(id));
      if (fresh.length) this.flash = { ids: new Set(fresh), until: performance.now() + 900 };
    }
    this.known = { cave: s.cave, ids: found };
    // On the surface the map only changes when the player moves or a vein empties; underground creatures move every step.
    const emptied = s.sites.reduce((n, site) => n + (site.left > 0 ? 0 : 1) + (site.found ? 1000 : 0), 0);
    const live = cave ? `${s.time},${Math.floor(performance.now() / 150)}` : "";
    const key = `${s.cave},${s.player.x},${s.player.y},${s.path.length},${s.sites.length},${emptied},${s.season},${live}`;
    if (key === this.drawnMap) return;
    this.drawnMap = key;
    this.originX = s.player.x - Math.floor(VIEW_W / 2);
    this.originY = s.player.y - Math.floor(VIEW_H / 2);
    if (cave) this.paintCave(s, probing);
    else this.paint(s);
    // The way out may be off screen, so always say how far away it is.
    const home: Point = cave ? cave.map.entry : BASE;
    const steps = Math.max(Math.abs(s.player.x - home.x), Math.abs(s.player.y - home.y));
    const mark = cave ? `${tr("자연 동굴")} · Layer ${CAVES.layer} · <` : "H";
    const where = steps ? `${mark} ${steps}${tr("칸")} ${this.direction(s, home)}` : mark;
    if (this.place.textContent !== where) this.place.textContent = where;
    this.drawResults();
  }

  private paint(s: GameState): void {
    const g = this.ctx;
    g.clearRect(0, 0, VIEW_W * CELL_W, VIEW_H * CELL_H);
    g.font = "15px 'JetBrains Mono', Consolas, monospace";
    const sites = new Map(s.sites.filter((site) => onThisMap(s, site)).map((site) => [`${site.x},${site.y}`, site]));
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
        else if (site?.ore === CAVE) [glyph, color] = [">", COLOR.cave];
        else if (site) {
          glyph = site.ore === WATER ? "W" : site.left <= 0 ? "x" : !canHarvest(s, site) ? "'" : site.rich === "rich" ? "#" : site.rich === "scarce" ? "+" : "*";
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

  /**
   * A cave, in the same glyphs as the surface: rock is a solid block, creature habitat is w,
   * the way out is <, and veins show only once prospecting has found them.
   */
  private paintCave(s: GameState, probing: number): void {
    const cave = currentCave(s)!;
    const g = this.ctx;
    g.clearRect(0, 0, VIEW_W * CELL_W, VIEW_H * CELL_H);
    g.font = "15px 'JetBrains Mono', Consolas, monospace";
    const sites = new Map(s.sites.filter((site) => onThisMap(s, site)).map((site) => [`${site.x},${site.y}`, site]));
    const path = new Set(s.path.map((p) => `${p.x},${p.y}`));
    for (let vy = 0; vy < VIEW_H; vy += 1) {
      for (let vx = 0; vx < VIEW_W; vx += 1) {
        const x = this.originX + vx;
        const y = this.originY + vy;
        if (!caveSeenAt(s, x, y)) continue;
        const seen = Math.hypot(x - s.player.x, (y - s.player.y) / CELL_ASPECT) <= REVEAL;
        const cell = caveCell(cave.map, x, y);
        g.globalAlpha = seen ? 1 : 0.5;
        g.fillStyle = cell === ROCK ? COLOR.rock : seen ? COLOR.seenBg : COLOR.memoryBg;
        g.fillRect(vx * CELL_W, vy * CELL_H, CELL_W, CELL_H);
        const site = sites.get(`${x},${y}`);
        let glyph = "";
        let color = COLOR["t-plain"];
        if (s.player.x === x && s.player.y === y) [glyph, color] = ["@", COLOR.player];
        else if (x === cave.map.entry.x && y === cave.map.entry.y) [glyph, color] = ["<", COLOR.base];
        else if (site) [glyph, color] = [site.left <= 0 ? "x" : site.rich === "rich" ? "#" : site.rich === "scarce" ? "+" : "*", itemColor(site.ore)];
        else if (path.has(`${x},${y}`)) [glyph, color] = ["-", COLOR.path];
        else if (cell !== ROCK) glyph = ".";
        if (site && this.flash.ids.has(site.id) && performance.now() < this.flash.until) {
          // A vein prospecting just found blinks for a moment.
          const on = Math.floor(performance.now() / 150) % 2 === 0;
          g.fillStyle = on ? COLOR.probe : COLOR.seenBg;
          g.fillRect(vx * CELL_W, vy * CELL_H, CELL_W, CELL_H);
          if (on) color = "#10151c";
        }
        if (glyph) {
          g.fillStyle = color;
          g.fillText(glyph, vx * CELL_W + CELL_W / 2, vy * CELL_H + CELL_H / 2);
        }
        g.globalAlpha = 1;
      }
    }
    const put = (x: number, y: number, glyph: string, color: string, alpha = 1) => {
      const vx = x - this.originX;
      const vy = y - this.originY;
      if (vx < 0 || vy < 0 || vx >= VIEW_W || vy >= VIEW_H) return;
      g.globalAlpha = alpha;
      g.fillStyle = COLOR.memoryBg;
      g.fillRect(vx * CELL_W, vy * CELL_H, CELL_W, CELL_H);
      g.fillStyle = color;
      g.fillText(glyph, vx * CELL_W + CELL_W / 2, vy * CELL_H + CELL_H / 2);
      g.globalAlpha = 1;
    };
    // Spines in flight, drawn as the stroke they travel along.
    for (const shot of s.shots) {
      const at = { x: Math.round(shot.x), y: Math.round(shot.y) };
      if (Math.max(Math.abs(at.x - s.player.x), Math.abs(at.y - s.player.y)) > CAVES.creatures.sight || !clearLine(cave.map, at, s.player)) continue;
      put(at.x, at.y, strokeGlyph(shot.vx, shot.vy, false), COLOR.shot);
    }
    // Creatures show when near enough to see or hear, with open cave between.
    for (const mob of s.mobs) {
      if (!mobVisible(s, mob)) continue;
      const lit = Math.hypot(mob.x - s.player.x, (mob.y - s.player.y) / CELL_ASPECT) <= REVEAL;
      put(mob.x, mob.y, mob.kind === "melee" ? "w" : "s", mob.kind === "melee" ? COLOR.wolf : COLOR.spitter, lit ? 1 : 0.65);
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
    const key = `${query}|${s.player.x},${s.player.y}|${s.sites.length}|${emptied}|${this.hideEmpty}`;
    if (key === this.drawnResults) return;
    this.drawnResults = key;
    if (!query) {
      this.results.replaceChildren();
      return;
    }
    const steps = (v: Site) => Math.max(Math.abs(v.x - s.player.x), Math.abs(v.y - s.player.y));
    const matching = s.sites
      .filter((v) => onThisMap(s, v) && (s.cave !== null || isRevealed(s, v.x, v.y)))
      // By name, code or place name, or by category: "점토" finds every clay vein, "연료" every coal.
      .filter((v) => [itemName(v.ore), itemCode(v.ore), siteName(s, v), ...categoryNames(v.ore)].some((t) => t.toLowerCase().includes(query)));
    const found = orderSites(matching, steps, this.hideEmpty).slice(0, MAX_RESULTS);
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
      const visible = s.cave !== null ? Math.hypot(site.x - s.player.x, (site.y - s.player.y) / CELL_ASPECT) <= REVEAL : isVisible(s, site.x, site.y);
      where.textContent = `${visible ? tr("보임") : tr("기억")} · ${steps(site)}${tr("칸")}`;
      b.append(code, name, where);
      b.addEventListener("click", () => {
        walkTo(this.game(), site);
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
    this.panel.hidden = !site;
    if (!site) return;
    const open = canHarvest(s, site);
    this.vein.disabled = site.left <= 0 || !open;
    this.vein.setAttribute("aria-label", `${itemName(site.ore)} ${tr("캐기")}`);
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
      (site.ore === WATER ? `<span class="short">${tr("기지에서 강가 펌프로 선을 이어 끌어옵니다")}</span>`
        : open ? "" : `<span class="short">${(forageSeasons(site.ore) ?? []).map((n) => SEASON_NAMES[n]).join(", ")}${tr("에만 수확")}</span>`);
  }
}
