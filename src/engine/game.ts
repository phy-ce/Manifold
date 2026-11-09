// Game rules. Plain data in, plain data out, no DOM, so saves are just JSON.
import { tr } from "../i18n";
import { BELT_DRIVE, PRESSURE_PUMP, PRESS, CONSTRUCTION, WORKBENCH, isBuilder, stageOpening, DRIVE, formOf, CAVE, CAVES, layerOres, fuelValue, isFuel, machineBurn, machineTier, tierRank, ALL, BYPRODUCT, DRUM, ENGINE, MAIN, MANIFOLD, MAX_PORTS, MODULE, MOTOR, PLAYABLE_STAGES, isSteamReady, SPLITTER, isPassive, isStore, laterOres, POWER, PUMP, RIVER, Recipe, STAGES, SURFACE_ORES, TANK, TAR, WAREHOUSE, WATER, gearOf, compareItems, isFluid, isMachine, machinePower, machinePowerOut, machinesAt, foodEffect, forageSeasons, formLabel, itemWeight, machineCost, machineDifficulty, machineForms, machineManual, machineName, matches, processOf } from "../content";
import { BASE, CELL_ASPECT, CHUNK, CaveMap, HABITAT, Point, ROCK, Site, caveCell, caveMap, caveSites, cellInChunk, hash, rngFrom, chunkKey, chunkOf, chunkSites, generateSites, laterVeins, linePath, nearCave, riverBanks, safePath, terrain } from "./world";

export const SAVE_VERSION = 17;
/** Saves older than this are not converted: fuel and power networks changed too much. */
export const OLDEST_SAVE = 16;
/** Most a spring can hold, and how much one wind adds. Moving one item uses 1. */
export const SPRING_MAX = 200;
export const WIND = 5;
/** A wound spring slowly runs down by itself, losing 1 force this often. */
export const SPRING_LEAK_MS = 2_000;
/** Steam can't really be stored: a boiler holds about three seconds of full output. */
export const STEAM_MAX = 30;
export const STACK = 64;
export const INV_SLOTS = 8;
/** The most the player can carry and still walk. */
export const MAX_CARRY = 80;
export const WARE_SLOTS = 12;
export const STEP_MS = 100;
export const WALK_MS = 150;
export const LINE_MS = 500;
export const OUTPUT_CAP = 16;
/** Longest name that still fits on a node. */
export const NAME_MAX = 12;
/** What a machine's tank holds, in litres. Two drums' worth. */
export const TANK_CAP = 200;
/** What a tar tank stores, in litres. */
export const TAR_TANK_CAP = 1000;
export const REVEAL = 4;
export const BASE_REVEAL = 9;

export const SEASON_NAMES = [tr("봄"), tr("여름"), tr("가을"), tr("겨울")];
export const SEASON_MS = 240000;

export const MAX_VITAL = 100;
const HUNGER_MS = 6000;
const STARVE_MS = 3000;
const HEAL_MS = 5000;
const HEAL_ABOVE = 50;
const WAKE_VITAL = 50;
/** Health lost by stepping on dangerous ground. */
const WATER_DAMAGE = 3;
/** Collapsing weakens the player for one season. */
const WEAK_WORK = 0.5;
const WEAK_WALK = 1.25;
const MAX_LOSS = 0.6;
/** Distance at which a collapse costs all of MAX_LOSS. */
const LOSS_RANGE = 120;
/** The graph is drawn one layer at a time: belts for items, pipes for fluids, and power. */
export type LineLayer = "item" | "fluid" | "power";
export const LINE_LAYERS: LineLayer[] = ["item", "fluid", "power"];
/**
 * What one line costs, by the layer it runs on, when no kind is named: any belt, any tube, or a rod
 * as a shaft for power, since tubes are for fluids.
 */
export const TUBE = "tube";
export const BELT = "belt";
const LINE_COST: Record<LineLayer, Record<string, number>> = { item: { [BELT]: 1 }, fluid: { [TUBE]: 1 }, power: { iron_rod: 1 } };
/** A line material fits a cost key by its id, or by its shape when the key is a shape such as any tube. */
const lineFits = (id: string, key: string): boolean => id === key || formOf(id) === key;

/**
 * Items or litres per second one line carries, by the belt or tube it is laid with. Copper tube costs
 * more and carries twice what iron does. Better belts join here when they come.
 */
export const LINE_RATE: Record<string, number> = { iron_belt: 2, iron_tube: 2, copper_tube: 4 };
/** The belts or tubes a layer's lines can be laid with, the plainest first. Power lines are always a rod. */
export const lineKinds = (layer: LineLayer): string[] =>
  layer === "power" ? [] : Object.keys(LINE_RATE).filter((id) => lineFits(id, Object.keys(LINE_COST[layer])[0]));
/** What a line is laid with. Lines from before the choice go by what they were paid with, else the plainest kind. */
export const kindOf = (line: Line, layer: LineLayer): string | undefined =>
  line.kind ?? line.paid.find((stack) => LINE_RATE[stack.id])?.id ?? lineKinds(layer)[0];

/**
 * How an item performs, as [what, how much] rows for the index's detail. Pickers show only names and
 * counts, so the numbers live here. Temperatures and the like will join these as items gain them.
 */
export function itemStats(id: string): [string, string][] {
  const rate = LINE_RATE[id];
  if (rate && formOf(id) === TUBE) return [[tr("관 하나가 나르는 최대 유량"), `${rate} ${tr("L/초")}`]];
  if (rate && formOf(id) === BELT) return [[tr("벨트 하나가 나르는 최대 양"), `${rate} ${tr("개/초")}`]];
  return [];
}

export interface Stack {
  id: string;
  n: number;
}
export type Slots = (Stack | null)[];

export type Overflow = "refuse" | "discard";

export interface GameNode {
  id: number;
  type: string;
  /** Three characters that name this one machine, like K01. */
  code: string;
  /** The player's own name for it, shown instead of the machine's. */
  name?: string;
  form: string;
  x: number;
  y: number;
  ins: Record<string, Stack | null>;
  outs: Record<string, number>;
  progress: number;
  store: Slots;
  paid: Stack[];
  /** Mistakes made on this machine, for difficulty penalties. */
  fails: number;
  /** Stored force: a spring's wind or an engine's steam. */
  energy: number;
  /** 1 when power drives it this step, 0 when none reaches it or it was cut off. */
  speed?: number;
  /** Whether power reaches its outgoing lines this step, so they can carry. */
  carry?: boolean;
  /** Its place in its power network's queue, counting from 1: later ones stop first when power runs short. */
  order?: number;
  /** Connected to power of too weak a tier to drive it, such as a spring for a hammer. */
  tierLow?: boolean;
  /** The fuel waiting in the firebox, heat left in the piece burning now, and the heat that piece started with. */
  fuel?: Stack | null;
  heat?: number;
  heatFull?: number;
  /** How hot the bellows have blown a hand furnace, 0 to BLAST.max. */
  blast?: number;
  /** When the bellows last overheated it and burnt a batch, in game time. */
  burstAt?: number;
  /** The riverbank a pump draws from. */
  siteId?: number;
  /** The tubes laid from the base to that riverbank, given back when the pump lets go of it. */
  riverPaid?: Stack[];
  /** A steam module is fitted, so this machine can take steam power. */
  module?: boolean;
  /** What a full tar tank does with more: refuse it, or take it and throw it away. */
  overflow?: Overflow;
}

/** A planned machine: shown faded on the board, doing nothing until a real one takes its place. */
export interface Ghost {
  id: number;
  type: string;
  form: string;
  /** The riverbank a planned pump will draw from. */
  siteId?: number;
  x: number;
  y: number;
}

/** Nodes folded into one card. They keep running; `port` is the one that faces the outside. */
export interface Group {
  id: number;
  code: string;
  name?: string;
  nodes: number[];
  port: number;
  x: number;
  y: number;
  open: boolean;
}

/** A planned line. Either end can be a real node or a ghost. */
export interface GhostLine {
  from: number;
  to: number;
  material: string;
}

/** A machine being built the old way, before the construction bench. Only older saves have one, and it is refunded on load. */
interface Project {
  type: string;
  done: number;
  paid: Stack[];
}

export interface Line {
  id: number;
  from: number;
  to: number;
  material: string;
  timer: number;
  active: boolean;
  lastMoved: number;
  /** The belt or tube a line is laid with, which sets how much it can carry. Power lines have none. */
  kind?: string;
  /** What this line cost to build, returned when it is removed. */
  paid: Stack[];
}

export interface GameState {
  version: number;
  seed: number;
  time: number;
  player: Point;
  path: Point[];
  walkTimer: number;
  /** Route around known hazards instead of walking straight. */
  safeWalk: boolean;
  inv: Slots;
  /** The stack the player has picked up and is moving with the pointer. */
  cursor: Stack | null;
  /** What is equipped, by slot. */
  gear: Record<string, string | null>;
  sites: Site[];
  /** Explored cells by chunk. A chunk's veins are generated when it first appears here. */
  revealed: Record<string, number[]>;
  /** The cave the player is in, by its entrance site's id; null on the surface. Inside, `player` is a cave cell. */
  cave: number | null;
  /** Explored cells of each cave, by entrance id. */
  caveSeen: Record<string, number[]>;
  /** When prospecting began, if it is under way. */
  probe: number | null;
  /** Creatures in the cave the player is in, and spines in flight. Empty on the surface. */
  mobs: Mob[];
  shots: Shot[];
  nodes: GameNode[];
  lines: Line[];
  ghosts: Ghost[];
  ghostLines: GhostLine[];
  groups: Group[];
  nextId: number;
  /** How many of each machine have ever been built. Codes are never reused. */
  built: Record<string, number>;
  hp: number;
  hunger: number;
  hungerTimer: number;
  vitalTimer: number;
  season: number;
  /** Time until which the player is weakened by a collapse. */
  weakUntil: number;
  /** What the last collapse cost, until the screen has shown it. */
  lost: Stack[] | null;
  /** Index into STAGES of the stage being played. */
  stage: number;
  /** How many of each item have ever been made. Goals check this, so nothing is handed in. */
  made: Record<string, number>;
  /** A stage just finished, until the screen has shown it. */
  announced: string | null;
}

/** "manual" means loaded and waiting for the player to work it. */
export type Status = "run" | "idle" | "blocked" | "manual";

const emptySlots = (n: number): Slots => Array.from({ length: n }, () => null);

/** Three letters and digits, like 0a1. Each machine gets its own, and none is reused. */
function nextCode(s: GameState): string {
  s.built.all = (s.built.all ?? 0) + 1;
  return ((s.built.all * 7919 + 1300) % 46656).toString(36).padStart(3, "0");
}

function newWarehouse(s: GameState, x: number, y: number): GameNode {
  return {
    id: s.nextId++, type: WAREHOUSE, code: nextCode(s), form: "", x, y,
    ins: {}, outs: {}, progress: 0, store: emptySlots(WARE_SLOTS), paid: [], fails: 0, energy: 0,
  };
}

export function createGame(seed: number): GameState {
  const state: GameState = {
    version: SAVE_VERSION,
    seed,
    time: 0,
    player: { ...BASE },
    path: [],
    walkTimer: 0,
    safeWalk: true,
    inv: emptySlots(INV_SLOTS),
    cursor: null,
    gear: {},
    sites: generateSites(seed),
    revealed: {},
    cave: null,
    caveSeen: {},
    probe: null,
    mobs: [],
    shots: [],
    nodes: [],
    lines: [],
    ghosts: [],
    ghostLines: [],
    groups: [],
    nextId: 1,
    built: {},
    hp: MAX_VITAL,
    hunger: MAX_VITAL,
    hungerTimer: 0,
    vitalTimer: 0,
    season: 0,
    weakUntil: 0,
    lost: null,
    stage: 0,
    made: {},
    announced: null,
  };
  state.nodes.push(newWarehouse(state, 40, 200));
  // Every machine is made here, so the game starts with one already standing.
  placeMachine(state, WORKBENCH, 40, 40);
  addNearCave(state);
  reveal(state, BASE, BASE_REVEAL);
  return state;
}

/** Every world has one cave entrance a short walk from the base. */
function addNearCave(s: GameState): void {
  const at = nearCave(s.seed);
  if (s.sites.some((site) => site.x === at.x && site.y === at.y && site.cave === undefined)) return;
  s.sites.push({ ...at, id: s.sites.length, ore: CAVE, total: 0, left: 0, seed: s.seed * 7 + 101 });
}

// ---- Caves

