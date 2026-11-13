// Game rules. Plain data in, plain data out, no DOM, so saves are just JSON.
// This module holds a new game, the step, walking and sight, seasons and survival. The rest lives in the modules
// re-exported below, so everything is still imported from here.
import { advanceTutorial, newTutorial } from "./tutorial";
import { regrows, BIOMES, Biome, WORKBENCH, CAVE, CAVES, PLAYABLE_STAGES, laterOres, RIVER, STAGES, WAREHOUSE, WATER, forageSeasons } from "../content";
import { BASE, CELL_ASPECT, CHUNK, Point, Site, cellsOf, cellInChunk, layerOf, chunkKey, chunkOf, chunkSites, generateSites, laterVeins, linePath, nearCave, riverBanks, safePath, terrain, biomeAt } from "./world";
import { SAVE_VERSION, SPRING_LEAK_MS, INV_SLOTS, WARE_SLOTS, STEP_MS, REVEAL, SIGHT_AROUND, FAN_DEGREES, CAVE_DARK, BASE_REVEAL, SEASON_NAMES, SEASON_MS, MAX_VITAL, Stack, GameNode, GameState, emptySlots, HurtCause, Hazard } from "./state";
import { rockAt, revealUnder, finishProbe } from "./under";
import { steps8, creatures, surfaceLife } from "./creatures";
import { HARVEST, harvestKind, digOn, gatherSpot, eatOn } from "./gather";
import { overloaded, walkTime, stowCursor } from "./inventory";
import { foundRivers, placeMachine, runMachine, leakForce } from "./machines";
import { supplyPower, sourcesOf, powerLines, runBelts, runLine } from "./lines";

export * from "./state";
export * from "./under";
export * from "./creatures";
export * from "./gather";
export * from "./inventory";
export * from "./machines";
export * from "./lines";
export * from "./save";
export * from "./testGames";

/** How often the tutorial checks whether its step is done, in ms. */
const TUTORIAL_MS = 500;
/** The index of winter in the year. */
const WINTER = 3;
const HUNGER_MS = 6000;
const STARVE_MS = 3000;
const HEAL_MS = 5000;
const HEAL_ABOVE = 50;
const WAKE_VITAL = 50;
/** Health lost by stepping on dangerous ground. */
const WATER_DAMAGE = 3;
const MAX_LOSS = 0.6;
/** Distance at which a collapse costs all of MAX_LOSS. */
const LOSS_RANGE = 120;

/** Three letters and digits, like 0a1. Each machine gets its own, and none is reused. */
export function nextCode(s: GameState): string {
  s.built.all = (s.built.all ?? 0) + 1;
  return ((s.built.all * 7919 + 1300) % 46656).toString(36).padStart(3, "0");
}

export function newWarehouse(s: GameState, x: number, y: number): GameNode {
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
    z: 0,
    underSeen: {},
    probe: null,
    mobs: [],
    corpses: [],
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
    tutorial: newTutorial(),
  };
  state.nodes.push(newWarehouse(state, 40, 200));
  // Every machine is made here, so the game starts with one already standing.
  placeMachine(state, WORKBENCH, 40, 40);
  addNearCave(state);
  // Water shows from the start like everything else on the map; it is only useful once there are drums and pumps.
  addRivers(state);
  reveal(state, BASE, BASE_REVEAL);
  return state;
}

/** Every world has one cave entrance a short walk from the base. */
export function addNearCave(s: GameState): void {
  const at = nearCave(s.seed);
  if (s.sites.some((site) => site.ore === CAVE && site.x === at.x && site.y === at.y)) return;
  s.sites.push({ ...at, id: s.sites.length, ore: CAVE, total: 0, left: 0, seed: s.seed * 7 + 101 });
}

/**
 * A new site fitted among those already in the world, or null if it can't be. Cells on one layer never overlap:
 * a site whose own spot or any surface cell is taken is not placed; underground cells already taken are left off
 * it, and its total shrinks by what they held.
 */
