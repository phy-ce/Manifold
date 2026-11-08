// Deterministic world generation. The map has no edges: chunks are rolled from the
// seed and their coordinates the first time they come into view.
import { CAVE, CAVES, FAMILY_WEIGHT, FORAGE, FORAGE_CHANCE, FORAGE_SIZE, LAYERS, RICHNESS, SURFACE_ORES, familyOf } from "../content";

export const CHUNK = 16;
export const BASE = { x: 0, y: 0 };

/** Map cells are taller than wide, so vertical distances count for more. */
export const CELL_ASPECT = 0.6;

export interface Point {
  x: number;
  y: number;
}

export interface Site extends Point {
  id: number;
  ore: string;
  total: number;
  left: number;
  seed: number;
  /** The vein's grade. Food and riverbanks have none. */
  rich?: string;
  /** Three letters and digits, for a riverbank once it is found. */
  code?: string;
  /** The cave this site lies in, by its entrance's id. Surface sites have none. */
  cave?: number;
  /** Cave veins stay hidden until prospecting finds them. */
  found?: boolean;
}

export function rngFrom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const hash = (x: number, y: number, seed: number): number =>
  rngFrom(Math.imul(x + 11, 73856093) ^ Math.imul(y + 7, 19349663) ^ Math.imul(seed + 3, 83492791))();

export const chunkOf = (n: number): number => Math.floor(n / CHUNK);
export const chunkKey = (x: number, y: number): string => `${chunkOf(x)},${chunkOf(y)}`;
export const cellInChunk = (x: number, y: number): number =>
  (((y % CHUNK) + CHUNK) % CHUNK) * CHUNK + (((x % CHUNK) + CHUNK) % CHUNK);

const SITES_PER_ORE = 3;
const NEAR = [7, 12];
const FAR = [13, 42];
/** Chunk veins stay out of the starter area, which is laid out on its own. */
const STARTER_RADIUS = 20;

/** A vein's grade and size are pure luck: distance from the base plays no part. Each layer sets its own odds. */
export function rollVein(rng: () => number, ore: string, layer = 0): { total: number; rich?: string } {
  if (FORAGE.includes(ore)) {
    const [low, high] = FORAGE_SIZE;
    return { total: Math.round(low + rng() * (high - low)) };
  }
  let roll = rng();
  const odds: Record<string, number> = LAYERS[layer].richness;
  const grade = RICHNESS.find((r) => (roll -= odds[r.id]) < 0) ?? RICHNESS[RICHNESS.length - 1];
  const [low, high] = grade.size;
  return { total: Math.round(low + rng() * (high - low)), rich: grade.id };
}

const RIVER_SPACING = 70;

/** The glyph, style and height of open ground. Shared by the map and terrain hazards. */
export function terrain(x: number, y: number, seed: number): [string, string, number] {
  const bend = Math.round(Math.sin(y * 0.6 + seed) * 3);
  const river = (((x + bend + seed) % RIVER_SPACING) + RIVER_SPACING) % RIVER_SPACING;
  if (river < 2) return ["~", "t-water", 0];
  const r = hash(x, y, seed + 20);
  const hills = Math.sin(x * 0.5 + seed) + Math.cos(y * 0.9 + x * 0.2);
  if (hills > 1.15 && r > 0.25) {
    const height = hills > 1.75 ? 3 : hills > 1.45 ? 2 : 1;
    return [" ^AM"[height], "t-hill", height];
  }
  return [r < 0.62 ? " " : r < 0.85 ? "." : ",", "t-plain", 0];
}

/** Guaranteed veins around the base, so every seed can finish the first goal. */
export function generateSites(seed: number): Site[] {
  const rng = rngFrom(seed * 31 + 7);
  const sites: Site[] = [];
  const taken = new Set([`${BASE.x},${BASE.y}`]);
  for (const ore of [...SURFACE_ORES, ...FORAGE]) {
    const copies = FORAGE.includes(ore) ? 1 : SITES_PER_ORE;
    for (let i = 0; i < copies; i += 1) {
      const [min, max] = i === 0 ? NEAR : FAR;
      let x = 0;
      let y = 0;
      do {
        const dist = min + rng() * (max - min);
        const angle = rng() * Math.PI * 2;
        x = Math.round(BASE.x + Math.cos(angle) * dist) + 0; // + 0 turns -0 into 0, which is what a save gives back
        y = Math.round(BASE.y + Math.sin(angle) * dist * CELL_ASPECT) + 0;
      } while (taken.has(`${x},${y}`));
      taken.add(`${x},${y}`);
      const vein = rollVein(rng, ore);
      sites.push({ id: sites.length, ore, x, y, ...vein, left: vein.total, seed: seed + sites.length * 5 });
    }
  }
  return sites;
}