/** The cave the player is in: its entrance on the map and its layout. */
export function currentCave(s: GameState): { door: Site; map: CaveMap } | null {
  if (s.cave === null) return null;
  const door = s.sites.find((site) => site.id === s.cave);
  return door ? { door, map: caveMap(door.seed) } : null;
}
export const inCave = (s: GameState): boolean => s.cave !== null;
/** The cave entrance the player stands on, on the surface. */
export function caveDoorHere(s: GameState): Site | undefined {
  if (s.cave !== null || s.path.length) return undefined;
  return s.sites.find((site) => site.ore === CAVE && site.x === s.player.x && site.y === s.player.y);
}
/** Whether the player stands at a cave's way out. */
export function atCaveExit(s: GameState): boolean {
  const cave = currentCave(s);
  return !!cave && !s.path.length && s.player.x === cave.map.entry.x && s.player.y === cave.map.entry.y;
}
export const caveSeenAt = (s: GameState, x: number, y: number): boolean => {
  const cave = currentCave(s);
  return !!cave && s.caveSeen[String(s.cave)]?.[y * cave.map.width + x] === 1;
};

function revealCave(s: GameState, at: Point, radius: number): void {
  const cave = currentCave(s);
  if (!cave) return;
  const { width, height } = cave.map;
  const seen = (s.caveSeen[String(s.cave)] ??= new Array(width * height).fill(0));
  const reach = Math.ceil(radius * CELL_ASPECT);
  for (let y = Math.max(0, at.y - reach); y <= Math.min(height - 1, at.y + reach); y += 1) {
    for (let x = Math.max(0, at.x - radius); x <= Math.min(width - 1, at.x + radius); x += 1) {
      if (Math.hypot(x - at.x, (y - at.y) / CELL_ASPECT) <= radius) seen[y * width + x] = 1;
    }
  }
}

/** Steps down into the cave whose entrance the player stands on. Its veins are laid out the first time. */
export function enterCave(s: GameState): boolean {
  const door = caveDoorHere(s);
  if (!door) return false;
  if (!s.sites.some((site) => site.cave === door.id)) {
    for (const vein of caveSites(door.seed, door.id, layerOres(CAVES.layer, s.stage))) s.sites.push({ ...vein, id: s.sites.length });
  }
  s.cave = door.id;
  const map = caveMap(door.seed);
  s.player = { ...map.entry };
  s.path = [];
  s.probe = null;
  spawnMobs(s, door, map);
  revealCave(s, s.player, REVEAL);
  return true;
}

/** Climbs back out, onto the entrance on the map. */
export function leaveCave(s: GameState): boolean {
  const cave = currentCave(s);
  if (!cave || !atCaveExit(s)) return false;
  s.cave = null;
  s.player = { x: cave.door.x, y: cave.door.y };
  s.probe = null;
  s.mobs = [];
  s.shots = [];
  return true;
}

/** Starts prospecting: the player stops and listens to the rock for a moment. */
export function startProbe(s: GameState): boolean {
  if (!inCave(s) || s.path.length || s.probe !== null) return false;
  s.probe = s.time;
  return true;
}

// ---- Cave creatures

/** A wolf runs the player down and bites; a spine salamander keeps its distance and shoots. */
export interface Mob {
  id: number;
  kind: "melee" | "ranged";
  x: number;
  y: number;
  /** Time until it may move again, and until it may bite or shoot again. */
  wait: number;
  cool: number;
}
/** A spine in flight. It moves a fraction of a cell each step, so it can be dodged. */
export interface Shot {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
}
const MOBS = CAVES.creatures;
const SHOT_LIFE = 30;
const steps8 = (a: Point, b: Point) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

/** Whether nothing but open cave lies between two cells. */
export function clearLine(map: CaveMap, a: Point, b: Point): boolean {
  const n = steps8(a, b);
  for (let i = 1; i < n; i += 1) {
    const x = Math.round(a.x + ((b.x - a.x) * i) / n);
    const y = Math.round(a.y + ((b.y - a.y) * i) / n);
    if (caveCell(map, x, y) === ROCK) return false;
  }
  return true;
}

/** Whether the player can see or hear a creature: near enough, with open cave between. */
export function mobVisible(s: GameState, mob: Mob): boolean {
  const cave = currentCave(s);
  return !!cave && steps8(mob, s.player) <= MOBS.sight && clearLine(cave.map, mob, s.player);
}

/** Creatures come out of their dens each time the player goes in, never near the way out. */
function spawnMobs(s: GameState, door: Site, map: CaveMap): void {
  const rng = rngFrom(Math.imul(door.seed + 3, 2654435761) ^ Math.floor(s.time / 1000));
  const dens = [...map.cells.keys()].filter((i) => map.cells[i] === HABITAT);
  const [fewest, most] = MOBS.count;
  const count = fewest + Math.floor(rng() * (most - fewest + 1));
  s.mobs = [];
  s.shots = [];
  for (let i = 0; i < count && dens.length; i += 1) {
    const [cell] = dens.splice(Math.floor(rng() * dens.length), 1);
    const at = { x: cell % map.width, y: Math.floor(cell / map.width) };
    if (steps8(at, map.entry) <= MOBS.safeRadius + 4) continue;
    s.mobs.push({ id: i, kind: rng() < MOBS.rangedShare ? "ranged" : "melee", ...at, wait: 0, cool: 1000 });
  }
}

/** A cell a creature may step onto: open, free, and outside the safe ground by the way out. */
function mobCanStand(s: GameState, map: CaveMap, mob: Mob, x: number, y: number): boolean {
  if (caveCell(map, x, y) === ROCK || steps8({ x, y }, map.entry) <= MOBS.safeRadius) return false;
  if (x === s.player.x && y === s.player.y) return false;
  return !s.mobs.some((other) => other !== mob && other.x === x && other.y === y);
}

function mobStep(s: GameState, map: CaveMap, mob: Mob, way: "toward" | "away" | "wander"): void {
  let next: Point | undefined;
  if (way === "toward") {
    // The first step of the way round the rock to the player.
    next = safePath(mob, s.player, () => 0, (x, y) => caveCell(map, x, y) === ROCK)[0];
  } else if (way === "away") {
    const dx = s.player.x - mob.x;
    const dy = s.player.y - mob.y;
    next = { x: mob.x - Math.sign(dx), y: mob.y - Math.sign(dy) };
  }
  if (!next || !mobCanStand(s, map, mob, next.x, next.y)) {
    // Blocked or idle: shuffle to a neighbouring cell.
    const r = hash(mob.id * 31 + mob.x, mob.y, Math.floor(s.time / 100));
    const [dx, dy] = [[1, 0], [-1, 0], [0, 1], [0, -1]][Math.floor(r * 4)];
    next = { x: mob.x + dx, y: mob.y + dy };
    if (!mobCanStand(s, map, mob, next.x, next.y)) return;
  }
  mob.x = next.x;
  mob.y = next.y;
}

/** One step of cave life: creatures move, bite and shoot, and spines fly. */
function creatures(s: GameState): void {
  const cave = currentCave(s);
  if (!cave) return;
  const { map } = cave;
  for (const mob of s.mobs) {
    mob.wait = Math.max(0, mob.wait - STEP_MS);
    mob.cool = Math.max(0, mob.cool - STEP_MS);
    // They smell the player round corners within hunting range; shooting needs a clear line.
    const aware = mobVisible(s, mob);
    const near = steps8(mob, s.player);
    const hunting = near <= MOBS.hunt;
    if (mob.kind === "melee") {
      if (near <= 1 && mob.cool <= 0) {
        mob.cool = MOBS.melee.attackMs;
        hurt(s, MOBS.melee.damage);
        if (s.cave === null) return;
        continue;
      }
      if (mob.wait > 0 || near <= 1) continue;
      mob.wait = MOBS.melee.moveMs;
      mobStep(s, map, mob, hunting ? "toward" : "wander");
    } else {
      const { range, keep, fireMs, shotSpeed, moveMs } = MOBS.ranged;
      if (aware && near <= range && mob.cool <= 0) {
        mob.cool = fireMs;
        const dx = s.player.x - mob.x;
        const dy = s.player.y - mob.y;
        const len = Math.hypot(dx, dy) || 1;
        s.shots.push({ x: mob.x, y: mob.y, vx: (dx / len) * shotSpeed, vy: (dy / len) * shotSpeed, life: SHOT_LIFE });
      }
      if (mob.wait > 0) continue;
      mob.wait = moveMs;
      // Close in until in range with a clear shot, then hold off at a distance.
      if (hunting && (!aware || near > keep[1])) mobStep(s, map, mob, "toward");
      else if (aware && near < keep[0]) mobStep(s, map, mob, "away");
      else if (!hunting) mobStep(s, map, mob, "wander");
    }
  }
  // Spines fly straight until they hit rock or the player, or run out.
  s.shots = s.shots.filter((shot) => {
    shot.x += shot.vx;
    shot.y += shot.vy;
    shot.life -= 1;
    const x = Math.round(shot.x);
    const y = Math.round(shot.y);
    if (shot.life <= 0 || caveCell(map, x, y) === ROCK) return false;
    if (x === s.player.x && y === s.player.y && s.cave !== null) {
      hurt(s, MOBS.ranged.damage);
      return false;
    }
    return true;
  });
}

/** Prospecting done: the rock around is known, and any veins in it are found. */
function finishProbe(s: GameState): void {
  s.probe = null;
  const radius = CAVES.probeRadius;
  revealCave(s, s.player, radius);
  for (const site of s.sites) {
    if (site.cave !== s.cave || site.found) continue;
    if (Math.hypot(site.x - s.player.x, (site.y - s.player.y) / CELL_ASPECT) <= radius) site.found = true;
  }
}

function addChunkSites(state: GameState, x: number, y: number): void {
  for (const site of chunkSites(state.seed, chunkOf(x), chunkOf(y), laterOres(state.stage))) {
    const taken = state.sites.some((other) => other.x === site.x && other.y === site.y);
    if (!taken) state.sites.push({ ...site, id: state.sites.length });
  }
}

function reveal(state: GameState, at: Point, radius: number): void {
  const reach = Math.ceil(radius * CELL_ASPECT);
  for (let y = at.y - reach; y <= at.y + reach; y += 1) {
    for (let x = at.x - radius; x <= at.x + radius; x += 1) {
      if (Math.hypot(x - at.x, (y - at.y) / CELL_ASPECT) > radius) continue;
      const key = chunkKey(x, y);
      if (!state.revealed[key]) {
        state.revealed[key] = new Array(CHUNK * CHUNK).fill(0);
        addChunkSites(state, x, y);
      }
      state.revealed[key][cellInChunk(x, y)] = 1;
    }
  }
}

export const atBase = (s: GameState): boolean => s.cave === null && s.player.x === BASE.x && s.player.y === BASE.y && !s.path.length;
export const nodeById = (s: GameState, id: number): GameNode | undefined => s.nodes.find((n) => n.id === id);
export const isRevealed = (s: GameState, x: number, y: number): boolean => s.revealed[chunkKey(x, y)]?.[cellInChunk(x, y)] === 1;

/** Higher ground sees further. */
export const visionAt = (s: GameState, at: Point): number => REVEAL + terrain(at.x, at.y, s.seed)[2] * 2;

/** Whether the player can see a cell right now, rather than remember it. */
export const isVisible = (s: GameState, x: number, y: number): boolean =>
  Math.hypot(x - s.player.x, (y - s.player.y) / CELL_ASPECT) <= visionAt(s, s.player);

export const isWeak = (s: GameState): boolean => s.time < s.weakUntil;

export function siteHere(s: GameState): Site | undefined {
  if (s.path.length) return undefined;
  // A cave entrance is a place, not a vein: it has its own button, never a vein panel.
  return s.sites.find((site) => site.x === s.player.x && site.y === s.player.y && site.ore !== CAVE && onThisMap(s, site));
}

/** Whether a site is on the map the player is on, and known there: cave veins need finding first. */
export const onThisMap = (s: GameState, site: Site): boolean =>
  (site.cave ?? null) === s.cave && (site.cave === undefined || !!site.found);

/** What the player is carrying, including anything in hand. */
export function carried(s: GameState): number {
  const load = [...s.inv, s.cursor].reduce((sum, stack) => sum + (stack ? stack.n * itemWeight(stack.id) : 0), 0);
  return Math.round(load * 10) / 10;
}

/** The equipment on the player. */
const worn = (s: GameState) => Object.values(s.gear).flatMap((id) => {
  const gear = id ? gearOf(id) : undefined;
  return gear ? [gear] : [];
});

/** The most the player can carry and still walk, with what they are wearing. */
export const carryLimit = (s: GameState): number => MAX_CARRY + worn(s).reduce((sum, gear) => sum + (gear.carry ?? 0), 0);

export const overloaded = (s: GameState): boolean => carried(s) > carryLimit(s);

/** A full load takes twice as long to carry as an empty bag. */
export const walkTime = (s: GameState): number =>
  WALK_MS * (1 + Math.min(carried(s), carryLimit(s)) / carryLimit(s)) * (isWeak(s) ? WEAK_WALK : 1) *
  worn(s).reduce((pace, gear) => pace * (gear.walk ?? 1), 1);

