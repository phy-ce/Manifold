// Deterministic world generation. The map has no edges: chunks are rolled from the
// seed and their coordinates the first time they come into view.
import { BIOMES, BIOME_WORLD, Biome, CAVE, CAVES, FAMILY_WEIGHT, FORAGE, FORAGE_CHANCE, FORAGE_SIZE, LAYERS, RICHNESS, RIVER, SURFACE_ORES, VEINS, WATER, familyOf } from "../content";

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
  /** The layer the site's own x and y lie on: -1 for a vein that lies only underground. Surface sites have none. */
  z?: number;
  /** Whether prospecting has found any cell of it underground that the player can reach. */
  found?: boolean;
  /** The player's own note on this place, shown on the map and found by search. */
  note?: string;
  /**
   * The cells an ore vein runs over, each with its own share; `total` and `left` are their sums. The site's
   * own x and y is one of them the player can stand on. Food, water and veins from older saves have none
   * and count as one cell at x, y: read cells through `cellsOf`.
   */
  cells?: VeinCell[];
}

/** One cell of a vein: where it is and what it still holds. */
export interface VeinCell extends Point {
  left: number;
  /** What the cell held to begin with. Older saves have none: their cells count what is left as the whole. */
  total?: number;
  /** The layer the cell lies on: -1 underground. Surface cells have none. */
  z?: number;
  /** Underground, ore set in the rock rather than lying on the floor. Emptied, it is plain rock again. */
  wall?: boolean;
  /** Underground, rock with no open floor beside it: out of reach until the player can bore into rock. */
  buried?: boolean;
  /** Underground, whether prospecting has found this cell. */
  found?: boolean;
}

/** A site's cells, or the one cell a site without any stands for. Writing to that stand-in changes nothing. */
export const cellsOf = (site: Site): VeinCell[] =>
  site.cells ?? [{ x: site.x, y: site.y, left: site.left, found: site.found, ...(site.z ? { z: site.z } : {}) }];

/** The layer a cell lies on: 0 the surface, -1 the underground. */
export const layerOf = (cell: { z?: number }): number => cell.z ?? 0;

/** The eight cells around a cell, the four straight ones first. */
export const AROUND: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

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

/** Ores that open in a later stage get this many veins laid around the base when they open. */
const SITES_PER_ORE = 3;
const NEAR = [7, 12];
const FAR = [13, 42];
/** Chunk veins keep only the base's own doorstep clear; past it, the map is rolled like anywhere else. */
const STARTER_RADIUS = 8;

/** A vein's grade and size are pure luck: distance from the base plays no part. Each layer sets its own odds. */
export function rollVein(rng: () => number, ore: string, layer = 0, richer = 1): { total: number; rich?: string } {
  if (FORAGE.includes(ore)) {
    const [low, high] = FORAGE_SIZE;
    return { total: Math.round(low + rng() * (high - low)) };
  }
  let roll = rng();
  // A biome that favours rich veins takes the extra chance from the normal grade.
  const base: Record<string, number> = LAYERS[layer].richness;
  const extra = base.rich * (richer - 1);
  const odds: Record<string, number> = { ...base, rich: base.rich + extra, normal: Math.max(0, base.normal - extra) };
  const grade = RICHNESS.find((r) => (roll -= odds[r.id]) < 0) ?? RICHNESS[RICHNESS.length - 1];
  const [low, high] = grade.size;
  return { total: Math.round(low + rng() * (high - low)) * VEINS.sizeScale, rich: grade.id };
}

/** Splits a vein's total over its cells: the ends hold least, the middle most, and every cell at least 1. */
export function shareOut(total: number, count: number): number[] {
  return shareBy(total, strandWeights(count));
}

/** How much of a strand's ore each cell holds relative to the others: 1 at its ends up to the core weight at its middle. */
const strandWeights = (count: number): number[] =>
  Array.from({ length: count }, (_, i) => (count === 1 ? 1 : 1 + (VEINS.coreWeight - 1) * (1 - Math.abs((2 * i) / (count - 1) - 1))));

/** Splits a total over cells by their weights, every cell at least 1, what rounding leaves going to the heaviest first. */
function shareBy(total: number, weights: number[]): number[] {
  const count = weights.length;
  const sum = weights.reduce((a, b) => a + b, 0);
  const shares = weights.map((w) => Math.max(1, Math.floor((total * w) / sum)));
  // What rounding left over goes to the core first.
  const order = [...shares.keys()].sort((a, b) => weights[b] - weights[a] || a - b);
  let rest = total - shares.reduce((a, b) => a + b, 0);
  for (let k = 0; rest > 0; k += 1, rest -= 1) shares[order[k % count]] += 1;
  for (let k = 0; rest < 0 && k < count * total; k += 1) {
    const i = order[k % count];
    if (shares[i] > 1) {
      shares[i] -= 1;
      rest += 1;
    }
  }
  return shares;
}

/**
 * A strand of cells grown from a start, each new cell touching an end, so the strand is 8-connected.
 * `weight` says how likely a cell is to be taken, 0 for never. It prefers cells that touch only the end
 * it grows from, so the strand runs on rather than bunching into a blob. It may come out short.
 */
