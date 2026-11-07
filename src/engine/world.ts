// Deterministic world generation. The map has no edges: chunks are rolled from the
// seed and their coordinates the first time they come into view.
import { FORAGE, FORAGE_SIZE, RICHNESS, SURFACE, SURFACE_ORES } from "../content";

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

/** A vein's grade and size are pure luck: distance from the base plays no part. */
function rollVein(rng: () => number, ore: string): { total: number; rich?: string } {
  if (FORAGE.includes(ore)) {
    const [low, high] = FORAGE_SIZE;
    return { total: Math.round(low + rng() * (high - low)) };
  }
  let roll = rng();
  const odds: Record<string, number> = SURFACE.richness;
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

/** Veins of one chunk. The same seed and coordinates always give the same veins. */
export function chunkSites(seed: number, cx: number, cy: number): Omit<Site, "id">[] {
  const rng = rngFrom(Math.imul(cx + 991, 73856093) ^ Math.imul(cy + 577, 19349663) ^ Math.imul(seed + 1, 83492791));
  const count = rng() < 0.5 ? 1 : rng() < 0.4 ? 2 : 0;
  const sites: Omit<Site, "id">[] = [];
  for (let i = 0; i < count; i += 1) {
    const x = cx * CHUNK + Math.floor(rng() * CHUNK);
    const y = cy * CHUNK + Math.floor(rng() * CHUNK);
    const pool = [...SURFACE_ORES, ...FORAGE];
    const ore = pool[Math.floor(rng() * pool.length)];
    const vein = rollVein(rng, ore);
    if (Math.hypot(x - BASE.x, (y - BASE.y) / CELL_ASPECT) < STARTER_RADIUS) continue;
    sites.push({ ore, x, y, ...vein, left: vein.total, seed: seed + Math.abs(cx * 131 + cy * 17 + i) });
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

/** How many extra steps one point of damage is worth when picking a safe route. */
const DAMAGE_WEIGHT = 20;
/** How far a safe route may stray from the straight box between its ends. */
const SAFE_MARGIN = 30;
/** Give up and walk straight past this many cells, so a far click can't stall the game. */
const SAFE_SEARCH_LIMIT = 40000;

/**
 * The route that takes the least damage, by A*. Hazards cost extra rather than blocking,
 * because a river runs forever and sometimes has to be crossed.
 */
export function safePath(a: Point, b: Point, damageAt: (x: number, y: number) => number): Point[] {
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
        const next = here + 1 + damageAt(nx, ny) * DAMAGE_WEIGHT;
        const id = key(nx, ny);
        if (next >= (cost.get(id) ?? Infinity)) continue;
        cost.set(id, next);
        came.set(id, key(x, y));
        push([next + guess(nx, ny), nx, ny]);
      }
    }
  }
  return linePath(a, b);
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