/** What stepping on a cell would cost, as far as the player knows. Unseen ground looks safe. */
function knownDamage(s: GameState, x: number, y: number): number {
  // Underground the danger moves about, so no cell is known to hurt.
  if (s.cave !== null) return 0;
  if (!isRevealed(s, x, y) || (x === BASE.x && y === BASE.y)) return 0;
  if (s.sites.some((site) => site.x === x && site.y === y)) return 0;
  const [, kind, height] = terrain(x, y, s.seed);
  return kind === "t-water" ? WATER_DAMAGE : kind === "t-hill" ? 1 + height : 0;
}

function routeTo(s: GameState, target: Point): Point[] {
  const cave = currentCave(s);
  // Underground the route always goes round rock; walking straight only stops avoiding creatures.
  if (cave) return safePath(s.player, target, (x, y) => (s.safeWalk ? knownDamage(s, x, y) : 0), (x, y) => caveCell(cave.map, x, y) === ROCK);
  return s.safeWalk ? safePath(s.player, target, (x, y) => knownDamage(s, x, y)) : linePath(s.player, target);
}

/** Starts walking. Too heavy a load keeps the player where they are. */
export function walkTo(s: GameState, target: Point): boolean {
  if (overloaded(s)) return false;
  s.path = routeTo(s, target);
  s.walkTimer = 0;
  return true;
}

/**
 * One step in a direction, for walking with the keyboard. It replaces any walk in progress
 * but keeps the step already under way, so holding a key moves at the normal pace.
 */
export function walkStep(s: GameState, dx: number, dy: number): boolean {
  if (overloaded(s) || (!dx && !dy)) return false;
  const [sx, sy] = [Math.sign(dx), Math.sign(dy)];
  const cave = currentCave(s);
  if (cave) {
    const rock = (x: number, y: number) => caveCell(cave.map, x, y) === ROCK;
    const { x, y } = s.player;
    if (rock(x + sx, y + sy) || (sx && sy && (rock(x + sx, y) || rock(x, y + sy)))) return false;
  }
  s.path = [{ x: s.player.x + sx, y: s.player.y + sy }];
  return true;
}

/** Switches between going around hazards and walking straight, for the rest of the walk too. */
export function setSafeWalk(s: GameState, on: boolean): void {
  s.safeWalk = on;
  const target = s.path.at(-1);
  if (target) s.path = routeTo(s, target);
}

/** Adds up to n of an item and returns how many fit. */
export function addTo(slots: Slots, id: string, n: number): number {
  let left = n;
  for (const slot of slots) {
    if (slot && slot.id === id && slot.n < STACK) {
      const moved = Math.min(left, STACK - slot.n);
      slot.n += moved;
      left -= moved;
    }
  }
  for (let i = 0; i < slots.length && left > 0; i += 1) {
    if (!slots[i]) {
      const moved = Math.min(left, STACK);
      slots[i] = { id, n: moved };
      left -= moved;
    }
  }
  return n - left;
}

/** Which year it is, counting from 1. A year is four seasons. */
export const yearAt = (time: number): number => Math.floor(time / (SEASON_MS * SEASON_NAMES.length)) + 1;

export const seasonAt = (time: number): number => Math.floor(time / SEASON_MS) % SEASON_NAMES.length;

/** Seasonal food can only be picked in its season. Ore is always there. */
export function canHarvest(s: GameState, site: Site): boolean {
  if (site.ore === WATER || site.ore === CAVE) return false;
  const seasons = forageSeasons(site.ore);
  return !seasons || seasons.includes(s.season);
}

/** Food grows back as its season begins. */
function turnSeason(s: GameState): void {
  const season = seasonAt(s.time);
  if (season === s.season) return;
  s.season = season;
  for (const site of s.sites) {
    if (forageSeasons(site.ore)?.includes(season)) site.left = site.total;
  }
}

/** Riverbanks open with the steam stage. Their water is only ever pumped. */
function addRivers(s: GameState): void {
  for (const bank of riverBanks(s.seed)) {
    if (s.sites.some((site) => site.x === bank.x && site.y === bank.y)) continue;
    s.sites.push({ ...bank, id: s.sites.length, ore: WATER, total: RIVER.reserve, left: RIVER.reserve, seed: s.seed });
  }
  nameRivers(s);
}

/** New ores appear around the base when their stage opens. */
function addLaterVeins(s: GameState): void {
  for (const ore of laterOres(s.stage)) {
    if (s.sites.some((site) => site.ore === ore)) continue;
    for (const vein of laterVeins(s.seed, ore)) {
      if (s.sites.some((site) => site.x === vein.x && site.y === vein.y)) continue;
      if (vein.x === BASE.x && vein.y === BASE.y) continue;
      s.sites.push({ ...vein, id: s.sites.length });
    }
  }
}

/** A riverbank gets its code once the player has found it. It stays on the map, not on the board. */
function nameRivers(s: GameState): void {
  for (const site of foundRivers(s)) site.code ??= nextCode(s);
}

/** Riverbanks the player has found. */
export const foundRivers = (s: GameState): Site[] =>
  s.sites.filter((site) => site.ore === WATER && isRevealed(s, site.x, site.y));

/** Tubes a pipe from the base out to a riverbank takes: one for every cell between them. */
export const riverPipeCost = (site: Point): number => Math.max(1, Math.abs(site.x - BASE.x), Math.abs(site.y - BASE.y));

/** Gives back what was laid or built, into the bag first and a warehouse for what doesn't fit. */
function giveBack(s: GameState, stacks: Stack[]): void {
  for (const stack of stacks) bank(s, stack.id, stack.n - addTo(s.inv, stack.id, stack.n));
}

/** Lets go of a pump's riverbank and takes its pipe back up. */
function unlinkRiver(s: GameState, pump: GameNode): void {
  giveBack(s, pump.riverPaid ?? []);
  delete pump.riverPaid;
  delete pump.siteId;
}

/**
 * Points a pump at a riverbank, laying a pipe out to it from tubes in the bag. Choosing the one
 * it already uses unlinks it and gives the tubes back. A farther bank needs a longer pipe.
 */
export function linkRiver(s: GameState, pumpId: number, siteId: number, tube = lineKinds("fluid")[0]): boolean {
  const pump = nodeById(s, pumpId);
  const site = foundRivers(s).find((bank) => bank.id === siteId);
  if (!atBase(s) || pump?.type !== PUMP || !site) return false;
  if (pump.siteId === siteId) {
    unlinkRiver(s, pump);
    return true;
  }
  // The new pipe is paid before the old one comes up, so a failed switch leaves the pump as it was.
  // It is laid all of the one tube picked, never a mix.
  const cost = riverPipeCost(site);
  if (!lineKinds("fluid").includes(tube) || bagCount(s, tube) < cost) return false;
  const paid = spend(s, tube, cost, true);
  unlinkRiver(s, pump);
  pump.siteId = siteId;
  pump.riverPaid = paid;
  return true;
}

/** The riverbank a pump is linked to, if any. */
export function riverOf(s: GameState, pump: GameNode): Site | undefined {
  return pump.siteId === undefined ? undefined : s.sites[pump.siteId];
}

function refillRivers(s: GameState): void {
  for (const site of s.sites) {
    if (site.ore === WATER) site.left = Math.min(site.total, site.left + 1);
  }
}

export function mine(s: GameState): boolean {
  const site = siteHere(s);
  if (!site || site.left <= 0 || !canHarvest(s, site)) return false;
  s.probe = null;
  const strike = Math.max(1, ...worn(s).map((gear) => gear.mine ?? 1));
  const room = Math.floor((carryLimit(s) - carried(s)) / itemWeight(site.ore));
  const taken = addTo(s.inv, site.ore, Math.min(strike, site.left, room));
  if (!taken) return false;
  site.left -= taken;
  return true;
}

/** Equips what is in hand, swapping out what was there. With empty hands, takes the item off. */
export function clickGear(s: GameState, slot: string): void {
  const current = s.gear[slot] ?? null;
  if (!s.cursor) {
    if (!current) return;
    s.gear[slot] = null;
    s.cursor = { id: current, n: 1 };
    return;
  }
  if (gearOf(s.cursor.id)?.slot !== slot) return;
  s.gear[slot] = s.cursor.id;
  s.cursor.n -= 1;
  if (s.cursor.n <= 0) s.cursor = null;
  if (!current) return;
  if (!s.cursor) s.cursor = { id: current, n: 1 };
  else if (!addTo(s.inv, current, 1)) bank(s, current, 1);
}

export const nodeProcess = (node: GameNode) => processOf(node.type, node.form);

/** The recipe the machine's current inputs select. */
export function recipeOf(node: GameNode): Recipe {
  const { recipes, slots } = nodeProcess(node);
  const fits = (r: Recipe) =>
    Object.keys(r.in).every((ingredient, i) => {
      const stack = node.ins[slots[i].key];
      return !stack || matches(stack.id, ingredient);
    });
  return recipes.find(fits) ?? recipes[0];
}

/** Amount of one batch for a slot. */
function batchOf(node: GameNode, key: string): number {
  const index = nodeProcess(node).slots.findIndex((slot) => slot.key === key);
  return Object.values(recipeOf(node).in)[index];
}

const slotFor = (node: GameNode, item: string) =>
  nodeProcess(node).slots.find((slot) => slot.accepts.some((a) => matches(item, a)));

export const inputCap = (node: GameNode, key: string): number => Math.max(16, batchOf(node, key) * 4);

export function placeMachine(s: GameState, type: string, x: number, y: number): GameNode | null {
  if (!atBase(s) || !machinesAt(s.stage).includes(type)) return null;
  return addNode(s, type, x, y);
}

/** Puts a new node of a type on the board, with no checks. */
function addNode(s: GameState, type: string, x: number, y: number): GameNode {
  if (type === WAREHOUSE) {
    const store = newWarehouse(s, x, y);
    s.nodes.push(store);
    return store;
  }
  if (type === MOTOR || type === MANIFOLD || type === SPLITTER || type === TANK || type === BELT_DRIVE || type === PRESSURE_PUMP) {
    const node: GameNode = { ...newWarehouse(s, x, y), type, store: emptySlots(type === SPLITTER ? 1 : 0) };
    if (type === TANK) node.ins = { [TAR]: null };
    s.nodes.push(node);
    return node;
  }
  // A new construction bench starts on some other machine than itself.
  const form = machineForms(type).find((f) => f !== type) ?? "";
  const node: GameNode = {
    id: s.nextId++,
    type,
    code: nextCode(s),
    form,
    x,
    y,
    ...slotsFor(type, form),
    progress: 0,
    store: [],
    paid: [],
    fails: 0,
    energy: 0,
    ...(machineBurn(type) ? { fuel: null, heat: 0 } : {}),
  };
  s.nodes.push(node);
  return node;
}

function slotsFor(type: string, form: string): Pick<GameNode, "ins" | "outs"> {
  const { slots, outputs } = processOf(type, form);
  return {
    ins: Object.fromEntries(slots.map((slot) => [slot.key, null])),
    outs: Object.fromEntries(outputs.map((item) => [item, 0])),
  };
}

/** Changes the shape a machine works to. Inputs that still fit stay, anything else goes back to the player. */
export function setForm(s: GameState, nodeId: number, form: string): boolean {
  const node = nodeById(s, nodeId);
  if (!atBase(s) || !node || node.form === form || !machineForms(node.type).includes(form)) return false;
  // The construction bench can only make what the stage has opened.
  if (isBuilder(node.type) && !machinesAt(s.stage).includes(form)) return false;
  const inputs = Object.values(node.ins).filter((stack) => stack !== null);
  const returned: Stack[] = Object.entries(node.outs).filter(([, n]) => n).map(([id, n]) => ({ id, n }));
  node.form = form;
  Object.assign(node, slotsFor(node.type, form), { progress: 0 });
  for (const stack of inputs) {
    const slot = slotFor(node, stack.id);
    if (slot) node.ins[slot.key] = stack;
    else returned.push(stack);
  }
  // The player is standing right there, so hand things back to them first.
  for (const stack of returned) {
    const held = addTo(s.inv, stack.id, stack.n);
    bank(s, stack.id, stack.n - held);
  }
  cutLines(s, (line) => routeMaterials(s, line.from, line.to).includes(line.material));
  return true;
}

const stores = (s: GameState): Slots[] => s.nodes.filter((n) => n.type === WAREHOUSE).map((n) => n.store);

/** Puts items in the first warehouse with room and returns how many fit. */
function bank(s: GameState, id: string, n: number): number {
  return stores(s).reduce((done, store) => done + addTo(store, id, n - done), 0);
}