function fitSite(s: GameState, site: Omit<Site, "id">): Omit<Site, "id"> | null {
  const reach = CHUNK * 2;
  const used = new Set<string>();
  for (const other of s.sites) {
    if (Math.abs(other.x - site.x) > reach || Math.abs(other.y - site.y) > reach) continue;
    for (const c of cellsOf(other)) used.add(`${layerOf(c)},${c.x},${c.y}`);
  }
  const taken = (c: { x: number; y: number; z?: number }) => used.has(`${layerOf(c)},${c.x},${c.y}`);
  if (taken({ x: site.x, y: site.y, z: site.z })) return null;
  if (!site.cells) return site;
  if (site.cells.some((c) => layerOf(c) === 0 && taken(c))) return null;
  if (!site.cells.some(taken)) return site;
  const cells = site.cells.filter((c) => !taken(c));
  const total = cells.reduce((n, c) => n + (c.total ?? c.left), 0);
  return { ...site, cells, total, left: cells.reduce((n, c) => n + c.left, 0) };
}

export function addSite(s: GameState, site: Omit<Site, "id">): void {
  const fitted = fitSite(s, site);
  if (fitted) s.sites.push({ ...fitted, id: s.sites.length });
}

export function addChunkSites(state: GameState, x: number, y: number): void {
  for (const site of chunkSites(state.seed, chunkOf(x), chunkOf(y), laterOres(state.stage))) addSite(state, site);
}

/** Calls `visit` for every cell in sight from a point (see `inSight`). */
export function forSight(at: Point, facing: Point | null | undefined, around: number, reach: number, visit: (x: number, y: number) => void): void {
  const rows = Math.ceil(reach * CELL_ASPECT);
  for (let y = at.y - rows; y <= at.y + rows; y += 1) {
    for (let x = at.x - reach; x <= at.x + reach; x += 1) if (inSight(at, facing, around, reach, x, y)) visit(x, y);
  }
}

/** Marks surface cells in sight from a point as known. A chunk's sites are laid out the first time it is seen. */
/**
 * Lights a way across the map: every cell within `width` of the straight line from one point to another, as if
 * the player had walked it. For the tutorial, which shows the way from the base to the clay it promises.
 */
export function revealWay(s: GameState, from: Point, to: Point, width = 1): void {
  for (const at of [from, ...linePath(from, to)]) reveal(s, at, width);
  reveal(s, to, width + 1);
}

export function reveal(state: GameState, at: Point, around: number, reach: number = around, facing: Point | null = null): void {
  forSight(at, facing, around, reach, (x, y) => {
    const key = chunkKey(x, y);
    if (!state.revealed[key]) {
      state.revealed[key] = new Array(CHUNK * CHUNK).fill(0);
      addChunkSites(state, x, y);
    }
    state.revealed[key][cellInChunk(x, y)] = 1;
  });
}

export const atBase = (s: GameState): boolean => s.z === 0 && s.player.x === BASE.x && s.player.y === BASE.y && !s.path.length;
export const nodeById = (s: GameState, id: number): GameNode | undefined => s.nodes.find((n) => n.id === id);
export const isRevealed = (s: GameState, x: number, y: number): boolean => s.revealed[chunkKey(x, y)]?.[cellInChunk(x, y)] === 1;

/** The rules of the biome the player stands in. Underground there are none. */
export const biomeRules = (s: GameState): NonNullable<Biome["rules"]> =>
  s.z === 0 ? BIOMES[biomeAt(s.player.x, s.player.y, s.seed)].rules ?? {} : {};

/** How far the fan of sight reaches: higher ground sees further, a forest less, and underground CAVE_DARK less. */
export const visionAt = (s: GameState, at: Point): number =>
  s.z < 0
    ? Math.max(1, REVEAL - CAVE_DARK)
    : Math.max(1, REVEAL + terrain(at.x, at.y, s.seed)[2] * 2 + (BIOMES[biomeAt(at.x, at.y, s.seed)].rules?.vision ?? 0));

/** How far the player sees all round, and how far the fan ahead reaches, from a point on their layer. */
export const sightOf = (s: GameState, at: Point): [number, number] => {
  const reach = visionAt(s, at);
  return [Math.min(reach, s.z < 0 ? SIGHT_AROUND.under : SIGHT_AROUND.surface), reach];
};

/**
 * Whether a cell lies in sight from a point: within the small circle all round, or within the fan that opens
 * the way the player is facing. With no facing yet, the fan's reach goes all round.
 */