function growStrand(rng: () => number, start: Point, length: number, weighOf: (x: number, y: number) => number): Point[] {
  // Weighing a cell may look up the terrain, which is slow; each cell is weighed once.
  const weights = new Map<string, number>();
  const weight = (x: number, y: number) => {
    const key = `${x},${y}`;
    let w = weights.get(key);
    if (w === undefined) weights.set(key, (w = weighOf(x, y)));
    return w;
  };
  const cells = [start];
  const has = (x: number, y: number) => cells.some((c) => c.x === x && c.y === y);
  const touching = (x: number, y: number) => cells.filter((c) => Math.max(Math.abs(c.x - x), Math.abs(c.y - y)) <= 1).length;
  for (let tries = 0; cells.length < length && tries < length * 4; tries += 1) {
    const atEnd = rng() < 0.5;
    const from = atEnd ? cells[cells.length - 1] : cells[0];
    const open = AROUND.map(([dx, dy]) => ({ x: from.x + dx, y: from.y + dy })).filter((p) => !has(p.x, p.y) && weight(p.x, p.y) > 0);
    const thin = open.filter((p) => touching(p.x, p.y) === 1);
    const pool = thin.length ? thin : open;
    if (!pool.length) continue;
    let roll = rng() * pool.reduce((sum, p) => sum + weight(p.x, p.y), 0);
    const pick = pool.find((p) => (roll -= weight(p.x, p.y)) < 0) ?? pool[pool.length - 1];
    if (atEnd) cells.push(pick);
    else cells.unshift(pick);
  }
  return cells;
}

/** How many cells a vein of a grade runs over, from a table of [fewest, most] by grade. */
const strandLength = (rng: () => number, table: Record<string, number[]>, rich?: string): number => {
  const [low, high] = table[rich ?? "normal"] ?? table.normal;
  return low + Math.floor(rng() * (high - low + 1));
};
/** The fewest cells any grade's strand may have; a strand that can't grow that long isn't placed. */
const fewestCells = (table: Record<string, number[]>): number => Math.min(...Object.values(table).map(([low]) => low));

/**
 * A surface ore vein as a strand on dry ground from a start cell, or null if there's no room for one.
 * `free` says which cells may be used. The anchor is the middle cell, where the most ore lies.
 */
function surfaceVein(rng: () => number, seed: number, start: Point, vein: { total: number; rich?: string }, free: (x: number, y: number) => boolean): Pick<Site, "x" | "y" | "cells"> | null {
  const ok = (x: number, y: number) => (free(x, y) && terrain(x, y, seed)[1] !== "t-water" ? 1 : 0);
  if (!ok(start.x, start.y)) return null;
  const path = growStrand(rng, start, strandLength(rng, VEINS.surfaceCells, vein.rich), ok);
  if (path.length < fewestCells(VEINS.surfaceCells)) return null;
  const shares = shareOut(vein.total, path.length);
  const anchor = path[Math.floor(path.length / 2)];
  return { x: anchor.x, y: anchor.y, cells: path.map((p, i) => ({ x: p.x, y: p.y, left: shares[i], total: shares[i] })) };
}

const cellKey = (p: Point): string => `${p.x},${p.y}`;

const RIVER_SPACING = 70;
/** Where hills start, on a 0..1 lie of the land, when a biome doesn't say. Only the odd low hill rises past it. */
const PLAIN_HILLS = 0.8;
/** How much higher the land must rise for each step of height above the first. */
const HILL_STEP = 0.1;

const ease = (t: number) => t * t * (3 - 2 * t);
/** Smooth value noise in 0..1: hashed corners on a grid `scale` cells wide, eased between. Rows count for more, as on screen. */
function valueNoise(x: number, y: number, seed: number, scale: number): number {
  const fx = x / scale;
  const fy = y / CELL_ASPECT / scale;
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const tx = ease(fx - x0);
  const ty = ease(fy - y0);
  const a = hash(x0, y0, seed);
  const b = hash(x0 + 1, y0, seed);
  const c = hash(x0, y0 + 1, seed);
  const d = hash(x0 + 1, y0 + 1, seed);
  return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
}
/** A climate value in 0..1: broad regions with ragged edges, spread out so the ends are reached. */
function climate(x: number, y: number, seed: number): number {
  const s = BIOME_WORLD.climateScale;
  const v = 0.7 * valueNoise(x, y, seed, s) + 0.3 * valueNoise(x, y, seed + 1, s / 3);
  return Math.min(1, Math.max(0, (v - 0.5) * 2 + 0.5));
}

/** The biome the climate gives at one point: height first, then warmth and wetness. */
function climateBiome(x: number, y: number, seed: number): { id: string; wet: number } {
  const high = climate(x, y, seed + 101);
  const warm = climate(x, y, seed + 202);
  const wet = climate(x, y, seed + 303);
  const id = high > 0.78 ? "mountain" : warm < 0.24 ? "snow" : warm > 0.7 && wet < 0.45 ? "desert" : wet > 0.66 ? "marsh" : wet > 0.48 ? "forest" : "plains";
  return { id, wet };
}

/** Each region's biome, worked out once: a region is asked for by every cell in it. */
const regionCache = new Map<string, { id: string; wet: number }>();

/**
 * Biomes come in whole regions, never in specks: the map is cut into regions about `regionSize` cells across
 * (each the cells nearest one jittered point), and a region takes the climate's biome at its point. The cut is
 * bent by a slow noise (`regionWarp` of a region), so the borders wander instead of running straight. Before
 * this a cell read the climate on its own, and a biome that needs two fields at once, like the hot and dry
 * desert, came out as strips a couple of cells wide.
 */