/** How many of an ingredient the player can reach at the base. */
export function countOf(s: GameState, ingredient: string): number {
  return [...s.inv, ...stores(s).flat()].reduce((sum, slot) => sum + (slot && matches(slot.id, ingredient) ? slot.n : 0), 0);
}

export const canAfford = (s: GameState, type: string): boolean =>
  Object.entries(machineCost(type)).every(([key, need]) => countOf(s, key) >= need);

/** How many of an item the player carries. Lines are paid from the bag only. */
export const bagCount = (s: GameState, id: string): number => s.inv.reduce((sum, slot) => sum + (slot && lineFits(slot.id, id) ? slot.n : 0), 0);

/** Room left in the bag for an item. */
const bagRoom = (s: GameState, id: string): number => s.inv.reduce((room, slot) => room + (!slot ? STACK : slot.id === id ? STACK - slot.n : 0), 0);

function spend(s: GameState, ingredient: string, amount: number, bagOnly = false): Stack[] {
  const spent: Stack[] = [];
  let left = amount;
  // Line materials come from the bag, and may be any item of a shape, such as any tube.
  const fits = (id: string) => (bagOnly ? lineFits(id, ingredient) : matches(id, ingredient));
  for (const slots of bagOnly ? [s.inv] : [s.inv, ...stores(s)]) {
    slots.forEach((slot, i) => {
      if (!slot || left <= 0 || !fits(slot.id)) return;
      const taken = Math.min(left, slot.n);
      slot.n -= taken;
      left -= taken;
      spent.push({ id: slot.id, n: taken });
      if (!slot.n) slots[i] = null;
    });
  }
  return spent;
}

function refund(s: GameState, stacks: Stack[]): void {
  for (const stack of stacks) {
    const banked = bank(s, stack.id, stack.n);
    addTo(s.inv, stack.id, stack.n - banked);
  }
}

/** Puts one item in the bag, or a warehouse if the bag is full. False when neither has room. */
function giveItem(s: GameState, id: string): boolean {
  return addTo(s.inv, id, 1) > 0 || bank(s, id, 1) > 0;
}

/** A free-looking spot on the board for a new node. */
export function nextSpot(s: GameState): Point {
  const count = s.nodes.length + s.ghosts.length;
  return { x: 260 + (count % 4) * 210, y: 30 + (Math.floor(count / 4) % 5) * 124 };
}

/** Installs a machine item from the bag or a warehouse. */
export function installMachine(s: GameState, type: string, x: number, y: number): GameNode | null {
  if (countOf(s, type) < 1) return null;
  const node = placeMachine(s, type, x, y);
  if (node) spend(s, type, 1);
  return node;
}

/** Installs the machine item in the player's hand. */
export function installHeld(s: GameState, x: number, y: number): GameNode | null {
  if (!s.cursor || !isMachine(s.cursor.id)) return null;
  const node = placeMachine(s, s.cursor.id, x, y);
  if (node) drop(s, 1);
  return node;
}

/** Folds nodes into a group. A node belongs to one group at most, and the port must be one of them. */
export function createGroup(s: GameState, ids: number[], port: number): Group | null {
  const nodes = ids.filter((id) => nodeById(s, id));
  const taken = s.groups.some((group) => group.nodes.some((id) => nodes.includes(id)));
  if (nodes.length < 2 || taken || !nodes.includes(port)) return null;
  const at = nodeById(s, port)!;
  const group: Group = { id: s.nextId++, code: nextCode(s), nodes, port, x: at.x, y: at.y, open: false };
  s.groups.push(group);
  return group;
}

/** Unfolds a group. Its machines and lines stay exactly as they are. */
export function removeGroup(s: GameState, id: number): void {
  s.groups = s.groups.filter((group) => group.id !== id);
}

/** Plans a machine without needing one yet. */
export function addGhost(s: GameState, type: string, x: number, y: number, form = machineForms(type)[0] ?? ""): Ghost | null {
  if (!machinesAt(s.stage).includes(type)) return null;
  const ghost: Ghost = { id: s.nextId++, type, form, x, y };
  s.ghosts.push(ghost);
  return ghost;
}

/** Copies nodes and ghosts as a new plan, with the lines running between them. */
export function copyToGhosts(s: GameState, ids: number[], dx: number, dy: number): Ghost[] {
  const copies = new Map<number, Ghost>();
  for (const id of ids) {
    const source = nodeById(s, id) ?? s.ghosts.find((g) => g.id === id);
    if (!source) continue;
    const ghost: Ghost = { id: s.nextId++, type: source.type, form: source.form, x: source.x + dx, y: source.y + dy };
    if (source.siteId !== undefined) ghost.siteId = source.siteId;
    copies.set(id, ghost);
  }
  s.ghosts.push(...copies.values());
  for (const line of [...s.lines, ...s.ghostLines]) {
    const from = copies.get(line.from);
    const to = copies.get(line.to);
    if (from && to) s.ghostLines.push({ from: from.id, to: to.id, material: line.material });
  }
  return [...copies.values()];
}

export function removeGhost(s: GameState, id: number): void {
  s.ghosts = s.ghosts.filter((g) => g.id !== id);
  s.ghostLines = s.ghostLines.filter((l) => l.from !== id && l.to !== id);
}

/** Turns planned lines into real ones once both ends exist and the parts are there. */
function settleGhostLines(s: GameState): void {
  s.ghostLines = s.ghostLines.filter((line) => {
    if (!nodeById(s, line.from) || !nodeById(s, line.to)) return true;
    if (!routeMaterials(s, line.from, line.to).includes(line.material) || hasLine(s, line.from, line.to, line.material)) return false;
    return !toggleRoute(s, line.from, line.to, line.material);
  });
}

/** Replaces a ghost with a real machine, using one from the bag or a warehouse. */
export function buildGhost(s: GameState, id: number): GameNode | null {
  const ghost = s.ghosts.find((g) => g.id === id);
  if (!ghost) return null;
  const node = installMachine(s, ghost.type, ghost.x, ghost.y);
  if (!node) return null;
  if (ghost.form) setForm(s, node.id, ghost.form);
  // The plan names a riverbank; the pipe out to it is laid now, if the bag has the tubes.
  if (ghost.siteId !== undefined) linkRiver(s, node.id, ghost.siteId);
  s.ghosts = s.ghosts.filter((g) => g !== ghost);
  for (const line of s.ghostLines) {
    if (line.from === id) line.from = node.id;
    if (line.to === id) line.to = node.id;
  }
  settleGhostLines(s);
  return node;
}

/** Replaces every ghost it has a machine for. Returns how many it placed. */
export function buildAllGhosts(s: GameState): number {
  const built = s.ghosts.map((g) => g.id).filter((id) => buildGhost(s, id));
  settleGhostLines(s);
  return built.length;
}

/** Riverbanks used to be nodes linked to pumps by a line. A pump now just remembers its riverbank. */
function dropRiverNodes(s: GameState): void {
  const banks = new Map(s.nodes.filter((node) => node.type === "riverbank").map((node) => [node.id, node]));
  if (!banks.size) return;
  for (const line of s.lines ?? []) {
    const bank = banks.get(line.from);
    const pump = bank && nodeById(s, line.to);
    if (!pump) continue;
    pump.siteId = bank!.siteId;
    refund(s, line.paid ?? []);
  }
  s.lines = (s.lines ?? []).filter((line) => !banks.has(line.from) && !banks.has(line.to));
  s.nodes = s.nodes.filter((node) => !banks.has(node.id));
  s.groups = (s.groups ?? []).map((group) => ({ ...group, nodes: group.nodes.filter((id) => !banks.has(id)) })).filter((group) => group.nodes.length >= 2);
}

/**
 * Turns saved JSON from any older version into a game of this one, filling in whatever it
 * doesn't have yet. Returns null only for data that isn't a save, or comes from a newer game.
 */
export function loadSave(raw: unknown): GameState | null {
  const old = raw as Partial<GameState> | null;
  if (!old || typeof old.seed !== "number" || typeof old.version !== "number" || old.version > SAVE_VERSION || old.version < OLDEST_SAVE) return null;
  if (!Array.isArray(old.nodes) || !Array.isArray(old.sites)) return null;
  const s = { ...createGame(old.seed), ...old } as GameState;
  // A save from before stages has to work its stage out from what it did have.
  if (old.stage === undefined) delete (s as Partial<GameState>).stage;
  dropRiverNodes(s);
  // Machines that no longer exist go, and their lines with them.
  s.nodes = s.nodes.filter((node) => node.type === "stove" || isMachine(node.type));
  const live = new Set(s.nodes.map((node) => node.id));
  s.lines = (s.lines ?? []).filter((line) => live.has(line.from) && live.has(line.to));
  for (const line of s.lines) {
    line.timer ??= 0;
    line.active ??= false;
    line.lastMoved ??= 0;
    line.paid ??= [];
  }
  for (const node of s.nodes) {
    node.code ??= nextCode(s);
    node.form ??= "";
    node.progress ??= 0;
    node.fails ??= 0;
    node.energy ??= 0;
    node.paid ??= [];
    node.store ??= [];
    node.ins ??= {};
    node.outs ??= {};
    if (node.type === "stove" || isPassive(node.type) || node.type === MOTOR) continue;
    const fresh = slotsFor(node.type, node.form);
    node.ins = { ...fresh.ins, ...node.ins };
    node.outs = { ...fresh.outs, ...node.outs };
  }
  // The bag has shrunk over time. What no longer fits goes to the warehouse.
  for (const stack of s.inv.splice(INV_SLOTS)) if (stack) bank(s, stack.id, stack.n);
  while (s.inv.length < INV_SLOTS) s.inv.push(null);
  upgradeSave(s);
  s.version = SAVE_VERSION;
  return s;
}

/** Brings a save from an older layout up to date. */
export function upgradeSave(s: GameState): GameState {
  s.ghosts ??= [];
  s.ghostLines ??= [];
  // Springs could once feed a manifold.
  cutLines(s, (l) => !(nodeById(s, l.from)?.type === MOTOR && nodeById(s, l.to)?.type === MANIFOLD));
  s.groups ??= [];
  // Machines already on steam from before modules keep working.
  for (const line of s.lines) {
    const from = nodeById(s, line.from);
    const to = nodeById(s, line.to);
    if (line.material === POWER && to && (from?.type === ENGINE || from?.type === MANIFOLD) && needsModule(to)) to.module = true;
  }
  s.safeWalk ??= true;
  // Veins found before grades existed were all normal in size.
  for (const site of s.sites) {
    if (SURFACE_ORES.includes(site.ore)) site.rich ??= "normal";
  }
  // Goals used to be handed in. Count what was handed in or still exists as made.
  const old = s as GameState & { delivered?: number; won?: boolean };
  if (s.stage === undefined) {
    // What was then the first stage, S1-1.
    const { item } = STAGES[1].goal;
    s.stage = old.won ? 1 : 0;
    s.made = { [item]: (old.delivered ?? 0) + countOf(s, item) };
    s.announced = null;
  }
  // S0 came in before S1-1 with save version 17, so an older save is one stage further on.
  if (s.version < 17) s.stage += 1;
  if (s.stage >= stageOpening(WATER)) addRivers(s);
  addLaterVeins(s);
  // Caves came with save version 15. Prospecting under way is not kept across a load.
  s.cave ??= null;
  s.caveSeen ??= {};
  s.probe = null;
  s.mobs ??= [];
  s.shots ??= [];
  if (!s.sites.some((site) => site.ore === CAVE)) addNearCave(s);
  // Machines used to be built from the top list, one at a time. A build in progress gives its materials back,
  // and a game past S0 with no construction bench gets one. Every game keeps a workbench.
  const building = s as GameState & { project?: Project | null };
  if (building.project) refund(s, building.project.paid);
  delete building.project;
  for (const bench of s.stage >= 1 ? [WORKBENCH, CONSTRUCTION] : [WORKBENCH]) {
    if (s.nodes.some((n) => n.type === bench)) continue;
    const spot = nextSpot(s);
    addNode(s, bench, spot.x, spot.y);
  }
  // The stove merged into the brick kiln.
  for (const node of s.nodes) {
    if (node.type === "stove") {
      node.type = "brick_kiln";
      node.ins = { clay: node.ins.Be ?? null, coal: node.ins.coal ?? null };
    }
    if (node.type !== "brick_kiln") continue;
    for (const id of processOf(node.type, node.form).outputs) node.outs[id] ??= 0;
  }
  return s;
}

/** The first warehouse always stays, and a built one must be emptied before demolition. */
export const isFirstWarehouse = (s: GameState, node: GameNode): boolean => s.nodes.find((n) => n.type === WAREHOUSE) === node;
/** The last workbench and construction bench stay too: without them, some machines could never be made again. */
const isLastBench = (s: GameState, node: GameNode): boolean =>
  isBuilder(node.type) && s.nodes.filter((n) => n.type === node.type).length === 1;
