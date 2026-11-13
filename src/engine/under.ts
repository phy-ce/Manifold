// The underground: going down and up, what is seen below, prospecting, and the noise that draws creatures.
import { CAVE, CAVES, layerOres } from "../content";
import { CELL_ASPECT, CHUNK, Point, ROCK, Site, cellInChunk, layerOf, chunkKey, chunkOf, underCell, underSites } from "./world";
import { GameState } from "./state";
import { steps8, spawnMobs } from "./creatures";
import { addSite, addChunkSites, forSight, reveal, sightOf, nameRivers } from "./game";

/** Whether the player is underground. */
export const underground = (s: GameState): boolean => s.z < 0;
/** A cave entrance at a cell. Underground the same cell is a stair up. */
const entranceAt = (s: GameState, x: number, y: number): Site | undefined =>
  s.sites.find((site) => site.ore === CAVE && site.x === x && site.y === y);
/** The cave entrance the player stands on, on the surface. */
export function caveDoorHere(s: GameState): Site | undefined {
  if (s.z < 0 || s.path.length) return undefined;
  return entranceAt(s, s.player.x, s.player.y);
}
/** The stair the player stands on underground: any cave entrance's cell leads up. */
export function stairHere(s: GameState): Site | undefined {
  if (s.z >= 0 || s.path.length) return undefined;
  return entranceAt(s, s.player.x, s.player.y);
}
/** Whether the player has seen an underground cell. */
export const underSeenAt = (s: GameState, x: number, y: number): boolean => s.underSeen[chunkKey(x, y)]?.[cellInChunk(x, y)] === 1;
/** Whether an underground cell is rock: no walking into it, and no seeing or shooting through it. */
export const rockAt = (s: GameState, x: number, y: number): boolean => underCell(x, y, s.seed) === ROCK;

/** The nearest stair up the player has seen underground: where the way home starts. */
export function nearestStair(s: GameState): Site | undefined {
  return s.sites.filter((site) => site.ore === CAVE && underSeenAt(s, site.x, site.y))
    .sort((a, b) => steps8(a, s.player) - steps8(b, s.player))[0];
}

/**
 * Marks underground cells in sight as known. The first time a chunk is seen, its own veins are laid out, and so
 * are the surface chunks around it: what lies above decides which veins run on down here and where the stairs are.
 */
export function revealUnder(s: GameState, at: Point, around: number, reach: number, facing: Point | null = null): void {
  forSight(at, facing, around, reach, (x, y) => {
    const key = chunkKey(x, y);
    if (!s.underSeen[key]) {
      s.underSeen[key] = new Array(CHUNK * CHUNK).fill(0);
      openUnderChunk(s, x, y);
    }
    s.underSeen[key][cellInChunk(x, y)] = 1;
  });
}

function openUnderChunk(s: GameState, x: number, y: number): void {
  const cx = chunkOf(x);
  const cy = chunkOf(y);
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      const key = `${cx + dx},${cy + dy}`;
      if (s.revealed[key]) continue;
      s.revealed[key] = new Array(CHUNK * CHUNK).fill(0);
      addChunkSites(s, (cx + dx) * CHUNK, (cy + dy) * CHUNK);
    }
  }
  for (const site of underSites(s.seed, cx, cy, layerOres(CAVES.layer, s.stage))) addSite(s, site);
}

/** Goes down the cave entrance the player stands on, to the same spot underground. */
export function enterCave(s: GameState): boolean {
  if (!caveDoorHere(s)) return false;
  s.z = -1;
  s.path = [];
  s.probe = null;
  s.caveSince = s.time;
  s.noise = null;
  revealUnder(s, s.player, ...sightOf(s, s.player), s.facing);
  spawnMobs(s);
  return true;
}

/** Climbs the stair the player stands on, out onto that entrance on the surface. */
export function leaveCave(s: GameState): boolean {
  if (!stairHere(s)) return false;
  s.z = 0;
  s.probe = null;
  s.mobs = [];
  s.shots = [];
  // A stair may come up somewhere never seen from above.
  reveal(s, s.player, ...sightOf(s, s.player), s.facing);
  nameRivers(s);
  return true;
}

/** Starts prospecting: the player stops and listens to the rock for a moment. */
export function startProbe(s: GameState): boolean {
  if (s.z >= 0 || s.path.length || s.probe !== null) return false;
  s.probe = s.time;
  makeNoise(s);
  return true;
}

/** Knocking on rock or digging is heard: creatures are likelier to come out for a while, and nearer it. */
export function makeNoise(s: GameState): void {
  if (s.z < 0) s.noise = { x: s.player.x, y: s.player.y, at: s.time };
}

/**
 * Prospecting done: the rock around is known, and the vein cells in it are found, cell by cell. A vein is
 * found once any cell the player could see is: cells buried in rock are found too but show nothing yet.
 */
export function finishProbe(s: GameState): void {
  s.probe = null;
  const radius = CAVES.probeRadius;
  revealUnder(s, s.player, radius, radius);
  const near = (p: Point) => Math.hypot(p.x - s.player.x, (p.y - s.player.y) / CELL_ASPECT) <= radius;
  for (const site of s.sites) {
    if (!site.cells?.some((cell) => layerOf(cell) === s.z)) continue;
    for (const cell of site.cells) if (layerOf(cell) === s.z && near(cell)) cell.found = true;
    site.found = site.cells.some((cell) => layerOf(cell) < 0 && cell.found && !cell.buried);
  }
}