function regionBiome(x: number, y: number, seed: number): { id: string; wet: number } {
  const size = BIOME_WORLD.regionSize;
  const bend = size * BIOME_WORLD.regionWarp;
  // Measured with rows squashed back to cells' true shape, so regions come out round rather than tall.
  const px = x + (valueNoise(x, y, seed + 505, size) - 0.5) * 2 * bend;
  const py = y / CELL_ASPECT + (valueNoise(x, y, seed + 506, size) - 0.5) * 2 * bend;
  const gx = Math.floor(px / size);
  const gy = Math.floor(py / size);
  let best = Infinity;
  let bx = gx;
  let by = gy;
  for (let j = gy - 1; j <= gy + 1; j += 1) {
    for (let i = gx - 1; i <= gx + 1; i += 1) {
      const cx = (i + 0.15 + 0.7 * hash(i, j, seed + 701)) * size;
      const cy = (j + 0.15 + 0.7 * hash(i, j, seed + 702)) * size;
      const dist = (cx - px) ** 2 + (cy - py) ** 2;
      if (dist < best) [best, bx, by] = [dist, i, j];
    }
  }
  const key = `${seed},${bx},${by}`;
  let found = regionCache.get(key);
  if (!found) {
    if (regionCache.size > 4096) regionCache.clear();
    const cx = (bx + 0.15 + 0.7 * hash(bx, by, seed + 701)) * size;
    const cy = (by + 0.15 + 0.7 * hash(bx, by, seed + 702)) * size;
    found = climateBiome(Math.round(cx), Math.round(cy * CELL_ASPECT), seed);
    regionCache.set(key, found);
  }
  return found;
}

/**
 * The biome of a cell, from three slow fields: height, warmth and wetness. Around the base it is always
 * plain, and for a good way out only plain or forest, so every seed starts the same way and has a river near.
 */
export function biomeAt(x: number, y: number, seed: number): string {
  const d = Math.hypot(x - BASE.x, (y - BASE.y) / CELL_ASPECT);
  if (d < BIOME_WORLD.starterRadius) return "plains";
  const { id, wet } = regionBiome(x, y, seed);
  // The mild belt's edge wanders a little, so it doesn't end in a circle.
  const mild = BIOME_WORLD.temperateRadius + valueNoise(x, y, seed + 404, 20) * 25;
  if (d < mild && id !== "plains" && id !== "forest") return wet > 0.5 ? "forest" : "plains";
  return id;
}

/** Whether a desert cell is open water: rare small oases, at most one a chunk. */
function oasisAt(x: number, y: number, seed: number): boolean {
  const cx = chunkOf(x);
  const cy = chunkOf(y);
  if (hash(cx, cy, seed + 606) > 0.08) return false;
  const ox = cx * CHUNK + 4 + Math.floor(hash(cx, cy, seed + 607) * 8);
  const oy = cy * CHUNK + 4 + Math.floor(hash(cx, cy, seed + 608) * 8);
  return Math.hypot(x - ox, (y - oy) / CELL_ASPECT) <= 1.6 + hash(cx, cy, seed + 609) * 1.4;
}

/** The glyph, style and height of open ground. Shared by the map and terrain hazards. */
export function terrain(x: number, y: number, seed: number): [string, string, number] {
  const biome = BIOMES[biomeAt(x, y, seed)];
  if (biome.water === "river") {
    const bend = Math.round(Math.sin(y * 0.6 + seed) * 3);
    const river = (((x + bend + seed) % RIVER_SPACING) + RIVER_SPACING) % RIVER_SPACING;
    if (river < 2) return ["~", "t-water", 0];
  } else if (biome.water === "pond" || biome.water === "ice") {
    // Still water in blobs: open ponds in a marsh, frozen lakes on the snow that can be walked on.
    if (valueNoise(x, y, seed + 505, BIOME_WORLD.lakeScale) > 0.72) return biome.water === "ice" ? ["=", "t-ice", 0] : ["~", "t-water", 0];
  } else if (biome.water === "oasis" && oasisAt(x, y, seed)) {
    return ["~", "t-water", 0];
  }
  const r = hash(x, y, seed + 20);
  // The lie of the land: lumpy noise with a little ridged texture, the same everywhere. Each biome sets how
  // far it must rise to make a hill and how tall hills may get: only mountains reach full height (M).
  const start = biome.hills ?? PLAIN_HILLS;
  const ridge = (Math.sin(x * 0.5 + seed) + Math.cos(y * 0.9 + x * 0.2) + 2) / 4;
  const land = 0.7 * valueNoise(x, y, seed + 707, 8) + 0.3 * ridge;
  if (land > start && r > 0.25) {
    const height = Math.min(biome.maxHeight ?? 1, 1 + Math.floor((land - start) / HILL_STEP));
    return [" ^AM"[height], "t-hill", height];
  }
  const kind = biome.id === "plains" ? "t-plain" : `t-${biome.id}`;
  // A big tree, the only kind worth felling: a few among the small ones (t).
  if (biome.trees && hash(x, y, seed + 22) < biome.trees) return ["T", kind, 0];
  const glyph = biome.glyphs[Math.floor(hash(x, y, seed + 21) * biome.glyphs.length)];
  return [glyph, kind, 0];
}

/** What can be gathered from the ground here: wood from a big tree, stone from an outcrop on a mountain hill. */
export function groundGather(x: number, y: number, seed: number): string | null {
  const [ch, kind] = terrain(x, y, seed);
  if (ch === "T") return "wood";
  if (kind !== "t-hill") return null;
  const share = BIOMES[biomeAt(x, y, seed)].stone ?? 0;
  return hash(x, y, seed + 23) < share ? "stone" : null;
}

/** The biome's ground colour for a ground class, for the map. */
export const groundColor = (cls: string): string | undefined => (cls === "t-plain" ? BIOMES.plains.ground : BIOMES[cls.slice(2)]?.ground);