export const canRemove = (s: GameState, node: GameNode): boolean =>
  !isFirstWarehouse(s, node) && !isLastBench(s, node) && node.store.every((slot) => !slot);

export function removeNode(s: GameState, id: number): boolean {
  const node = nodeById(s, id);
  if (!atBase(s) || !node || !canRemove(s, node)) return false;
  // Fluids have no container to go back in, so they are lost with the machine.
  for (const stack of Object.values(node.ins)) if (stack && !isFluid(stack.id)) bank(s, stack.id, stack.n);
  for (const [item, n] of Object.entries(node.outs)) if (n && !isFluid(item)) bank(s, item, n);
  s.nodes = s.nodes.filter((n) => n !== node);
  if (node.module) giveItem(s, MODULE);
  giveBack(s, node.riverPaid ?? []);
  // Older saves built nodes straight from materials, and get those back instead.
  if (node.paid.length) refund(s, node.paid);
  else if (!giveItem(s, node.type)) s.cursor ??= { id: node.type, n: 1 };
  cutLines(s, (l) => l.from !== id && l.to !== id);
  s.ghostLines = s.ghostLines.filter((l) => l.from !== id && l.to !== id);
  for (const group of s.groups) {
    group.nodes = group.nodes.filter((member) => member !== id);
    if (group.port === id) group.port = group.nodes[0];
  }
  s.groups = s.groups.filter((group) => group.nodes.length >= 2);
  return true;
}

export const portsUsed = (s: GameState, id: number): number =>
  s.lines.filter((l) => l.from === id || l.to === id).length;

/** Whether a machine needs a module fitted before it can take steam. */
export const needsModule = (node: GameNode): boolean =>
  !isPassive(node.type) && node.type !== MOTOR && node.type !== ENGINE && !isSteamReady(node.type);

/** Stores and manifolds just pass steam on. Machines need to be built for it, or fitted with a module. */
const takesSteam = (node: GameNode): boolean => !needsModule(node) || !!node.module;

/** Fits a steam module from the bag or a warehouse. */
export function fitModule(s: GameState, nodeId: number): boolean {
  const node = nodeById(s, nodeId);
  if (!atBase(s) || !node || !needsModule(node) || node.module || countOf(s, MODULE) < 1) return false;
  spend(s, MODULE, 1);
  node.module = true;
  return true;
}

/** Takes a module back out, which also cuts any steam line it was using. */
export function removeModule(s: GameState, nodeId: number): boolean {
  const node = nodeById(s, nodeId);
  if (!atBase(s) || !node?.module || !giveItem(s, MODULE)) return false;
  delete node.module;
  cutLines(s, (l) => l.to !== nodeId || l.material !== POWER || nodeById(s, l.from)?.type === MOTOR);
  return true;
}

/** What any line between two nodes could carry, before ports or existing lines are counted. */
export function routeMaterials(s: GameState, fromId: number, toId: number): string[] {
  const from = nodeById(s, fromId);
  const to = nodeById(s, toId);
  if (!from || !to || from === to || to.type === MOTOR) return [];
  // A manifold splits steam, so a spring can't feed one.
  if (from.type === MOTOR && to.type === MANIFOLD) return [];
  if (from.type === MOTOR) return to.type !== ENGINE && usesPower(to) ? [POWER] : [];
  if (from.type === ENGINE || from.type === MANIFOLD) return to.type !== ENGINE && usesPower(to) && takesSteam(to) ? [POWER] : [];
  if (to.type === MANIFOLD) return [];
  // A belt drive joins one machine's belt network, and a pressure pump its pipe network. Nothing is carried to or from either.
  const driver = (n: GameNode) => n.type === BELT_DRIVE || n.type === PRESSURE_PUMP;
  if (from.type === BELT_DRIVE) return to.type === ENGINE || to.type === TANK || driver(to) ? [] : [DRIVE];
  if (from.type === PRESSURE_PUMP) return isStore(to.type) || driver(to) ? [] : [PRESS];
  if (driver(to)) return [];
  // Nothing can use stored tar yet, so a tank has no lines out.
  if (from.type === TANK) return [];
  // A warehouse has no filter: it can only send what it holds, in turn.
  if (isStore(from.type)) return to.type === TANK ? [] : [ALL];
  // A warehouse takes items only: fluids need a tank or a drum.
  const usable = (items: string[]) => items.some((item) => (to.type === TANK ? item === TAR : isStore(to.type) ? !isFluid(item) : slotFor(to, item)));
  const { main, byproducts } = outputChannels(from);
  return [...(usable(main) ? [MAIN] : []), ...(usable(byproducts) ? [BYPRODUCT] : [])];
}

/**
 * Whether a power line to this node does anything: it drives a machine. Belts and pipes move on
 * belt drives and pressure pumps, so warehouses and fluid senders like the coke oven take none.
 */
const usesPower = (node: GameNode): boolean => machinePower(node.type) > 0 || node.type === MANIFOLD;

function outputChannels(node: GameNode): { main: string[]; byproducts: string[] } {
  const [main = [], ...rest] = nodeProcess(node).outSlots;
  return { main, byproducts: rest.flat() };
}

const hasLine = (s: GameState, fromId: number, toId: number, material: string): boolean =>
  s.lines.some((l) => l.from === fromId && l.to === toId && l.material === material);

/** Materials a new line between two nodes could carry. */
export function connectOptions(s: GameState, fromId: number, toId: number): string[] {
  if (portsUsed(s, fromId) >= MAX_PORTS || portsUsed(s, toId) >= MAX_PORTS) return [];
  return routeMaterials(s, fromId, toId).filter((m) => !hasLine(s, fromId, toId, m));
}

/**
 * Which layer a line runs on. A channel is judged by what the sender can put out, not by what
 * it holds now, so an empty line keeps its layer.
 */
export function lineLayer(s: GameState, fromId: number, material: string): LineLayer {
  // A belt drive hands its power on to a belt network, so its link is a power line.
  if (material === POWER || material === DRIVE || material === PRESS) return "power";
  const from = nodeById(s, fromId);
  if (!from || material === ALL) return "item";
  const { main, byproducts } = isPassive(from.type) ? { main: [], byproducts: [] } : outputChannels(from);
  const items = material === MAIN ? main : material === BYPRODUCT ? byproducts : [material];
  return items.length && items.every(isFluid) ? "fluid" : "item";
}

/** What a new line costs. A belt or pipe can name the kind to lay it with; otherwise any of its kind will do. */
export function routeCost(s: GameState, fromId: number, material: string, kind?: string): Record<string, number> {
  const layer = lineLayer(s, fromId, material);
  return kind && lineKinds(layer).includes(kind) ? { [kind]: 1 } : LINE_COST[layer];
}

/** Line materials come out of the bag, never a warehouse. */
export const canAffordRoute = (s: GameState, fromId: number, material: string, kind?: string): boolean =>
  Object.entries(routeCost(s, fromId, material, kind)).every(([id, n]) => bagCount(s, id) >= n);

/** Switches one channel on a route on or off. Switching off gives the parts back. A belt or pipe is laid with the kind named, if any. */
export function toggleRoute(s: GameState, fromId: number, toId: number, material: string, kind?: string): boolean {
  const line = s.lines.find((l) => l.from === fromId && l.to === toId && l.material === material);
  if (line) return removeLine(s, line.id);
  if (!canAffordRoute(s, fromId, material, kind)) return false;
  const cost = routeCost(s, fromId, material, kind);
  const added = connect(s, fromId, toId, material);
  if (!added) return false;
  added.paid = Object.entries(cost).flatMap(([id, n]) => spend(s, id, n, true));
  if (lineLayer(s, fromId, material) !== "power") added.kind = added.paid[0]?.id;
  return true;
}

/** Display name: the player's name if it has one, else the machine and its form, then its own code. */
export function nodeLabel(_s: GameState, node: GameNode): string {
  if (node.name) return `${node.name} ${node.code}`;
  const forms = machineForms(node.type);
  const form = forms.length > 1 ? ` (${formLabel(node.form)})` : "";
  return `${machineName(node.type)}${form} ${node.code}`;
}

/** Names a node or group. A blank name goes back to the default. */
export function rename(s: GameState, id: number, name: string): boolean {
  const target = nodeById(s, id) ?? s.groups.find((g) => g.id === id);
  if (!target) return false;
  const clean = name.trim().slice(0, NAME_MAX);
  if (clean) target.name = clean;
  else delete target.name;
  return true;
}

export function connect(s: GameState, fromId: number, toId: number, material: string): Line | null {
  if (!atBase(s) || !connectOptions(s, fromId, toId).includes(material)) return null;
  const line: Line = { id: s.nextId++, from: fromId, to: toId, material, timer: 0, active: false, lastMoved: 0, paid: [] };
  s.lines.push(line);
  return line;
}

/** Keeps the lines that pass the test and refunds the rest. */
function cutLines(s: GameState, keep: (line: Line) => boolean): void {
  const gone = s.lines.filter((l) => !keep(l));
  s.lines = s.lines.filter(keep);
  // A line's materials go back to the bag. Only what doesn't fit, when a machine takes its lines with it, goes to a warehouse.
  for (const line of gone) {
    for (const stack of line.paid) bank(s, stack.id, stack.n - addTo(s.inv, stack.id, stack.n));
  }
}

/** Takes a line down into the bag. A full bag refuses. */
export function removeLine(s: GameState, id: number): boolean {
  const line = s.lines.find((l) => l.id === id);
  if (!atBase(s) || !line) return false;
  if (line.paid.some((stack) => bagRoom(s, stack.id) < stack.n)) return false;
  cutLines(s, (l) => l.id !== id);
  return true;
}

/** How many of an item a node can still accept. */
function roomFor(node: GameNode, item: string, viaLine = false): number {
  if (node.type === TANK) {
    if (item !== TAR) return 0;
    // A tank set to discard always takes more, and loses what doesn't fit.
    return node.overflow === "discard" ? TAR_TANK_CAP : TAR_TANK_CAP - (node.ins[TAR]?.n ?? 0);
  }
  if (isStore(node.type)) {
    if (isFluid(item)) return 0;
    return node.store.reduce((room, slot) => room + (!slot ? STACK : slot.id === item ? STACK - slot.n : 0), 0);
  }
  const key = slotFor(node, item)?.key;
  if (!key) return fuelRoom(node, item, viaLine);
  const slot = node.ins[key];
  if (slot && slot.id !== item) return 0;
  // Lines only top a machine up to two batches, so one machine can't hoard a shared material.
  const cap = viaLine ? batchOf(node, key) * 2 : isFluid(item) ? TANK_CAP : inputCap(node, key);
  return cap - (slot?.n ?? 0);
}

function insert(node: GameNode, item: string, n: number, viaLine = false): number {
  const moved = Math.min(n, roomFor(node, item, viaLine));
  if (moved <= 0) return 0;
  if (node.type === TANK) {
    node.ins[TAR] = { id: TAR, n: Math.min(TAR_TANK_CAP, (node.ins[TAR]?.n ?? 0) + moved) };
    return moved;
  }
  if (isStore(node.type)) return addTo(node.store, item, moved);
  const key = slotFor(node, item)?.key;
  if (!key) {
    node.fuel = { id: item, n: (node.fuel?.n ?? 0) + moved };
    return moved;
  }
  node.ins[key] = { id: item, n: (node.ins[key]?.n ?? 0) + moved };
  return moved;
}

// ---- Fuel

/** How much fuel a firebox holds when filled by hand, and when topped up along a line. */
export const FUEL_CAP = 32;
const FUEL_LINE_CAP = 8;

/** Room in a machine's firebox for a fuel. One kind at a time, like any slot. */
function fuelRoom(node: GameNode, item: string, viaLine: boolean): number {
  if (!machineBurn(node.type) || !isFuel(item) || (node.fuel && node.fuel.id !== item)) return 0;
  return Math.max(0, (viaLine ? FUEL_LINE_CAP : FUEL_CAP) - (node.fuel?.n ?? 0));
}

/** Whether a machine has heat left or fuel to burn. */
export const hasFire = (node: GameNode): boolean => (node.heat ?? 0) > 1e-9 || !!node.fuel;

/**
 * Like a furnace: a piece of fuel is lit only when there is a recipe to run, and once lit
 * it burns down every step, work or not, until it is gone. True while the fire is lit.
 */
function tendFire(node: GameNode): boolean {
  const burn = machineBurn(node.type);
  if (!burn) return true;
  if ((node.heat ?? 0) <= 1e-9) {
    if (!node.fuel || readiness(node) !== "ready") return false;
    node.heat = fuelValue(node.fuel.id);
    node.heatFull = node.heat;
    node.fuel.n -= 1;
    if (!node.fuel.n) node.fuel = null;
  }
  const left = node.heat! - (burn * STEP_MS) / 1000;
  // Rounding leaves crumbs; a fire that is out reads as exactly zero.
  node.heat = left > 1e-9 ? left : 0;
  return true;
}