/** Veins of an ore that opens later, placed around the base like the first ones. */
export function laterVeins(seed: number, ore: string): Omit<Site, "id">[] {
  const rng = rngFrom(Math.imul(seed + 5, 2654435761) ^ Math.imul(ore.charCodeAt(0), 40503));
  return Array.from({ length: SITES_PER_ORE }, (_, i) => {
    const [min, max] = i === 0 ? NEAR : FAR;
    const dist = min + rng() * (max - min);
    const angle = rng() * Math.PI * 2;
    const vein = rollVein(rng, ore);
    return {
      ore,
      x: Math.round(BASE.x + Math.cos(angle) * dist) + 0,
      y: Math.round(BASE.y + Math.sin(angle) * dist * CELL_ASPECT) + 0,
      ...vein,
      left: vein.total,
      seed: seed + i * 7,
    };
  });
}

/** Picks a family by its weight, then one of the pool's ores in that family. */
export function pickOre(rng: () => number, pool: string[]): string {
  const families = [...new Set(pool.map((id) => familyOf(id)!))];
  let roll = rng() * families.reduce((sum, f) => sum + (FAMILY_WEIGHT[f] ?? 10), 0);
  const family = families.find((f) => (roll -= FAMILY_WEIGHT[f] ?? 10) < 0) ?? families[families.length - 1];
  const ores = pool.filter((id) => familyOf(id) === family);
  return ores[Math.floor(rng() * ores.length)];
}

/** Veins of one chunk. The same seed and coordinates always give the same veins. */
export function chunkSites(seed: number, cx: number, cy: number, later: string[] = []): Omit<Site, "id">[] {
  const rng = rngFrom(Math.imul(cx + 991, 73856093) ^ Math.imul(cy + 577, 19349663) ^ Math.imul(seed + 1, 83492791));
  const count = rng() < 0.5 ? 1 : rng() < 0.4 ? 2 : 0;
  const sites: Omit<Site, "id">[] = [];
  const spot = () => [cx * CHUNK + Math.floor(rng() * CHUNK), cy * CHUNK + Math.floor(rng() * CHUNK)];
  const far = (x: number, y: number) => Math.hypot(x - BASE.x, (y - BASE.y) / CELL_ASPECT) >= STARTER_RADIUS;
  for (let i = 0; i < count; i += 1) {
    const [x, y] = spot();
    const ore = pickOre(rng, [...SURFACE_ORES, ...later]);
    const vein = rollVein(rng, ore);
    if (far(x, y)) sites.push({ ore, x, y, ...vein, left: vein.total, seed: seed + Math.abs(cx * 131 + cy * 17 + i) });
  }
  // Food is rolled on its own, so it never crowds out ore.
  if (rng() < FORAGE_CHANCE) {
    const [x, y] = spot();
    const ore = FORAGE[Math.floor(rng() * FORAGE.length)];
    const vein = rollVein(rng, ore);
    if (far(x, y)) sites.push({ ore, x, y, ...vein, left: vein.total, seed: seed + Math.abs(cx * 131 + cy * 17 + 7) });
  }
  if (rng() < CAVES.chunkChance) {
    const [x, y] = spot();
    if (far(x, y) && terrain(x, y, seed)[1] !== "t-water") sites.push({ ore: CAVE, x, y, total: 0, left: 0, seed: seed + Math.abs(cx * 977 + cy * 31) });
  }
  return sites;
}

/** The cave entrance every world has near the base, on dry ground. */
export function nearCave(seed: number): Point {
  const rng = rngFrom(Math.imul(seed + 13, 2246822519));
  const [min, max] = CAVES.near;
  for (;;) {
    const dist = min + rng() * (max - min);
    const angle = rng() * Math.PI * 2;
    const x = Math.round(BASE.x + Math.cos(angle) * dist) + 0;
    const y = Math.round(BASE.y + Math.sin(angle) * dist * CELL_ASPECT) + 0;
    if (terrain(x, y, seed)[1] !== "t-water") return { x, y };
  }
}

// ---- Caves

/** What a cave cell is. Habitat is open floor where cave creatures live, so it hurts to cross. */
export const FLOOR = 0;
export const ROCK = 1;
export const HABITAT = 2;
export interface CaveMap {
  width: number;
  height: number;
  cells: Uint8Array;
  /** Where the player comes in, and goes out. */
  entry: Point;
}
const caveCache = new Map<number, CaveMap>();