/** What kind of water lies here: a river's bank, a marsh pond, an oasis, or a hole in the ice. */
export const waterKind = (x: number, y: number, seed: number): "river" | "pond" | "oasis" | "ice" =>
  BIOMES[biomeAt(x, y, seed)].water ?? "river";

/** Guaranteed veins around the base, so every seed can finish the first goal. */
export function generateSites(seed: number): Site[] {
  const rng = rngFrom(seed * 31 + 7);
  const sites: Site[] = [];
  // The base and the cave entrance every world has stay clear.
  const taken = new Set([`${BASE.x},${BASE.y}`, cellKey(nearCave(seed))]);
  const free = (x: number, y: number) => !taken.has(`${x},${y}`);
  const below = new Set<string>();
  // Only clay is promised near the base, the first thing S0 needs, and food: everything else is rolled there like
  // anywhere else and has to be found. (VEINS.starter names the families laid close, at a distance.)
  const starters = VEINS.starter.families.map((family) => SURFACE_ORES.find((id) => familyOf(id) === family)!).filter(Boolean);
  for (const ore of [...starters, ...FORAGE]) {
    const forage = FORAGE.includes(ore);
    {
      const [min, max] = forage ? NEAR : VEINS.starter.distance;
      const vein = rollVein(rng, ore);
      for (;;) {
        const dist = min + rng() * (max - min);
        const angle = rng() * Math.PI * 2;
        const x = Math.round(BASE.x + Math.cos(angle) * dist) + 0; // + 0 turns -0 into 0, which is what a save gives back
        const y = Math.round(BASE.y + Math.sin(angle) * dist * CELL_ASPECT) + 0;
        if (!free(x, y)) continue;
        const placed = forage ? { x, y } : surfaceVein(rng, seed, { x, y }, vein, free);
        if (!placed) continue;
        for (const cell of placed.cells ?? [placed]) taken.add(cellKey(cell));
        const site: Site = { id: sites.length, ore, ...vein, ...placed, left: vein.total, seed: seed + sites.length * 5 };
        sites.push(forage ? site : continueBelow(seed, site, below));
        break;
      }
    }
  }
  return sites;
}

/** Veins of an ore that opens later, placed around the base like the first ones. */
export function laterVeins(seed: number, ore: string): Omit<Site, "id">[] {
  const rng = rngFrom(Math.imul(seed + 5, 2654435761) ^ Math.imul(ore.charCodeAt(0), 40503));
  const taken = new Set([`${BASE.x},${BASE.y}`, cellKey(nearCave(seed))]);
  const free = (x: number, y: number) => !taken.has(`${x},${y}`);
  const below = new Set<string>();
  return Array.from({ length: SITES_PER_ORE }, (_, i) => {
    const [min, max] = i === 0 ? NEAR : FAR;
    const vein = rollVein(rng, ore);
    for (;;) {
      const dist = min + rng() * (max - min);
      const angle = rng() * Math.PI * 2;
      const start = { x: Math.round(BASE.x + Math.cos(angle) * dist) + 0, y: Math.round(BASE.y + Math.sin(angle) * dist * CELL_ASPECT) + 0 };
      const placed = surfaceVein(rng, seed, start, vein, free);
      if (!placed) continue;
      for (const cell of placed.cells!) taken.add(cellKey(cell));
      return continueBelow(seed, { ore, ...vein, ...placed, left: vein.total, seed: seed + i * 7 }, below);
    }
  });
}

/** Picks a family by its weight, then one of the pool's ores in that family. A biome tilts both. */
export function pickOre(rng: () => number, pool: string[], biome?: Biome): string {
  const families = [...new Set(pool.map((id) => familyOf(id)!))];
  const weight = (f: string) => (FAMILY_WEIGHT[f] ?? 10) * (biome?.family?.[f] ?? 1);
  let roll = rng() * families.reduce((sum, f) => sum + weight(f), 0);
  const family = families.find((f) => (roll -= weight(f)) < 0) ?? families[families.length - 1];
  const ores = pool.filter((id) => familyOf(id) === family);
  const odds = (id: string) => biome?.ores?.[id] ?? 1;
  let pick = rng() * ores.reduce((sum, id) => sum + odds(id), 0);
  return ores.find((id) => (pick -= odds(id)) < 0) ?? ores[ores.length - 1];
}

/** A dry cell beside a chunk's still water, where a pump or a drum can draw from it. */
function shoreOf(seed: number, cx: number, cy: number, start: number): Point | null {
  const wet = (x: number, y: number) => {
    const cls = terrain(x, y, seed)[1];
    return cls === "t-water" || cls === "t-ice";
  };
  for (let i = 0; i < CHUNK * CHUNK; i += 1) {
    const cell = (start + i * 7) % (CHUNK * CHUNK);
    const x = cx * CHUNK + (cell % CHUNK);
    const y = cy * CHUNK + Math.floor(cell / CHUNK);
    if (wet(x, y)) continue;
    if (wet(x + 1, y) || wet(x - 1, y) || wet(x, y + 1) || wet(x, y - 1)) return { x, y };
  }
  return null;
}

/**
 * Veins of one chunk. The same seed and coordinates always give the same veins. Ore veins may run on
 * underground below their outcrop; that is rolled apart, so what lies on the surface never depends on it.
 */
export function chunkSites(seed: number, cx: number, cy: number, later: string[] = []): Omit<Site, "id">[] {
  const below = new Set<string>();
  return chunkSurface(seed, cx, cy, later).map((site) => (site.cells ? continueBelow(seed, site, below) : site));
}