/** The firebox, clicked: put fuel in from the hand, or take what's there into it. */
export function clickFuel(s: GameState, nodeId: number, button: Button): void {
  const node = nodeById(s, nodeId);
  if (!atBase(s) || !node || !machineBurn(node.type)) return;
  if (s.cursor) {
    if (!isFuel(s.cursor.id)) return;
    drop(s, insert(node, s.cursor.id, button === "left" ? s.cursor.n : 1));
  } else if (node.fuel) {
    lift(s, node.fuel, button === "left" ? node.fuel.n : Math.ceil(node.fuel.n / 2));
    if (!node.fuel.n) node.fuel = null;
  }
}

/** Inventory slot into a machine or the warehouse. */
export function moveToNode(s: GameState, slot: number, nodeId: number): boolean {
  const stack = s.inv[slot];
  const node = nodeById(s, nodeId);
  if (!atBase(s) || !stack || !node) return false;
  const moved = insert(node, stack.id, stack.n);
  stack.n -= moved;
  if (!stack.n) s.inv[slot] = null;
  return moved > 0;
}

/** Chooses what a tar tank does once it is full. */
export function setOverflow(s: GameState, nodeId: number, overflow: Overflow): boolean {
  const node = nodeById(s, nodeId);
  if (!atBase(s) || node?.type !== TANK) return false;
  node.overflow = overflow;
  return true;
}

/** Whether a recipe is one this machine can run as it is set now. */
export const runsRecipe = (node: GameNode, recipe: Recipe): boolean =>
  recipe.machine === node.type && (!recipe.form || recipe.form === node.form);

/** Whether the bag holds anything a recipe could use. The warehouse doesn't count. */
export const bagHolds = (s: GameState, recipe: Recipe): boolean =>
  Object.keys(recipe.in).some((key) => s.inv.some((slot) => slot && matches(slot.id, key)));

/** Loads a recipe's ingredients from the bag only, as much as is there and fits. */
export function fillFromBag(s: GameState, nodeId: number, recipe: Recipe, batches: number): boolean {
  const node = nodeById(s, nodeId);
  if (!atBase(s) || !node || !runsRecipe(node, recipe)) return false;
  let any = false;
  for (const [key, need] of Object.entries(recipe.in)) {
    let left = need * batches;
    s.inv.forEach((stack, i) => {
      if (!stack || left <= 0 || !matches(stack.id, key)) return;
      const moved = insert(node, stack.id, Math.min(left, stack.n));
      stack.n -= moved;
      left -= moved;
      any ||= moved > 0;
      if (!stack.n) s.inv[i] = null;
    });
  }
  // A machine with a firebox also gets the fuel those batches will burn.
  const burn = machineBurn(node.type);
  if (burn) {
    s.inv.forEach((stack, i) => {
      if (!stack || !isFuel(stack.id) || (node.fuel && node.fuel.id !== stack.id)) return;
      const have = (node.heat ?? 0) + (node.fuel ? node.fuel.n * fuelValue(node.fuel.id) : 0);
      const need = Math.max(0, Math.ceil((burn * recipe.time * batches - have) / fuelValue(stack.id)));
      const moved = insert(node, stack.id, Math.min(need, stack.n));
      stack.n -= moved;
      any ||= moved > 0;
      if (!stack.n) s.inv[i] = null;
    });
  }
  return any;
}

export function takeInput(s: GameState, nodeId: number, key: string): boolean {
  const node = nodeById(s, nodeId);
  const stack = node?.ins[key];
  if (!atBase(s) || !node || !stack || isFluid(stack.id)) return false;
  stack.n -= addTo(s.inv, stack.id, stack.n);
  if (!stack.n) node.ins[key] = null;
  node.progress = 0;
  return true;
}

export function takeOutput(s: GameState, nodeId: number, item: string): boolean {
  const node = nodeById(s, nodeId);
  if (!atBase(s) || !node || !node.outs[item] || isFluid(item)) return false;
  node.outs[item] -= addTo(s.inv, item, node.outs[item]);
  return true;
}

export function takeStored(s: GameState, nodeId: number, index: number): boolean {
  const node = nodeById(s, nodeId);
  const stack = node?.store[index];
  if (!atBase(s) || !node || !stack) return false;
  stack.n -= addTo(s.inv, stack.id, stack.n);
  if (!stack.n) node.store[index] = null;
  return true;
}

/** Whether a machine has what it needs, power aside. */
function readiness(node: GameNode): "ready" | "idle" | "blocked" {
  const recipe = recipeOf(node);
  const full = Object.entries(recipe.out).some(([item, qty]) => node.outs[item] + qty > outputCap(item));
  // Each output slot holds one item: a leftover of another metal must be taken out first.
  const { outSlots } = nodeProcess(node);
  const occupied = Object.keys(recipe.out).some((item, i) => outSlots[i].some((other) => other !== item && node.outs[other] > 0));
  if (full || occupied) return "blocked";
  const fed = nodeProcess(node).slots.every(({ key }) => (node.ins[key]?.n ?? 0) >= batchOf(node, key));
  return fed ? "ready" : "idle";
}

/** What one batch will give, once the inputs are enough to start. Empty until then. */
export const expectedOutput = (node: GameNode): string[] =>
  !isPassive(node.type) && readiness(node) === "ready" ? Object.keys(recipeOf(node).out) : [];

/** How much of an output a machine can hold before it stops. */
export const outputCap = (item: string): number => (isFluid(item) ? TANK_CAP : OUTPUT_CAP);

export function status(node: GameNode): Status {
  if (isPassive(node.type)) return "idle";
  if (node.type === MOTOR) return node.energy > 0 ? "run" : "idle";
  const state = readiness(node);
  // A fire needs fuel: loaded but with nothing to burn, a machine waits.
  if (node.type === ENGINE) return state === "ready" && hasFire(node) ? "run" : "idle";
  if (state !== "ready") return state;
  if (machineBurn(node.type) && !hasFire(node)) return "idle";
  if (node.speed) return "run";
  if (machineManual(node.type)) return "manual";
  return machinePower(node.type) ? "idle" : "run";
}

/** Loaded and able to run, but no power is reaching it. */
export const lacksPower = (node: GameNode): boolean =>
  !!machinePower(node.type) && !machineManual(node.type) && readiness(node) === "ready" && !node.speed;

/** Loaded and able to work, but with nothing to burn. */
export const lacksFuel = (node: GameNode): boolean =>
  !!machineBurn(node.type) && readiness(node) === "ready" && !hasFire(node);

function runMachine(s: GameState, node: GameNode): void {
  if (isPassive(node.type) || node.type === MOTOR) return;
  // Decided before the fire is tended, so the step that burns the last heat still counts.
  const working = node.type === ENGINE ? readiness(node) === "ready" : status(node) === "run";
  const lit = tendFire(node);
  // A hand furnace: the blast cools by itself, faster with no fire, and the work moves only while it sits in the zone.
  if (machineManual(node.type) === "bellows") {
    node.blast = Math.max(0, (node.blast ?? 0) - ((lit ? BLAST.fall : BLAST.fallCold) * STEP_MS) / 1000);
    if (lit && status(node) === "manual" && inBlastZone(node)) advance(s, node, STEP_MS / (recipeOf(node).time * 1000));
  }
  // A fire that goes out lets the work cool: what was done slips back, at half the pace it was made.
  if (machineBurn(node.type) && node.type !== ENGINE && node.progress > 0 && !lit) {
    node.progress = Math.max(0, node.progress - (COOL_RATE * STEP_MS) / (recipeOf(node).time * 1000));
    return;
  }
  if (!working || !lit) return;
  advance(s, node, STEP_MS / (recipeOf(node).time * 1000));
  // An engine makes steam whenever it has water and fire, whether or not the steam is used.
  if (node.type === ENGINE) node.energy = Math.min(STEAM_MAX, node.energy + (machinePowerOut(node.type) * STEP_MS) / 1000);
}

/** How fast work cools back once a fire is out, against the pace it was made at. */
export const COOL_RATE = 0.5;

/** One power network: what its sources give, what is connected, and what is drawing now. */
export interface PowerNet {
  tier: string;
  supply: number;
  demand: number;
  used: number;
}
/** The network of each source this step, for the screen. Not saved: it is worked out every step. */
const networks = new Map<number, PowerNet>();

/**
 * Power, a network at a time. Sources joined through manifolds pool their output, and the
 * network takes the weakest tier among them. Everything connected reserves its rated power in
 * the order it was connected; once the total passes the supply, that one and all after it stop.
 * Nothing slows down: a machine runs at full speed or not at all.
 */
function supplyPower(s: GameState, drives: Map<number, GameNode[]>): void {
  networks.clear();
  // Lines move on belt drives and pressure pumps, so nothing reserves power just to send.
  // A node's place in the queue is when its first power line was laid.
  const laid = new Map<number, number>();
  for (const line of s.lines) {
    if (line.material === POWER) laid.set(line.to, Math.min(laid.get(line.to) ?? Infinity, line.id));
  }
  const groups = new Map<string, { sources: GameNode[]; members: GameNode[] }>();
  for (const node of s.nodes) {
    node.speed = 0;
    node.carry = false;
    node.order = undefined;
    node.tierLow = false;
    const sources = drives.get(node.id) ?? [];
    if (!sources.length || !machinePower(node.type)) continue;
    const key = sources.map((m) => m.id).sort((a, b) => a - b).join(",");
    const group = groups.get(key) ?? { sources, members: [] };
    group.members.push(node);
    groups.set(key, group);
  }
  for (const { sources, members } of groups.values()) {
    const tier = sources.map((m) => machineTier(m.type)).reduce((a, b) => (tierRank(b) < tierRank(a) ? b : a));
    const live = sources.filter((m) => m.energy > 0);
    const supply = live.reduce((sum, m) => sum + machinePowerOut(m.type), 0);
    members.sort((a, b) => (laid.get(a.id) ?? 0) - (laid.get(b.id) ?? 0));
    let demand = 0;
    let used = 0;
    let cut = false;
    members.forEach((node, i) => {
      node.order = i + 1;
      const drives = !!machinePower(node.type) && tierRank(machineTier(node.type)) <= tierRank(tier);
      node.tierLow = !!machinePower(node.type) && !drives;
      demand += drives ? machinePower(node.type) : 0;
      cut ||= demand > supply + 1e-9;
      if (cut) return;
      node.carry = true;
      if (!drives) return;
      // Pumps need a linked riverbank with water left to have anything to do.
      const dry = node.type === PUMP && (riverOf(s, node)?.left ?? 0) < 1;
      node.speed = dry ? 0 : 1;
      // A belt drive or pressure pump draws its power whenever it is joined to a network, carrying or not.
      const link = node.type === BELT_DRIVE ? DRIVE : node.type === PRESSURE_PUMP ? PRESS : "";
      const busy = link ? s.lines.some((l) => l.from === node.id && l.material === link) : !dry && readiness(node) === "ready";
      if (busy) used += machinePower(node.type);
    });
    // What is drawn comes out of the sources in proportion to their output.
    for (const m of live) m.energy = Math.max(0, m.energy - (used * (machinePowerOut(m.type) / supply) * STEP_MS) / 1000);
    const net = { tier, supply, demand, used };
    for (const m of sources) networks.set(m.id, net);
  }
}

/** Finishes the stage once its goal item has been made. The items stay with the player. */
function checkGoal(s: GameState): void {
  if (s.stage >= PLAYABLE_STAGES) return;
  const stage = STAGES[s.stage];
  if ((s.made[stage.goal.item] ?? 0) < stage.goal.amount) return;
  s.announced = stage.id;
  s.stage += 1;
  addRivers(s);
  addLaterVeins(s);
}

/** One press of work by the player, worth one second of machine time. */
export function workMachine(s: GameState, nodeId: number, seconds = 1): boolean {
  const node = nodeById(s, nodeId);
  if (!atBase(s) || !node || status(node) !== "manual") return false;
  const strength = isWeak(s) ? WEAK_WORK : 1;
  if (machineManual(node.type) === "bellows") return pumpBellows(s, node, strength);
  // A rhythm strike says how much work it was worth: more for one right on the beat.
  advance(s, node, (seconds * strength) / recipeOf(node).time);
  return true;
}

/**
 * The bellows of a hand furnace. Each pump raises the blast; the work moves on only while the blast
 * sits in the zone, and blowing it past the top burns the batch inside.
 */
export const BLAST = { push: 12, max: 100, low: 40, high: 80, fall: 5, fallCold: 15, after: 35 };