function inSight(at: Point, facing: Point | null | undefined, around: number, reach: number, x: number, y: number): boolean {
  const dx = x - at.x;
  const dy = (y - at.y) / CELL_ASPECT;
  const d = Math.hypot(dx, dy);
  if (d <= (facing ? around : reach)) return true;
  if (!facing || d > reach) return false;
  const turn = Math.atan2(dy, dx) - Math.atan2(facing.y / CELL_ASPECT, facing.x);
  return Math.abs(Math.atan2(Math.sin(turn), Math.cos(turn))) <= (FAN_DEGREES / 2) * (Math.PI / 180);
}

/** Whether the player can see a cell right now, rather than remember it. */
export const isVisible = (s: GameState, x: number, y: number): boolean =>
  inSight(s.player, s.facing, ...sightOf(s, s.player), x, y);

export const isWeak = (s: GameState): boolean => s.time < s.weakUntil;

/**
 * What one step on the surface costs: going into water hurts; on land, climbing or coming down hurts by how much
 * the height changes, so walking along a ridge costs nothing. Ore covering the ground, and the base, are safe footing.
 */
/**
 * What a step on the surface costs. Every cell is ground of a height, and a vein, tree, outcrop or patch on it
 * is something lying on that ground: it doesn't flatten it, so climbing onto a vein high on a hill costs the same
 * as climbing onto the bare hill.
 */
function stepDamage(s: GameState, from: Point, to: Point): number {
  if (to.x === BASE.x && to.y === BASE.y) return 0;
  const [, kind, height] = terrain(to.x, to.y, s.seed);
  if (kind === "t-water") return WATER_DAMAGE;
  return Math.abs(height - terrain(from.x, from.y, s.seed)[2]);
}

/**
 * The most a single step may climb or drop on the surface. Ground MAX_CLIMB + 1 or more higher or lower than the
 * cell the player stands on cannot be walked onto at all, as things are; a step of MAX_CLIMB costs health instead.
 */
export const MAX_CLIMB = 1;

/** Whether a step on the surface is too steep to take: a change of height over MAX_CLIMB. */
export function tooSteep(s: GameState, from: Point, to: Point): boolean {
  if (s.z < 0) return false;
  const here = terrain(from.x, from.y, s.seed)[2];
  const steep = (x: number, y: number) => Math.abs(terrain(x, y, s.seed)[2] - here) > MAX_CLIMB;
  if (!steep(to.x, to.y)) return false;
  // Never a trap: on a cell with no gentler way off (a stair coming up on a peak, say), any step is allowed.
  for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) if ((dx || dy) && !steep(from.x + dx, from.y + dy)) return true;
  return false;
}

/** What a step would cost, as far as the player knows. Unseen ground looks safe. */
function knownDamage(s: GameState, from: Point, to: Point): number {
  // Underground the danger moves about, so no cell is known to hurt.
  if (s.z < 0 || !isRevealed(s, to.x, to.y)) return 0;
  return stepDamage(s, from, to);
}

/** What a hazard one step ahead is called: water or a change of height, and what the step would cost. */
function hazardOf(s: GameState, from: Point, to: Point): Hazard | null {
  const damage = knownDamage(s, from, to);
  if (!damage) return null;
  const [, kind, height] = terrain(to.x, to.y, s.seed);
  return { x: to.x, y: to.y, damage, kind: kind === "t-water" ? "water" : "hill", height };
}

function routeTo(s: GameState, target: Point): Point[] {
  // Underground the route goes round rock. On the surface the player walks straight; safe mode stops at hazards instead.
  if (s.z < 0) return safePath(s.player, target, () => 0, (x, y) => rockAt(s, x, y));
  return linePath(s.player, target);
}

/**
 * Starts walking. Too heavy a load keeps the player where they are. While safe mode is on, no walk goes
 * into a known hazard, asked for however often: the player turns it off to cross.
 */
export function walkTo(s: GameState, target: Point): boolean {
  if (overloaded(s)) return false;
  s.halt = null;
  s.path = routeTo(s, target);
  s.walkTimer = 0;
  return true;
}

/**
 * One step in a direction, for walking with the keyboard. It replaces any walk in progress
 * but keeps the step already under way, so holding a key moves at the normal pace.
 */
/** Turns the player to face a direction, and the fan of sight swings round with them. Says whether they turned. */
export function face(s: GameState, dx: number, dy: number): boolean {
  const [sx, sy] = [Math.sign(dx), Math.sign(dy)];
  if ((!sx && !sy) || (s.facing?.x === sx && s.facing?.y === sy)) return false;
  s.facing = { x: sx, y: sy };
  if (s.z < 0) revealUnder(s, s.player, ...sightOf(s, s.player), s.facing);
  else reveal(s, s.player, ...sightOf(s, s.player), s.facing);
  return true;
}