/** What lies on a chunk's surface: its ore strands, food, still water and a cave entrance, if any. */
function chunkSurface(seed: number, cx: number, cy: number, later: string[]): Omit<Site, "id">[] {
  const rng = rngFrom(Math.imul(cx + 991, 73856093) ^ Math.imul(cy + 577, 19349663) ^ Math.imul(seed + 1, 83492791));
  const [one, two] = VEINS.perChunk;
  const countRoll = rng();
  const count = countRoll < one ? 1 : countRoll < one + two ? 2 : 0;
  const sites: Omit<Site, "id">[] = [];
  const spot = () => [cx * CHUNK + Math.floor(rng() * CHUNK), cy * CHUNK + Math.floor(rng() * CHUNK)];
  const far = (x: number, y: number) => Math.hypot(x - BASE.x, (y - BASE.y) / CELL_ASPECT) >= STARTER_RADIUS;
  const dry = (x: number, y: number) => terrain(x, y, seed)[1] !== "t-water";
  // A strand stays inside its own chunk, so the chunk's sites are all it has to keep clear of.
  const taken = new Set<string>([cellKey(nearCave(seed))]);
  const free = (x: number, y: number) => chunkOf(x) === cx && chunkOf(y) === cy && far(x, y) && !taken.has(`${x},${y}`);
  const place = (site: Omit<Site, "id">) => {
    for (const cell of cellsOf(site as Site)) taken.add(cellKey(cell));
    sites.push(site);
  };
  for (let i = 0; i < count; i += 1) {
    const [x, y] = spot();
    // The biome where the vein lies decides what it is likely to be, and may bring up an ore from deeper.
    const biome = BIOMES[biomeAt(x, y, seed)];
    const ore = pickOre(rng, [...new Set([...SURFACE_ORES, ...later, ...(biome.extraOres ?? [])])], biome);
    const vein = rollVein(rng, ore, 0, biome.rich ?? 1);
    // The strand keeps to the biome that chose its ore.
    const placed = surfaceVein(rng, seed, { x, y }, vein, (px, py) => free(px, py) && biomeAt(px, py, seed) === biome.id);
    if (placed) place({ ore, ...vein, ...placed, left: vein.total, seed: seed + Math.abs(cx * 131 + cy * 17 + i) });
  }
  // Food is rolled on its own, so it never crowds out ore. What grows depends on the biome; some grow nothing.
  const forageRoll = rng();
  {
    const [x, y] = spot();
    const biome = BIOMES[biomeAt(x, y, seed)];
    const kinds = biome.forage.filter((id) => FORAGE.includes(id));
    if (kinds.length && forageRoll < FORAGE_CHANCE * (biome.forageChance ?? 1)) {
      const ore = kinds[Math.floor(rng() * kinds.length)];
      const vein = rollVein(rng, ore);
      if (free(x, y) && dry(x, y)) place({ ore, x, y, ...vein, left: vein.total, seed: seed + Math.abs(cx * 131 + cy * 17 + 7) });
    }
  }
  // Still water away from the rivers: a marsh pond, a desert oasis, a hole cut in the ice.
  const centre = BIOMES[biomeAt(cx * CHUNK + CHUNK / 2, cy * CHUNK + CHUNK / 2, seed)];
  const waterChance = centre.water === "oasis" ? 1 : centre.water === "pond" ? 0.6 : centre.water === "ice" ? 0.5 : 0;
  const waterRoll = rng();
  const shoreStart = Math.floor(rng() * CHUNK * CHUNK);
  const shore = waterRoll < waterChance ? shoreOf(seed, cx, cy, shoreStart) : null;
  if (shore && free(shore.x, shore.y)) place({ ore: WATER, ...shore, total: RIVER.reserve, left: RIVER.reserve, seed: seed + Math.abs(cx * 131 + cy * 17 + 9) });
  if (rng() < CAVES.chunkChance * (centre.caves ?? 1)) {
    const [x, y] = spot();
    if (free(x, y) && dry(x, y)) place({ ore: CAVE, x, y, total: 0, left: 0, seed: seed + Math.abs(cx * 977 + cy * 31) });
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

// ---- The underground: one endless layer (z = -1) directly under the surface

/** What an underground cell is. Habitat is open floor where creatures have their dens. */
export const FLOOR = 0;
export const ROCK = 1;
export const HABITAT = 2;
const UNDER = CAVES.under;

/** Whether the noise alone opens a cell underground: a broad cavern, or a winding tunnel. */
function openRaw(x: number, y: number, seed: number): boolean {
  const cavern = 0.65 * valueNoise(x, y, seed + 811, UNDER.cavernScale) + 0.35 * valueNoise(x, y, seed + 812, UNDER.cavernScale / 3);
  if (cavern > UNDER.cavern) return true;
  // A tunnel runs where two slow noises both lie near their middle: a thin winding band along the first, kept
  // where a broader second one allows, so tunnels run long but leave some stretches of solid rock.
  const a = valueNoise(x, y, seed + 813, UNDER.tunnelScale);
  const b = valueNoise(x, y, seed + 814, UNDER.tunnelScale * 2.3);
  return Math.abs(a - 0.5) < UNDER.tunnel && Math.abs(b - 0.5) < UNDER.tunnelSpread;
}

/** Chunks of the underground by seed, then by a number made of the chunk's coordinates. */
type ChunkCache = Map<number, Map<number, Uint8Array>>;
const rawChunks: ChunkCache = new Map();
const underChunks: ChunkCache = new Map();
const chunkNumber = (cx: number, cy: number): number => (cx + 32768) * 65536 + (cy + 32768);
function cached(cache: ChunkCache, seed: number, cx: number, cy: number, make: () => Uint8Array): Uint8Array {
  let bySeed = cache.get(seed);
  if (!bySeed) cache.set(seed, (bySeed = new Map()));
  const key = chunkNumber(cx, cy);
  let cells = bySeed.get(key);
  if (!cells) bySeed.set(key, (cells = make()));
  return cells;
}

/**
 * A chunk of the underground as the noise makes it, before entrances are carved: rock, floor, and now and then
 * a den, a small patch of floor kept inside the chunk so a cell never depends on the chunk beside it.
 */
function rawChunk(seed: number, cx: number, cy: number): Uint8Array {
  return cached(rawChunks, seed, cx, cy, () => {
    const cells = new Uint8Array(CHUNK * CHUNK);
    for (let ly = 0; ly < CHUNK; ly += 1) {
      for (let lx = 0; lx < CHUNK; lx += 1) cells[ly * CHUNK + lx] = openRaw(cx * CHUNK + lx, cy * CHUNK + ly, seed) ? FLOOR : ROCK;
    }
    if (hash(cx, cy, seed + 821) < UNDER.dens) {
      const start = Math.floor(hash(cx, cy, seed + 822) * CHUNK * CHUNK);
      for (let i = 0; i < CHUNK * CHUNK; i += 1) {
        const cell = (start + i * 37) % (CHUNK * CHUNK);
        const lx = cell % CHUNK;
        const ly = Math.floor(cell / CHUNK);
        if (lx < 2 || lx > CHUNK - 3 || ly < 1 || ly > CHUNK - 2 || cells[cell] !== FLOOR) continue;
        for (let dy = -1; dy <= 1; dy += 1) {
          for (let dx = -2; dx <= 2; dx += 1) {
            const n = (ly + dy) * CHUNK + lx + dx;
            if (cells[n] === FLOOR && hash(cx * CHUNK + lx + dx, cy * CHUNK + ly + dy, seed + 823) < 0.75) cells[n] = HABITAT;
          }
        }
        break;
      }
    }
    return cells;
  });
}
const rawAt = (x: number, y: number, seed: number): number => rawChunk(seed, chunkOf(x), chunkOf(y))[cellInChunk(x, y)];

const nearCaves = new Map<number, Point>();
const entranceCache = new Map<string, Point[]>();
/** The cave entrances of a chunk, the near one included. They are stairs down, so the underground is carved around them. */
export function entrancesIn(seed: number, cx: number, cy: number): Point[] {
  const key = `${seed}:${cx},${cy}`;
  let found = entranceCache.get(key);
  if (!found) {
    let near = nearCaves.get(seed);
    if (!near) nearCaves.set(seed, (near = nearCave(seed)));
    found = chunkSurface(seed, cx, cy, []).filter((site) => site.ore === CAVE).map(({ x, y }) => ({ x, y }));
    if (chunkOf(near.x) === cx && chunkOf(near.y) === cy) found.push(near);
    entranceCache.set(key, found);
  }
  return found;
}

/** Whether a cave entrance lies within `reach` cells (either way) of a cell. */
export function nearEntrance(seed: number, x: number, y: number, reach: number): boolean {
  for (let cy = chunkOf(y - reach); cy <= chunkOf(y + reach); cy += 1) {
    for (let cx = chunkOf(x - reach); cx <= chunkOf(x + reach); cx += 1) {
      if (entrancesIn(seed, cx, cy).some((e) => Math.abs(e.x - x) <= reach && Math.abs(e.y - y) <= reach)) return true;
    }
  }
  return false;
}

/** Offsets within the join reach, nearest first, as the eye measures distance. */
const JOIN_SPOTS = (() => {
  const spots: { dx: number; dy: number; d: number }[] = [];
  const rows = Math.ceil(UNDER.reach * CELL_ASPECT);
  for (let dy = -rows; dy <= rows; dy += 1) {
    for (let dx = -UNDER.reach; dx <= UNDER.reach; dx += 1) {
      const d = Math.hypot(dx, dy / CELL_ASPECT);
      if (d <= UNDER.reach) spots.push({ dx, dy, d });
    }
  }
  return spots.sort((a, b) => a.d - b.d);
})();

const carveCache = new Map<string, Point[]>();
/**
 * The cells an entrance opens underground: a chamber round the stair, and a passage on to the nearest open
 * area big enough to be part of the caves rather than a pocket, so every stair leads somewhere.
 */
function carveOf(seed: number, e: Point): Point[] {
  const key = `${seed}:${e.x},${e.y}`;
  const hit = carveCache.get(key);
  if (hit) return hit;
  const cells: Point[] = [];
  const chamber = new Set<string>();
  const rows = Math.ceil(UNDER.chamber * CELL_ASPECT);
  for (let dy = -rows; dy <= rows; dy += 1) {
    for (let dx = -UNDER.chamber; dx <= UNDER.chamber; dx += 1) {
      if (Math.hypot(dx, dy / CELL_ASPECT) > UNDER.chamber) continue;
      cells.push({ x: e.x + dx, y: e.y + dy });
      chamber.add(`${e.x + dx},${e.y + dy}`);
    }
  }
  // Open cells already measured: whether each belongs to a big enough area.
  const big = new Map<string, boolean>();
  const joins = (start: Point): boolean => {
    const known = big.get(cellKey(start));
    if (known !== undefined) return known;
    const seen = new Set([cellKey(start)]);
    const stack = [start];
    while (stack.length && seen.size < UNDER.joinSize) {
      const p = stack.pop()!;
      for (const [dx, dy] of AROUND.slice(0, 4)) {
        const n = { x: p.x + dx, y: p.y + dy };
        const k = cellKey(n);
        if (seen.has(k) || rawAt(n.x, n.y, seed) === ROCK) continue;
        seen.add(k);
        stack.push(n);
      }
    }
    const result = seen.size >= UNDER.joinSize;
    for (const k of seen) big.set(k, result);
    return result;
  };
  const target = JOIN_SPOTS.map(({ dx, dy }) => ({ x: e.x + dx, y: e.y + dy }))
    .find((p) => !chamber.has(cellKey(p)) && rawAt(p.x, p.y, seed) !== ROCK && joins(p));
  if (target) {
    // A passage of straight steps, so it can be walked without cutting a corner, the longer way first as the eye sees it.
    let { x, y } = e;
    while (x !== target.x || y !== target.y) {
      if (Math.abs(target.x - x) >= Math.abs(target.y - y) / CELL_ASPECT) x += Math.sign(target.x - x);
      else y += Math.sign(target.y - y);
      cells.push({ x, y });
    }
  }
  carveCache.set(key, cells);
  return cells;
}

/** How many chunks away an entrance's carving can reach. */
const CARVE_CHUNKS = Math.ceil((UNDER.reach + UNDER.chamber) / CHUNK);

/** A chunk of the underground as it is: the noise, with every entrance's chamber and passage opened through it. */
function underChunk(seed: number, cx: number, cy: number): Uint8Array {
  return cached(underChunks, seed, cx, cy, () => {
    const cells = rawChunk(seed, cx, cy).slice();
    for (let ey = cy - CARVE_CHUNKS; ey <= cy + CARVE_CHUNKS; ey += 1) {
      for (let ex = cx - CARVE_CHUNKS; ex <= cx + CARVE_CHUNKS; ex += 1) {
        for (const e of entrancesIn(seed, ex, ey)) {
          for (const p of carveOf(seed, e)) if (chunkOf(p.x) === cx && chunkOf(p.y) === cy) cells[cellInChunk(p.x, p.y)] = FLOOR;
        }
      }
    }
    return cells;
  });
}

/**
 * What lies underground at a cell, directly below the same cell on the surface: FLOOR, ROCK or HABITAT. It is
 * worked out from the seed alone, a chunk at a time, so the caves never need saving and chunks meet without seams.
 */
export const underCell = (x: number, y: number, seed: number): number => underChunk(seed, chunkOf(x), chunkOf(y))[cellInChunk(x, y)];

/** What an underground cell would be as part of a vein: open floor, rock beside the floor, rock deep in, or none. */
export function underOreKind(x: number, y: number, seed: number): "floor" | "wall" | "buried" | null {
  const cell = underCell(x, y, seed);
  // Habitat floor is the creatures'; the floor round a stair is kept clear.
  if (cell === HABITAT) return null;
  if (cell === FLOOR) return nearEntrance(seed, x, y, 2) ? null : "floor";
  return AROUND.slice(0, 4).some(([dx, dy]) => underCell(x + dx, y + dy, seed) !== ROCK) ? "wall" : "buried";
}

/** An underground vein cell of a kind: ore on the floor, in a wall, or buried deep in rock. Every one starts unfound. */
const underVeinCell = (p: Point, share: number, kind: "floor" | "wall" | "buried"): VeinCell => ({
  x: p.x, y: p.y, z: -1, left: share, total: share, ...(kind === "floor" ? {} : { wall: true }), ...(kind === "buried" ? { buried: true } : {}), found: false,
});

/**
 * Most ore veins run on underground. Two or three branches start right under the outcrop and spread out
 * through the rock, over the floor and walls of whatever caves lie there. The vein's one total is shared over
 * outcrop and branches: the outcrop holds the most, a branch less toward its tip. `taken` keeps veins rolled
 * together from crossing one another underground.
 */
export function continueBelow<T extends Omit<Site, "id">>(seed: number, site: T, taken: Set<string>): T {
  const rng = rngFrom(Math.imul(site.x + 4099, 2654435761) ^ Math.imul(site.y + 709, 40503) ^ Math.imul(seed + 61, 83492791));
  const outcrop = site.cells;
  if (!outcrop || rng() >= VEINS.below.chance) return site;
  const [fewest, most] = VEINS.below.branches;
  const count = fewest + Math.floor(rng() * (most - fewest + 1));
  const turn = rng() * Math.PI * 2;
  const kinds = new Map<string, ReturnType<typeof underOreKind>>();
  const kindAt = (x: number, y: number) => {
    const key = `${x},${y}`;
    if (!kinds.has(key)) kinds.set(key, underOreKind(x, y, seed));
    return kinds.get(key)!;
  };
  const branches: Point[][] = [];
  for (let b = 0; b < count; b += 1) {
    // Branches start under outcrop cells spread along it, and set off in directions spread round the circle.
    const root = outcrop[Math.round((b * (outcrop.length - 1)) / Math.max(1, count - 1))];
    const angle = turn + (b * Math.PI * 2) / count + (rng() - 0.5);
    const way = { x: Math.cos(angle), y: Math.sin(angle) };
    const length = strandLength(rng, VEINS.below.cells, site.rich);
    if (taken.has(cellKey(root)) || !kindAt(root.x, root.y)) continue;
    const branch = [{ x: root.x, y: root.y }];
    taken.add(cellKey(root));
    for (let k = 1; k < length; k += 1) {
      const tip = branch[branch.length - 1];
      const open = AROUND.map(([dx, dy]) => ({ x: tip.x + dx, y: tip.y + dy, dx, dy }))
        .filter((p) => !taken.has(cellKey(p)) && kindAt(p.x, p.y));
      if (!open.length) break;
      // Each step leans the branch's own way, so branches spread out instead of curling back under the outcrop.
      const weight = (p: { x: number; y: number; dx: number; dy: number }) =>
        VEINS.caveWeights[kindAt(p.x, p.y)!] * Math.max(0.15, 1 + (p.dx * way.x + p.dy * way.y) / Math.hypot(p.dx, p.dy));
      let roll = rng() * open.reduce((sum, p) => sum + weight(p), 0);
      const pick = open.find((p) => (roll -= weight(p)) < 0) ?? open[open.length - 1];
      branch.push({ x: pick.x, y: pick.y });
      taken.add(cellKey(pick));
    }
    branches.push(branch);
  }
  if (!branches.length) return site;
  const weights = [
    ...strandWeights(outcrop.length).map((w) => w * VEINS.coreWeight),
    ...branches.flatMap((branch) => branch.map((_, k) => 1 + (VEINS.coreWeight - 1) * (1 - k / branch.length))),
  ];
  const shares = shareBy(site.total, weights);
  const surface = outcrop.map((c, i) => ({ x: c.x, y: c.y, left: shares[i], total: shares[i] }));
  let i = outcrop.length;
  const under = branches.flatMap((branch) => branch.map((p) => underVeinCell(p, shares[i++], kindAt(p.x, p.y)!)));
  return { ...site, cells: [...surface, ...under], left: site.total };
}

/**
 * A vein that lies only underground, rolled for an underground chunk: a strand that starts on open floor and
 * wanders along the caves, over the floor, into their walls and sometimes on into the rock behind. The biome
 * above tilts what it is, as it does on the surface. It is never seen from above; prospecting finds it.
 */
export function underSites(seed: number, cx: number, cy: number, pool: string[]): Omit<Site, "id">[] {
  const rng = rngFrom(Math.imul(cx + 313, 73856093) ^ Math.imul(cy + 1231, 19349663) ^ Math.imul(seed + 17, 83492791));
  if (rng() >= VEINS.underChunk || !pool.length) return [];
  const first = Math.floor(rng() * CHUNK * CHUNK);
  let start: Point | undefined;
  for (let i = 0; i < CHUNK * CHUNK && !start; i += 1) {
    const cell = (first + i * 37) % (CHUNK * CHUNK);
    const p = { x: cx * CHUNK + (cell % CHUNK), y: cy * CHUNK + Math.floor(cell / CHUNK) };
    if (underOreKind(p.x, p.y, seed) === "floor") start = p;
  }
  if (!start) return [];
  const biome = BIOMES[biomeAt(start.x, start.y, seed)];
  const ore = pickOre(rng, pool, biome);
  const vein = rollVein(rng, ore, CAVES.layer, biome.rich ?? 1);
  const weight = (x: number, y: number) => {
    const kind = underOreKind(x, y, seed);
    return kind ? VEINS.caveWeights[kind] : 0;
  };
  const path = growStrand(rng, start, strandLength(rng, VEINS.caveCells, vein.rich), weight);
  if (path.length < fewestCells(VEINS.caveCells)) return [];
  const shares = shareOut(vein.total, path.length);
  const cells = path.map((p, i) => underVeinCell(p, shares[i], underOreKind(p.x, p.y, seed)!));
  // The anchor is the floor cell nearest the strand's middle: somewhere to stand. The start is floor, so there is one.
  const middle = (path.length - 1) / 2;
  const anchor = cells.map((c, i) => ({ c, i })).filter(({ c }) => !c.wall).sort((a, b) => Math.abs(a.i - middle) - Math.abs(b.i - middle))[0].c;
  return [{ ore, x: anchor.x, y: anchor.y, z: -1, ...vein, cells, left: vein.total, seed: seed + Math.abs(cx * 389 + cy * 53 + 3), found: false }];
}

/** Dry ground beside the nearest river on each side of the base. */
export function riverBanks(seed: number): Point[] {
  return [1, -1].map((way) => {
    let x = BASE.x;
    // The mild belt around the base always has rivers; the cap only guards against an endless search.
    while (terrain(x + way, BASE.y, seed)[1] !== "t-water" && Math.abs(x) < RIVER_SPACING * 3) x += way;
    return { x, y: BASE.y };
  });
}

/**
 * Whether a site has nothing left to dig on layer z. A vein that runs through both layers is judged by the
 * cells on that layer alone: a surface outcrop dug bare is emptied up top even while its strand below is full.
 * A cave entrance holds nothing to dig, so it is never emptied.
 */
export function emptiedOn(site: Site, z: number): boolean {
  if (site.ore === CAVE) return false;
  const here = site.cells?.filter((c) => layerOf(c) === z) ?? [];
  // A site with no cells on this layer (a note seen from the other one) goes by its own layer.
  return here.length ? here.every((c) => c.left <= 0) : site.left <= 0;
}

/** Search order: nearest first, with sites emptied on layer z last, or left out when hidden. */
export function orderSites(sites: Site[], steps: (site: Site) => number, hideEmpty: boolean, z = 0): Site[] {
  const empty = (site: Site) => (emptiedOn(site, z) ? 1 : 0);
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