function pumpBellows(s: GameState, node: GameNode, strength: number): boolean {
  node.blast = (node.blast ?? 0) + BLAST.push * strength;
  if (node.blast <= BLAST.max) return true;
  // Overheated: the batch in the furnace is lost and the fire settles back.
  takeBatch(node);
  node.progress = 0;
  node.blast = BLAST.after;
  node.burstAt = s.time;
  return true;
}

/** Whether a hand furnace's blast is in the zone where its work moves. */
export const inBlastZone = (node: GameNode): boolean => (node.blast ?? 0) >= BLAST.low && (node.blast ?? 0) <= BLAST.high;

/**
 * A wrong input. It always costs progress, scaled by the machine's difficulty.
 * On hard machines repeated mistakes also ruin a piece of the material.
 */
export function failWork(s: GameState, nodeId: number): boolean {
  const node = nodeById(s, nodeId);
  if (!atBase(s) || !node || status(node) !== "manual") return false;
  const difficulty = machineDifficulty(node.type);
  node.progress = Math.max(0, node.progress - difficulty * 0.1);
  node.fails += 1;
  if (difficulty >= 3 && node.fails % (7 - difficulty) === 0) {
    const key = nodeProcess(node).slots.find((slot) => node.ins[slot.key])?.key;
    const stack = key ? node.ins[key] : null;
    if (key && stack) {
      stack.n -= 1;
      if (!stack.n) node.ins[key] = null;
    }
  }
  return true;
}

/** Takes one batch of every input out of a machine: used up by finished work, or burnt by an overheat. */
function takeBatch(node: GameNode): void {
  for (const { key } of nodeProcess(node).slots) {
    const slot = node.ins[key];
    if (!slot) continue;
    slot.n -= Math.min(slot.n, batchOf(node, key));
    if (!slot.n) node.ins[key] = null;
  }
}

function advance(s: GameState, node: GameNode, amount: number): void {
  const recipe = recipeOf(node);
  node.progress += amount;
  if (node.progress < 1 - 1e-9) return;
  node.progress = 0;
  takeBatch(node);
  for (const [item, qty] of Object.entries(recipe.out)) {
    node.outs[item] += qty;
    s.made[item] = (s.made[item] ?? 0) + qty;
  }
  if (node.type === PUMP) riverOf(s, node)!.left -= 1;
  checkGoal(s);
}

/** Winds a spring motor by hand. */
export function windMotor(s: GameState, nodeId: number): boolean {
  const node = nodeById(s, nodeId);
  if (!atBase(s) || !node || node.type !== MOTOR || node.energy >= SPRING_MAX) return false;
  node.energy = Math.min(SPRING_MAX, node.energy + (isWeak(s) ? WIND * WEAK_WORK : WIND));
  return true;
}

/** The power sources behind a node, looking through any manifolds on the way. */
function sourcesOf(direct: Map<number, GameNode[]>, id: number, seen = new Set<number>()): GameNode[] {
  return (direct.get(id) ?? []).flatMap((from) => {
    if (seen.has(from.id)) return [];
    seen.add(from.id);
    return from.type === MANIFOLD ? sourcesOf(direct, from.id, seen) : [from];
  });
}

function powerLines(s: GameState, nodes: Map<number, GameNode>): Map<number, GameNode[]> {
  const direct = new Map<number, GameNode[]>();
  for (const line of s.lines) {
    if (line.material === POWER) direct.set(line.to, [...(direct.get(line.to) ?? []), nodes.get(line.from)!]);
  }
  return direct;
}

/** Whether power reached a node last step. A riverbank pump needs it to push its water out. */
export const hasDrive = (s: GameState, nodeId: number): boolean => !!nodeById(s, nodeId)?.carry;

/** Items or litres per second one running belt drive or pressure pump moves, shared by every line in its network. */
export const DRIVE_RATE = 4;
/** No line runs faster than one item per line pass, however many drivers push it. */
export const BELT_MAX = 1000 / LINE_MS;

/** One belt or pipe network: machines joined by lines of one layer, the drivers on it, and the pace of each line. */
export interface BeltNet {
  drives: number;
  running: number;
  /** Lines that move on the network's power. */
  belts: number;
  /** Items or litres per second on every one of those lines. */
  rate: number;
}
/** The networks of each node and the pace of each line, as of the last step. Worked out every step, not saved. */
const beltNets = new Map<number, BeltNet>();
const pipeNets = new Map<number, BeltNet>();
const lineRates = new Map<number, number>();

/**
 * Networks of one layer: everything joined by its lines, a driver's link included, is one network.
 * Its running drivers' rates add up and every line in it shares them at the same pace. A riverbank
 * pump pushes its own water, so its pipes join the network but take none of its share.
 */
function runNetworks(s: GameState, layer: LineLayer, driver: string, link: string, nets: Map<number, BeltNet>): void {
  nets.clear();
  // Driver links sit on the power layer but still join their driver to the network.
  const lines = s.lines.filter((l) => l.material === link || lineLayer(s, l.from, l.material) === layer);
  const parent = new Map<number, number>();
  const root = (id: number): number => {
    while (parent.has(id) && parent.get(id) !== id) id = parent.get(id)!;
    return id;
  };
  for (const line of lines) {
    const a = root(line.from);
    const b = root(line.to);
    parent.set(a, a);
    parent.set(b, b);
    if (a !== b) parent.set(b, a);
  }
  const groups = new Map<number, number[]>();
  for (const id of parent.keys()) groups.set(root(id), [...(groups.get(root(id)) ?? []), id]);
  for (const members of groups.values()) {
    const inside = new Set(members);
    const drivers = members.map((id) => nodeById(s, id)).filter((n): n is GameNode => n?.type === driver);
    const running = drivers.filter((n) => (n.speed ?? 0) > 0).length;
    const carrying = lines.filter((l) => inside.has(l.from) && l.material !== link && nodeById(s, l.from)?.type !== PUMP);
    // Each line tops out at what its belt or tube carries, so the network shows the best a line can do.
    const top = Math.max(...lineKinds(layer).map((id) => LINE_RATE[id]));
    const rate = carrying.length ? Math.min(top, (running * DRIVE_RATE) / carrying.length) : 0;
    const net = { drives: drivers.length, running, belts: carrying.length, rate };
    for (const id of members) nets.set(id, net);
    for (const line of carrying) lineRates.set(line.id, Math.min(rate, lineCap(s, line)));
  }
}

function runBelts(s: GameState): void {
  lineRates.clear();
  runNetworks(s, "item", BELT_DRIVE, DRIVE, beltNets);
  runNetworks(s, "fluid", PRESSURE_PUMP, PRESS, pipeNets);
}

/** The most a line can carry per second: what its belt or tube carries. */
export function lineCap(s: GameState, line: Line): number {
  const kind = kindOf(line, lineLayer(s, line.from, line.material));
  return (kind && LINE_RATE[kind]) || BELT_MAX;
}

/** The belt network a node is on, as of the last step. */
export const beltNetOf = (nodeId: number): BeltNet | undefined => beltNets.get(nodeId);
/** The pipe network a node is on, as of the last step. */
export const pipeNetOf = (nodeId: number): BeltNet | undefined => pipeNets.get(nodeId);


/** Springs always run down. An engine's steam just tops out at its limit. */
function leakForce(s: GameState): void {
  for (const node of s.nodes) {
    if (node.type === MOTOR) node.energy = Math.max(0, node.energy - 1);
  }
}

/**
 * A source's network, in force per second: `now` is what its machines are drawing this moment,
 * `connected` what everything connected reserves, and `limit` what the network's live sources give.
 */
export function powerLoad(_s: GameState, source: GameNode): { now: number; connected: number; limit: number } {
  const net = networks.get(source.id);
  return { now: Math.round(net?.used ?? 0), connected: net?.demand ?? 0, limit: net?.supply ?? machinePowerOut(source.type) };
}

/** The network a source belongs to, as of the last step. */
export const powerNetOf = (source: GameNode): PowerNet | undefined => networks.get(source.id);

/** Lines are only passages: something at the sending end has to push. */
function runLine(s: GameState, line: Line, nodes: Map<number, GameNode>): void {
  if (line.material === POWER || line.material === DRIVE || line.material === PRESS) return;
  const from = nodes.get(line.from)!;
  const to = nodes.get(line.to)!;
  // A line moves at its network's pace. A riverbank pump pushes its own water while it has power.
  const self = from.type === PUMP;
  const pace = (self ? (from.carry ? lineCap(s, line) : 0) : lineRates.get(line.id) ?? 0) / BELT_MAX;
  if (!pace) {
    line.active = false;
    return;
  }
  line.timer += STEP_MS * pace;
  if (line.timer < LINE_MS) return;
  line.active = false;
  // A pipe faster than one pass a step makes as many passes as its time allows.
  while (line.timer >= LINE_MS) {
    line.timer -= LINE_MS;
    const moved = isStore(from.type) ? sendStored(from, to) : sendOutput(from, to, line);
    if (!moved) {
      line.timer = 0;
      return;
    }
    line.active = true;
    line.lastMoved = s.time;
  }
}

/**
 * A warehouse has no filter. It sends from its first slot until the target is full of that,
 * then moves on to the next, so one line can feed ore and coal to a furnace.
 */
function sendStored(from: GameNode, to: GameNode): boolean {
  const index = from.store.findIndex((slot) => slot && roomFor(to, slot.id, true) > 0);
  const slot = from.store[index];
  if (!slot || !insert(to, slot.id, 1, true)) return false;
  slot.n -= 1;
  if (!slot.n) from.store[index] = null;
  return true;
}

function sendOutput(from: GameNode, to: GameNode, line: Line): boolean {
  const { main, byproducts } = outputChannels(from);
  const items = line.material === MAIN ? main : byproducts;
  const item = items.find((id) => from.outs[id] > 0 && roomFor(to, id, true) > 0);
  if (!item || !insert(to, item, 1, true)) return false;
  from.outs[item] -= 1;
  return true;
}

function walk(s: GameState): void {
  if (!s.path.length) return;
  s.walkTimer += STEP_MS;
  if (s.walkTimer < walkTime(s)) return;
  s.walkTimer = 0;
  // A creature in the way stops the walk; there's no walking through it.
  if (s.cave !== null && s.mobs.some((mob) => mob.x === s.path[0].x && mob.y === s.path[0].y)) {
    s.path = [];
    return;
  }
  s.player = s.path.shift()!;
  const cave = currentCave(s);
  if (cave) {
    revealCave(s, s.player, REVEAL);
    return;
  }
  reveal(s, s.player, visionAt(s, s.player));
  if (s.stage >= stageOpening(WATER)) nameRivers(s);
  // New ground can show a hazard on the way, so the safe route is worked out again.
  const target = s.path.at(-1);
  if (s.safeWalk && target && s.path.some((cell) => knownDamage(s, cell.x, cell.y) > 0)) s.path = routeTo(s, target);
  const onSite = s.sites.some((site) => site.x === s.player.x && site.y === s.player.y);
  const atHome = s.player.x === BASE.x && s.player.y === BASE.y;
  if (onSite || atHome) return;
  const [, kind, height] = terrain(s.player.x, s.player.y, s.seed);
  if (kind === "t-water") hurt(s, WATER_DAMAGE);
  else if (kind === "t-hill") hurt(s, 1 + height);
}

function hurt(s: GameState, amount: number): void {
  s.hp -= amount;
  s.probe = null;
  if (s.hp <= 0) collapse(s);
}

/** The player wakes at the base, having dropped part of what they carried. */
function collapse(s: GameState): void {
  stowCursor(s);
  // The further from home, the more is dropped. At the base nothing is.
  // In a cave, the way home runs through its entrance.
  const cave = currentCave(s);
  const span = (a: Point, b: Point) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
  const steps = cave ? span(cave.door, BASE) + span(s.player, cave.map.entry) : span(s.player, BASE);
  s.cave = null;
  s.probe = null;
  s.mobs = [];
  s.shots = [];
  const rate = Math.min(MAX_LOSS, (steps / LOSS_RANGE) * MAX_LOSS);
  const lost: Stack[] = [];
  s.inv.forEach((stack, i) => {
    if (!stack || rate === 0) return;
    const n = Math.ceil(stack.n * rate);
    lost.push({ id: stack.id, n });
    stack.n -= n;
    if (!stack.n) s.inv[i] = null;
  });
  s.weakUntil = s.time + SEASON_MS;
  s.lost = lost;
  s.player = { ...BASE };
  s.path = [];
  s.hp = WAKE_VITAL;
  s.hunger = WAKE_VITAL;
  s.vitalTimer = 0;
}