/** A cave's layout. It is rolled from the entrance's seed, so it never needs saving. */
export function caveMap(caveSeed: number): CaveMap {
  const cached = caveCache.get(caveSeed);
  if (cached) return cached;
  const { width, height } = CAVES;
  const rng = rngFrom(Math.imul(caveSeed + 17, 2654435761));
  const at = (x: number, y: number) => y * width + x;
  let cells = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const edge = x < 1 || y < 1 || x > width - 2 || y > height - 2;
      cells[at(x, y)] = edge || rng() < 0.45 ? ROCK : FLOOR;
    }
  }
  // Smooth the noise into caverns: a cell turns to rock with five or more rock around it.
  for (let pass = 0; pass < 5; pass += 1) {
    const next = cells.slice();
    for (let y = 1; y < height - 1; y += 1) {
      for (let x = 1; x < width - 1; x += 1) {
        let rock = 0;
        for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) rock += cells[at(x + dx, y + dy)];
        next[at(x, y)] = rock >= 5 ? ROCK : FLOOR;
      }
    }
    cells = next;
  }
  // Keep only the largest open space, so every floor cell can be reached.
  const region = new Int32Array(width * height).fill(-1);
  let best = 0;
  let bestSize = 0;
  for (let i = 0, id = 0; i < cells.length; i += 1) {
    if (cells[i] !== FLOOR || region[i] >= 0) continue;
    const stack = [i];
    region[i] = id;
    let size = 0;
    while (stack.length) {
      const c = stack.pop()!;
      size += 1;
      const x = c % width;
      const y = Math.floor(c / width);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const n = at(x + dx, y + dy);
        if (cells[n] === FLOOR && region[n] < 0) {
          region[n] = id;
          stack.push(n);
        }
      }
    }
    if (size > bestSize) [best, bestSize] = [id, size];
    id += 1;
  }
  for (let i = 0; i < cells.length; i += 1) if (cells[i] === FLOOR && region[i] !== best) cells[i] = ROCK;
  // The entrance: the open cell nearest the top middle.
  let entry = { x: 0, y: 0 };
  let near = Infinity;
  for (let i = 0; i < cells.length; i += 1) {
    if (cells[i] !== FLOOR) continue;
    const x = i % width;
    const y = Math.floor(i / width);
    const d = Math.hypot(x - width / 2, y * 2);
    if (d < near) [near, entry] = [d, { x, y }];
  }
  // Creature habitats: small patches of floor, well away from the entrance.
  const floor = [...cells.keys()].filter((i) => cells[i] === FLOOR && Math.hypot((i % width) - entry.x, Math.floor(i / width) - entry.y) > 12);
  const [fewest, most] = CAVES.habitats;
  const patches = fewest + Math.floor(rng() * (most - fewest + 1));
  for (let p = 0; p < patches && floor.length; p += 1) {
    const centre = floor[Math.floor(rng() * floor.length)];
    const cx = centre % width;
    const cy = Math.floor(centre / width);
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -2; dx <= 2; dx += 1) {
        const n = at(cx + dx, cy + dy);
        if (cells[n] === FLOOR && rng() < 0.75) cells[n] = HABITAT;
      }
    }
  }
  const map = { width, height, cells, entry };
  caveCache.set(caveSeed, map);
  return map;
}

export const caveCell = (map: CaveMap, x: number, y: number): number =>
  x < 0 || y < 0 || x >= map.width || y >= map.height ? ROCK : map.cells[y * map.width + x];

/** A cave's veins, on open floor away from the entrance and out of the habitats. */
export function caveSites(caveSeed: number, cave: number, pool: string[]): Omit<Site, "id">[] {
  const map = caveMap(caveSeed);
  const rng = rngFrom(Math.imul(caveSeed + 29, 40503) ^ 0x5bd1e995);
  const [fewest, most] = CAVES.sites;
  const count = fewest + Math.floor(rng() * (most - fewest + 1));
  const spots = [...map.cells.keys()].filter((i) => {
    const x = i % map.width;
    const y = Math.floor(i / map.width);
    return map.cells[i] === FLOOR && Math.hypot(x - map.entry.x, y - map.entry.y) >= 6;
  });
  const sites: Omit<Site, "id">[] = [];
  for (let i = 0; i < count && spots.length && pool.length; i += 1) {
    const [cell] = spots.splice(Math.floor(rng() * spots.length), 1);
    const ore = pickOre(rng, pool);
    const vein = rollVein(rng, ore, CAVES.layer);
    sites.push({ ore, x: cell % map.width, y: Math.floor(cell / map.width), ...vein, left: vein.total, seed: caveSeed + i * 11, cave, found: false });
  }
  return sites;
}