export function walkStep(s: GameState, dx: number, dy: number): boolean {
  if (!dx && !dy) return false;
  const [sx, sy] = [Math.sign(dx), Math.sign(dy)];
  // The player turns the way they pressed even when they can't go: into rock, or too loaded to move. Turning is free.
  face(s, sx, sy);
  if (overloaded(s)) return false;
  if (s.z < 0) {
    const rock = (x: number, y: number) => rockAt(s, x, y);
    const { x, y } = s.player;
    if (rock(x + sx, y + sy) || (sx && sy && (rock(x + sx, y) || rock(x, y + sy)))) return false;
  }
  const next = { x: s.player.x + sx, y: s.player.y + sy };
  s.halt = null;
  s.path = [next];
  return true;
}

/** Turns safe mode on or off: with it on, a walk stops short of a known hazard and says what it is. */
export function setSafeWalk(s: GameState, on: boolean): void {
  s.safeWalk = on;
  s.halt = null;
}

/** Which year it is, counting from 1. A year is four seasons. */
export const yearAt = (time: number): number => Math.floor(time / (SEASON_MS * SEASON_NAMES.length)) + 1;

export const seasonAt = (time: number): number => Math.floor(time / SEASON_MS) % SEASON_NAMES.length;

/** Fills a site back toward its total. Only food and water refill, and they are single cells, so there are no shares to fill. */
function refillSite(site: Site, upTo = site.total): void {
  site.left = Math.max(site.left, Math.min(site.total, upTo));
}

/** Food grows back as its season begins. */
function turnSeason(s: GameState): void {
  const season = seasonAt(s.time);
  if (season === s.season) return;
  s.season = season;
  for (const site of s.sites) {
    const kind = harvestKind(site);
    if (kind && HARVEST[kind].refill === "season" && forageSeasons(site.ore)?.includes(season)) refillSite(site);
    // A felled tree grows back by the next season; stone never comes back.
    else if (regrows(site.ore)) refillSite(site);
  }
}

/** Riverbanks open with the steam stage. Their water is only ever pumped. */
export function addRivers(s: GameState): void {
  for (const bank of riverBanks(s.seed)) {
    if (s.sites.some((site) => site.x === bank.x && site.y === bank.y)) continue;
    s.sites.push({ ...bank, id: s.sites.length, ore: WATER, total: RIVER.reserve, left: RIVER.reserve, seed: s.seed });
  }
  nameRivers(s);
}

/** New ores appear around the base when their stage opens. */
export function addLaterVeins(s: GameState): void {
  for (const ore of laterOres(s.stage)) {
    if (s.sites.some((site) => site.ore === ore)) continue;
    for (const vein of laterVeins(s.seed, ore)) addSite(s, vein);
  }
}

/** A riverbank gets its code once the player has found it. It stays on the map, not on the board. */
export function nameRivers(s: GameState): void {
  for (const site of foundRivers(s)) site.code ??= nextCode(s);
}

/** Water seeps back into a riverbank or pond, a little at a time. */
function refillRivers(s: GameState): void {
  for (const site of s.sites) {
    const kind = harvestKind(site);
    if (kind && HARVEST[kind].refill === "tick") refillSite(site, site.left + 1);
  }
}

/** What counts toward the current goal: only what was made since its stage opened. */
export const goalMade = (s: GameState): number => (s.made[STAGES[Math.min(s.stage, STAGES.length - 1)].goal.item] ?? 0) - (s.goalBase ?? 0);

/** Finishes the stage once its goal item has been made. The items stay with the player. */
export function checkGoal(s: GameState): void {
  if (s.stage >= PLAYABLE_STAGES) return;
  const stage = STAGES[s.stage];
  if (goalMade(s) < stage.goal.amount) return;
  s.announced = stage.id;
  s.stage += 1;
  // The next goal counts from here, so nothing made ahead of time fills it.
  const next = STAGES[Math.min(s.stage, STAGES.length - 1)].goal.item;
  s.goalBase = s.made[next] ?? 0;
  addRivers(s);
  addLaterVeins(s);
}