function survive(s: GameState): void {
  s.hungerTimer += STEP_MS;
  if (s.hungerTimer >= HUNGER_MS) {
    s.hungerTimer = 0;
    s.hunger = Math.max(0, s.hunger - 1);
  }
  const starving = s.hunger === 0;
  const healing = s.hunger >= HEAL_ABOVE && s.hp < MAX_VITAL;
  if (!starving && !healing) {
    s.vitalTimer = 0;
    return;
  }
  s.vitalTimer += STEP_MS;
  if (s.vitalTimer < (starving ? STARVE_MS : HEAL_MS)) return;
  s.vitalTimer = 0;
  if (starving) hurt(s, 1);
  else s.hp += 1;
}

// ---- Moving items by hand

export type Button = "left" | "right";

/** Lifts up to n from a stack onto the cursor. Returns how many moved. */
function lift(s: GameState, stack: Stack, n: number): number {
  if (s.cursor && s.cursor.id !== stack.id) return 0;
  const moved = Math.min(n, stack.n, STACK - (s.cursor?.n ?? 0));
  if (moved <= 0) return 0;
  s.cursor = { id: stack.id, n: (s.cursor?.n ?? 0) + moved };
  stack.n -= moved;
  return moved;
}

function drop(s: GameState, n: number): void {
  if (!s.cursor) return;
  s.cursor.n -= n;
  if (s.cursor.n <= 0) s.cursor = null;
}

/** Puts a held stack back in the inventory, or a warehouse if the bag is full. */
export function stowCursor(s: GameState): void {
  if (!s.cursor) return;
  const held = addTo(s.inv, s.cursor.id, s.cursor.n);
  drop(s, held);
  if (s.cursor) drop(s, bank(s, s.cursor.id, s.cursor.n));
}

/** Pick up, put down, merge or swap on an inventory or warehouse slot. */
export function clickStack(s: GameState, slots: Slots, index: number, button: Button): void {
  const slot = slots[index];
  const cursor = s.cursor;
  if (!cursor) {
    if (!slot) return;
    lift(s, slot, button === "left" ? slot.n : Math.ceil(slot.n / 2));
  } else if (!slot) {
    const n = button === "left" ? cursor.n : 1;
    slots[index] = { id: cursor.id, n };
    drop(s, n);
  } else if (slot.id === cursor.id) {
    const n = Math.min(button === "left" ? cursor.n : 1, STACK - slot.n);
    slot.n += n;
    drop(s, n);
  } else if (button === "left") {
    slots[index] = cursor;
    s.cursor = slot;
  }
  if (slots[index]?.n === 0) slots[index] = null;
}

/** Moves one item between the cursor and a slot: "in" puts one down, "out" picks one up. */
export function wheelStack(s: GameState, slots: Slots, index: number, way: "in" | "out"): boolean {
  const slot = slots[index];
  if (way === "out") {
    if (!slot || !lift(s, slot, 1)) return false;
    if (!slot.n) slots[index] = null;
    return true;
  }
  if (!s.cursor || (slot && (slot.id !== s.cursor.id || slot.n >= STACK))) return false;
  if (slot) slot.n += 1;
  else slots[index] = { id: s.cursor.id, n: 1 };
  drop(s, 1);
  return true;
}

/** Hands back one drum, to the cursor if it can hold it. */
function giveDrum(s: GameState, id: string): void {
  if (!s.cursor) s.cursor = { id, n: 1 };
  else if (s.cursor.id === id && s.cursor.n < STACK) s.cursor.n += 1;
  else if (!addTo(s.inv, id, 1)) bank(s, id, 1);
}

/** Empties one held drum into a machine's tank. A drum pours whole, so the tank needs room for all of it. */
function pourDrum(s: GameState, node: GameNode, key: string): boolean {
  const fluid = Object.keys(DRUM.fills).find((id) => DRUM.fills[id] === s.cursor?.id);
  if (!fluid || slotFor(node, fluid)?.key !== key || roomFor(node, fluid) < DRUM.liters) return false;
  insert(node, fluid, DRUM.liters);
  drop(s, 1);
  giveDrum(s, DRUM.empty);
  return true;
}

/** Fills one held empty drum from a machine's tank. It needs a whole drum's worth. */
function fillDrum(s: GameState, node: GameNode, fluid: string): boolean {
  const full = DRUM.fills[fluid];
  if (s.cursor?.id !== DRUM.empty || !full || node.outs[fluid] < DRUM.liters) return false;
  node.outs[fluid] -= DRUM.liters;
  drop(s, 1);
  giveDrum(s, full);
  return true;
}

export function clickInput(s: GameState, nodeId: number, key: string, button: Button): void {
  const node = nodeById(s, nodeId);
  if (!atBase(s) || !node) return;
  const stack = node.ins[key];
  if (s.cursor) {
    if (pourDrum(s, node, key) || slotFor(node, s.cursor.id)?.key !== key) return;
    drop(s, insert(node, s.cursor.id, button === "left" ? s.cursor.n : 1));
  } else if (stack && !isFluid(stack.id)) {
    lift(s, stack, button === "left" ? stack.n : Math.ceil(stack.n / 2));
    if (!stack.n) node.ins[key] = null;
    node.progress = 0; // pulling the material out abandons the work
  }
}

export function clickOutput(s: GameState, nodeId: number, item: string, button: Button): void {
  const node = nodeById(s, nodeId);
  if (!atBase(s) || !node || !node.outs[item]) return;
  if (isFluid(item)) {
    fillDrum(s, node, item);
    return;
  }
  const stack = { id: item, n: node.outs[item] };
  lift(s, stack, button === "left" ? stack.n : Math.ceil(stack.n / 2));
  node.outs[item] = stack.n;
}

/** Wheel over a machine's input: one in from the cursor or bag, or one back out. */
export function wheelInput(s: GameState, nodeId: number, key: string, way: "in" | "out"): boolean {
  const node = nodeById(s, nodeId);
  if (!atBase(s) || !node) return false;
  const stack = node.ins[key];
  if (way === "in") {
    if (!s.cursor || slotFor(node, s.cursor.id)?.key !== key || !insert(node, s.cursor.id, 1)) return false;
    drop(s, 1);
    return true;
  }
  if (!stack || isFluid(stack.id)) return false;
  const held = s.cursor !== null;
  const moved = held ? lift(s, stack, 1) : addTo(s.inv, stack.id, 1);
  if (!moved) return false;
  if (!held) stack.n -= moved;
  if (!stack.n) node.ins[key] = null;
  node.progress = 0;
  return true;
}

/** Wheel with empty hands: one item between the bag and the open machine or warehouse. */
export function nudgeToNode(s: GameState, slot: number, nodeId: number): boolean {
  const stack = s.inv[slot];
  const node = nodeById(s, nodeId);
  if (!atBase(s) || !stack || !node || !insert(node, stack.id, 1)) return false;
  stack.n -= 1;
  if (!stack.n) s.inv[slot] = null;
  return true;
}

export function nudgeFromStore(s: GameState, nodeId: number, index: number): boolean {
  const node = nodeById(s, nodeId);
  const stack = node?.store[index];
  if (!atBase(s) || !node || !stack || !addTo(s.inv, stack.id, 1)) return false;
  stack.n -= 1;
  if (!stack.n) node.store[index] = null;
  return true;
}

/** Merges matching stacks and lays them out from raw material to finished goods. */
export function sortSlots(slots: Slots): void {
  const totals = new Map<string, number>();
  for (const slot of slots) if (slot) totals.set(slot.id, (totals.get(slot.id) ?? 0) + slot.n);
  slots.fill(null);
  let i = 0;
  for (const id of [...totals.keys()].sort(compareItems)) {
    let left = totals.get(id)!;
    while (left > 0) {
      const n = Math.min(left, STACK);
      slots[i] = { id, n };
      i += 1;
      left -= n;
    }
  }
}

/** Throws the held stack away. */
export function trashCursor(s: GameState): void {
  s.cursor = null;
}

/**
 * A running start for trying things out: every playable stage open, a wound motor driving a smelter
 * from a warehouse of raw materials, a second warehouse of parts for building any machine so far,
 * and belts and tubes for lines in the bag.
 */
export function createTestGame(seed: number): GameState {
  const s = createGame(seed);
  const store = s.nodes[0];
  // Ores, fuels and metals. This one feeds the smelter, so it holds nothing a line shouldn't carry off.
  const raw: [string, number][] = [
    ["Lm", 64], ["Ml", 64], ["Cc", 64], ["Ls", 64], ["Kn", 64], ["Lg", 64], ["Bt", 64], ["coke", 64], ["iron", 64], ["copper", 64], ["steel", 32], ["brick", 64],
  ];
  // Building parts: enough for a few of each S0 to S1-3 machine, and the steam engine's pieces.
  const parts: [string, number][] = [
    ["iron_plate", 64], ["copper_tube", 64], ["iron_rod", 64], ["iron_rivet", 64], ["iron_gear", 32], ["iron_spring", 16],
    ["iron_cylinder", 16], ["iron_fan", 4], ["iron_drum", 4], ["boiler", 4], ["steam_engine_unit", 4], ["steam_module", 4],
    ["bloom", 8],
  ];
  // Line materials, one layer each: belts for items, tubes for fluids, rods for power.
  // They weigh 2 each, so the bag stays under its limit and the player can still walk.
  const transport: [string, number][] = [["iron_belt", 16], ["iron_tube", 8], ["iron_rod", 8]];
  raw.forEach(([id, n], i) => {
    store.store[i] = { id, n };
  });
  const depot = newWarehouse(s, 40, 360);
  s.nodes.push(depot);
  parts.forEach(([id, n], i) => {
    depot.store[i] = { id, n };
  });
  // Lines are paid from the bag, so these go in the player's inventory.
  for (const [id, n] of transport) addTo(s.inv, id, n);
  s.stage = PLAYABLE_STAGES - 1;
  // Two of every machine open so far, built and ready to install, in machine warehouses of their own.
  const machines = machinesAt(s.stage);
  for (let i = 0; i < machines.length; i += WARE_SLOTS) {
    const shelf = newWarehouse(s, 40, 520 + (i / WARE_SLOTS) * 160);
    s.nodes.push(shelf);
    machines.slice(i, i + WARE_SLOTS).forEach((type, j) => {
      shelf.store[j] = { id: type, n: 2 };
    });
  }
  addRivers(s);
  addLaterVeins(s);
  for (const bank of riverBanks(seed)) reveal(s, bank, REVEAL);
  nameRivers(s);
  // The workbench moves aside for a construction bench, which makes everything from S1-1 on.
  const workbench = s.nodes.find((n) => n.type === WORKBENCH)!;
  workbench.x = 780;
  workbench.y = 40;
  placeMachine(s, CONSTRUCTION, 40, 40);
  const motor = placeMachine(s, MOTOR, 300, 40)!;
  motor.energy = SPRING_MAX;
  const smelter = placeMachine(s, "smelter", 300, 200)!;
  // The motor runs a belt drive, and the drive runs the warehouse's belt network.
  const drive = placeMachine(s, BELT_DRIVE, 540, 40)!;
  connect(s, motor.id, drive.id, POWER);
  connect(s, drive.id, store.id, DRIVE);
  connect(s, store.id, smelter.id, ALL);
  connect(s, smelter.id, store.id, MAIN);
  connect(s, smelter.id, store.id, BYPRODUCT);
  return s;
}

/** Eats one of an inventory stack. Full players don't waste food. */
export function eat(s: GameState, slot: number): boolean {
  const stack = s.inv[slot];
  const effect = stack && foodEffect(stack.id);
  if (!stack || !effect) return false;
  if (s.hunger >= MAX_VITAL && (s.hp >= MAX_VITAL || !effect.hp)) return false;
  s.hunger = Math.min(MAX_VITAL, s.hunger + effect.hunger);
  s.hp = Math.min(MAX_VITAL, s.hp + effect.hp);
  stack.n -= 1;
  if (!stack.n) s.inv[slot] = null;
  return true;
}

/** Advances the world by one fixed step. */
export function step(s: GameState): void {
  s.time += STEP_MS;
  walk(s);
  // Walking off cancels prospecting; standing still for long enough finishes it.
  if (s.probe !== null && s.path.length) s.probe = null;
  if (s.probe !== null && s.time - s.probe >= CAVES.probeMs) finishProbe(s);
  if (s.cave !== null) creatures(s);
  survive(s);
  turnSeason(s);
  if (s.time % SPRING_LEAK_MS === 0) leakForce(s);
  if (s.time % RIVER.regenMs === 0) refillRivers(s);
  const nodes = new Map(s.nodes.map((n) => [n.id, n]));
  const direct = powerLines(s, nodes);
  const drives = new Map<number, GameNode[]>();
  for (const id of direct.keys()) drives.set(id, sourcesOf(direct, id));
  supplyPower(s, drives);
  runBelts(s);
  s.nodes.forEach((node) => runMachine(s, node));
  // Least recently served first, so lines leaving one machine share its output evenly.
  [...s.lines].sort((a, b) => a.lastMoved - b.lastMoved).forEach((line) => runLine(s, line, nodes));
}