/** Dry ground beside the nearest river on each side of the base. */
export function riverBanks(seed: number): Point[] {
  return [1, -1].map((way) => {
    let x = BASE.x;
    while (terrain(x + way, BASE.y, seed)[1] !== "t-water") x += way;
    return { x, y: BASE.y };
  });
}

/** Search order: nearest first, with empty sites last, or left out when hidden. */
export function orderSites(sites: Site[], steps: (site: Site) => number, hideEmpty: boolean): Site[] {
  const empty = (site: Site) => (site.left <= 0 ? 1 : 0);
  return sites.filter((site) => !hideEmpty || !empty(site)).sort((a, b) => empty(a) - empty(b) || steps(a) - steps(b));
}

/** How many extra steps one point of damage is worth when picking a safe route. */
const DAMAGE_WEIGHT = 4;
/** How far a safe route may stray from the straight box between its ends. */
const SAFE_MARGIN = 30;
/** Give up and walk straight past this many cells, so a far click can't stall the game. */
const SAFE_SEARCH_LIMIT = 40000;

/**
 * The route that takes the least damage, by A*. Hazards cost extra rather than blocking,
 * because a river runs forever and sometimes has to be crossed.
 */
export function safePath(a: Point, b: Point, damageAt: (x: number, y: number) => number, blocked?: (x: number, y: number) => boolean): Point[] {
  if (blocked?.(b.x, b.y)) return [];
  const left = Math.min(a.x, b.x) - SAFE_MARGIN;
  const right = Math.max(a.x, b.x) + SAFE_MARGIN;
  const top = Math.min(a.y, b.y) - SAFE_MARGIN;
  const bottom = Math.max(a.y, b.y) + SAFE_MARGIN;
  const width = right - left + 1;
  const key = (x: number, y: number) => (y - top) * width + (x - left);
  // A touch over 1 prefers cells nearer the goal, so open ground isn't searched in full.
  const guess = (x: number, y: number) => Math.max(Math.abs(x - b.x), Math.abs(y - b.y)) * 1.001;
  const cost = new Map<number, number>([[key(a.x, a.y), 0]]);
  const came = new Map<number, number>();
  const heap: [number, number, number][] = [[guess(a.x, a.y), a.x, a.y]];
  const push = (item: [number, number, number]) => {
    let i = heap.push(item) - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (heap[parent][0] <= heap[i][0]) break;
      [heap[parent], heap[i]] = [heap[i], heap[parent]];
      i = parent;
    }
  };
  const pop = () => {
    const top0 = heap[0];
    const last = heap.pop()!;
    if (heap.length) {
      heap[0] = last;
      for (let i = 0; ;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let low = i;
        if (l < heap.length && heap[l][0] < heap[low][0]) low = l;
        if (r < heap.length && heap[r][0] < heap[low][0]) low = r;
        if (low === i) break;
        [heap[low], heap[i]] = [heap[i], heap[low]];
        i = low;
      }
    }
    return top0;
  };
  for (let seen = 0; heap.length && seen < SAFE_SEARCH_LIMIT; seen += 1) {
    const [, x, y] = pop();
    if (x === b.x && y === b.y) {
      const path: Point[] = [];
      for (let at = key(x, y); at !== key(a.x, a.y); at = came.get(at)!) {
        path.unshift({ x: left + (at % width), y: top + Math.floor(at / width) });
      }
      return path;
    }
    const here = cost.get(key(x, y))!;
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        const nx = x + dx;
        const ny = y + dy;
        if ((!dx && !dy) || nx < left || nx > right || ny < top || ny > bottom) continue;
        // Walls can't be walked through, nor a corner cut between two of them.
        if (blocked && (blocked(nx, ny) || (dx && dy && (blocked(x + dx, y) || blocked(x, y + dy))))) continue;
        const next = here + 1 + damageAt(nx, ny) * DAMAGE_WEIGHT;
        const id = key(nx, ny);
        if (next >= (cost.get(id) ?? Infinity)) continue;
        cost.set(id, next);
        came.set(id, key(x, y));
        push([next + guess(nx, ny), nx, ny]);
      }
    }
  }
  // Underground there is no walking straight through rock.
  return blocked ? [] : linePath(a, b);
}

export function linePath(a: Point, b: Point): Point[] {
  const steps = Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y));
  const path: Point[] = [];
  for (let i = 1; i <= steps; i += 1) {
    path.push({
      x: Math.round(a.x + ((b.x - a.x) * i) / steps),
      y: Math.round(a.y + ((b.y - a.y) * i) / steps),
    });
  }
  return path;
}