/**
 * Walking runs on a finer clock than the rest of the world. On STEP_MS alone a 150 ms step could only land on
 * whole tenths of a second, so steps went 0.2 s, 0.1 s, 0.2 s… and the pace stuttered on even ground.
 */
export const WALK_TICK = 25;

/** Moves the player on by ms of walking. The game loop calls it every WALK_TICK and steps the world without walking. */
export function walk(s: GameState, ms: number): void {
  if (!s.path.length) return;
  s.walkTimer += ms;
  if (s.walkTimer < walkTime(s)) return;
  // What runs over carries into the next step, so a step takes what walkTime says on average, not the next whole
  // STEP_MS above it (0.15 s used to walk at 0.2 s, and 0.21 s at 0.3 s).
  s.walkTimer -= walkTime(s);
  // A creature in the way stops the walk; there's no walking through it.
  if (s.mobs.some((mob) => mob.x === s.path[0].x && mob.y === s.path[0].y)) {
    s.path = [];
    return;
  }
  // Too steep to climb or drop at all: the walk stops in front of it, safe mode or not.
  if (tooSteep(s, s.player, s.path[0])) {
    s.steep = { ...s.path[0] };
    s.facing = { x: Math.sign(s.path[0].x - s.player.x), y: Math.sign(s.path[0].y - s.player.y) };
    s.path = [];
    return;
  }
  s.steep = null;
  // Safe mode stops short of a hazard the player knows of, and says what it is, every time until it is off.
  const ahead = s.safeWalk ? hazardOf(s, s.player, s.path[0]) : null;
  if (ahead) {
    s.halt = { ...ahead, target: s.path.at(-1)! };
    // The tutorial's safe step asks to be stopped once; it is noted here, as the stop may not last.
    if (s.tutorial) s.tutorial.halted = true;
    s.path = [];
    return;
  }
  const next = s.path.shift()!;
  const from = s.player;
  // The way the player walks is the way they look: the fan of sight opens ahead.
  s.facing = { x: Math.sign(next.x - from.x), y: Math.sign(next.y - from.y) };
  s.player = next;
  // A new cell: what was picked to gather there is forgotten.
  s.picked = null;
  if (s.z < 0) {
    revealUnder(s, s.player, ...sightOf(s, s.player), s.facing);
    return;
  }
  const cost = stepDamage(s, from, next);
  reveal(s, s.player, ...sightOf(s, s.player), s.facing);
  nameRivers(s);
  gatherSpot(s);
  if (cost) hurt(s, cost, terrain(next.x, next.y, s.seed)[1] === "t-water" ? "water" : "hill");
}

export function hurt(s: GameState, amount: number, cause: HurtCause): void {
  s.hurtBy = cause;
  s.hp -= amount;
  s.probe = null;
  if (s.hp <= 0) collapse(s);
}

/** The player wakes at the base, having dropped part of what they carried. */
function collapse(s: GameState): void {
  stowCursor(s);
  // The further from home, the more is dropped. At the base nothing is.
  // Underground, the way home runs up the stair that makes it shortest.
  const stairs = s.z < 0 ? s.sites.filter((site) => site.ore === CAVE) : [];
  const steps = stairs.length ? Math.min(...stairs.map((st) => steps8(s.player, st) + steps8(st, BASE))) : steps8(s.player, BASE);
  s.z = 0;
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
  // A desert makes the player hungry faster, and the snow does in winter.
  const rules = biomeRules(s);
  s.hungerTimer += STEP_MS * (rules.hunger ?? 1) * (s.season === WINTER ? rules.winterHunger ?? 1 : 1);
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
  if (starving) hurt(s, 1, "hunger");
  else s.hp += 1;
}

/** Advances the world by one fixed step. */
/** One STEP_MS of the world. walkMs 0 leaves walking to the caller's finer clock (see WALK_TICK). */
export function step(s: GameState, walkMs = STEP_MS): void {
  s.time += STEP_MS;
  if (walkMs) walk(s, walkMs);
  // Walking off cancels prospecting; standing still for long enough finishes it.
  if (s.probe !== null && s.path.length) s.probe = null;
  digOn(s);
  eatOn(s);
  if (s.probe !== null && s.time - s.probe >= CAVES.probeMs) finishProbe(s);
  if (s.z < 0) creatures(s);
  else surfaceLife(s);
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
  if (s.time % TUTORIAL_MS === 0) advanceTutorial(s);
}
