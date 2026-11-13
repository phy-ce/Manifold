// Gathering by hand: what is underfoot and which one is picked, veins and their cells, digging, picking and
// filling, cutting up carcasses, and eating.
import { FORAGE, Job, ToolStats, digBaseMs, gatherSize, DEER, CAVE, DRUM, WATER, foodEffect, EAT_MS, forageSeasons, itemWeight } from "../content";
import { AROUND, CELL_ASPECT, Point, Site, VeinCell, cellsOf, hash, layerOf, rngFrom, groundGather } from "./world";
import { STEP_MS, MAX_VITAL, Stack, GameState, Corpse } from "./state";
import { underSeenAt, rockAt, makeNoise } from "./under";
import { corpsesHere } from "./creatures";
import { heldTools, wearTool, carried, carryLimit, addTo, bagRoom } from "./inventory";
import { addSite, isRevealed } from "./game";

/** What a carcass can be cut into, with the odds of each: meat most, then bone and hide, antler seldom. */
export const butcherChances = (): [string, number][] => {
  const total = Object.values(DEER.butcher.chance).reduce((a, b) => a + b, 0);
  return Object.entries(DEER.butcher.chance).map(([id, w]) => [id, w / total]);
};

/** One cut's item, drawn by the weights from a roll in 0..1. */
function cutOf(roll: number): string {
  let left = roll;
  for (const [id, share] of butcherChances()) {
    if (left < share) return id;
    left -= share;
  }
  return Object.keys(DEER.butcher.chance)[0];
}

// ---- What can be gathered underfoot: a vein, tree, patch or bank, and any carcasses. One shows at once; two or
// more are listed first, and the player picks which to work.

/** One thing on the ground to gather: a site, or a carcass. `key` names it for picking. */
export interface Gather {
  key: string;
  site?: Site;
  corpse?: Corpse;
}

/** Everything underfoot that can be gathered, the site first, then carcasses oldest first. Nothing while walking. */
export function gathersHere(s: GameState): Gather[] {
  if (s.path.length) return [];
  const site = (veinTarget(s) ?? veinCellAt(s, s.player.x, s.player.y))?.site;
  const list: Gather[] = site ? [{ key: `site:${site.id}`, site }] : [];
  for (const corpse of corpsesHere(s)) list.push({ key: `corpse:${corpse.id}`, corpse });
  return list;
}

/** The one being gathered: the only thing here, or the one picked from several. Nothing if none is picked yet. */
export function chosenGather(s: GameState): Gather | undefined {
  const list = gathersHere(s);
  return list.length === 1 ? list[0] : list.find((g) => g.key === s.picked);
}

/** Picks one of several things underfoot to gather, or goes back to the list with null. */
export function pickGather(s: GameState, key: string | null): void {
  s.picked = key;
  s.dig = null;
}

/** Whether a carcass here is in the way of working the site: there is one, and the site isn't the one picked. */
const siteNotChosen = (s: GameState): boolean => !!corpsesHere(s).length && !chosenGather(s)?.site;

/** Starts cutting the carcass picked: one cut a dig, with a blade quicker. */
function startButcher(s: GameState, corpse: Corpse): boolean {
  const ids = Object.keys(DEER.butcher.chance);
  // Any cut might come up, so the heaviest has to be carryable and something has to fit.
  if (carried(s) + Math.max(...ids.map(itemWeight)) > carryLimit(s)) {
    noteBlocked(s, "heavy");
    return false;
  }
  if (!ids.some((id) => bagRoom(s, id) > 0)) {
    noteBlocked(s, "full");
    return false;
  }
  s.dig = { x: corpse.x, y: corpse.y, z: corpse.z, done: 0, ms: Math.round(digBaseMs("butcher") / digSpeed(s, "butcher")), corpse: corpse.id };
  s.probe = null;
  return true;
}

/** A cut done: one item by chance into the bag, the carcass one cut less, gone at none. */
function finishCut(s: GameState, corpse: Corpse): void {
  const rng = rngFrom(Math.imul(s.seed + 31, 2654435761) ^ Math.imul(corpse.id, 97) ^ Math.floor(s.time / 100));
  const id = cutOf(rng());
  if (bagRoom(s, id) < 1 || carried(s) + itemWeight(id) > carryLimit(s)) {
    noteBlocked(s, bagRoom(s, id) < 1 ? "full" : "heavy");
    return;
  }
  addTo(s.inv, id, 1);
  corpse.left -= 1;
  if (corpse.left <= 0) s.corpses = (s.corpses ?? []).filter((c) => c !== corpse);
  s.drop = { got: { [id]: 1 }, at: s.time };
  s.dug = { x: corpse.x, y: corpse.y, at: s.time };
  const tool = toolFor(s, "butcher");
  if (tool) wearTool(s, tool.hand);
}

/** A vein cell and the site it belongs to. For a site without cells, the cell is a stand-in. */
export interface VeinSpot {
  site: Site;
  cell: VeinCell;
}

/** Whether the player knows of a cell: surface cells always, underground cells once prospecting found them. Buried ones never show. */
const cellKnown = (cell: VeinCell): boolean => layerOf(cell) === 0 || (!!cell.found && !cell.buried);

/**
 * Whether a cell can be worked at all now. This is the one place that says so: today ore set deep in rock
 * is out of reach, and boring into rock, when it comes, opens it here.
 */
export const workable = (_s: GameState, cell: VeinCell): boolean => !cell.buried;

/** The known vein cell at a place on the layer the player is on, if any. Cave entrances aren't veins. */
export function veinCellAt(s: GameState, x: number, y: number): VeinSpot | undefined {
  for (const site of s.sites) {
    if (site.ore === CAVE) continue;
    const cell = cellsOf(site).find((c) => c.x === x && c.y === y && layerOf(c) === s.z);
    if (cell && cellKnown(cell)) return { site, cell };
  }
  return undefined;
}

/**
 * The vein cell an action works now: the one underfoot if it has anything left; otherwise, underground, a
 * wall cell beside the player that does, straight neighbours before diagonal ones. Nothing while walking.
 */
export function harvestTarget(s: GameState): VeinSpot | undefined {
  // With a carcass here too, the vein waits until it is the one picked.
  return siteNotChosen(s) ? undefined : veinTarget(s);
}

/** The vein cell an action would work, whatever else lies here. */
function veinTarget(s: GameState): VeinSpot | undefined {
  if (s.path.length) return undefined;
  const ready = (spot: VeinSpot | undefined) => !!spot && spot.cell.left > 0 && workable(s, spot.cell);
  const here = veinCellAt(s, s.player.x, s.player.y);
  if (ready(here)) return here;
  if (s.z === 0) return undefined;
  for (const [dx, dy] of AROUND) {
    const beside = veinCellAt(s, s.player.x + dx, s.player.y + dy);
    if (beside?.cell.wall && ready(beside)) return beside;
  }
  return undefined;
}

/** The vein the player is at: the one an action would work, or else the one whose cell is underfoot, even emptied. */
export function siteHere(s: GameState): Site | undefined {
  if (s.path.length || siteNotChosen(s)) return undefined;
  return (harvestTarget(s) ?? veinCellAt(s, s.player.x, s.player.y))?.site;
}

/** Whether the player has seen a vein cell: on the surface, ground they have looked at; underground, cells prospecting found. Buried ones never. */
const cellSeen = (s: GameState, cell: VeinCell): boolean =>
  layerOf(cell) < 0 ? !!cell.found && !cell.buried : isRevealed(s, cell.x, cell.y);

/**
 * How much a vein holds as far as the player knows it: what is left and what there was, counting only the cells
 * they have seen, on the surface and underground alike. A vein seen in part is counted in part; the rest adds in
 * as it is found.
 */
export function knownReserve(s: GameState, site: Site): { left: number; total: number } {
  const seen = cellsOf(site).filter((cell) => !site.cells || cellSeen(s, cell));
  return {
    left: seen.reduce((n, cell) => n + Math.max(0, cell.left), 0),
    total: seen.reduce((n, cell) => n + (cell.total ?? cell.left), 0),
  };
}

/**
 * The nearest cell of a vein the player could still work on the layer they are on, apart from where they
 * stand. When the cell underfoot runs out, this is where to go next.
 */
export function nextVeinCell(s: GameState, site: Site): VeinCell | undefined {
  const d = (c: VeinCell) => Math.hypot(c.x - s.player.x, (c.y - s.player.y) / CELL_ASPECT);
  return cellsOf(site)
    .filter((c) => layerOf(c) === s.z && c.left > 0 && cellKnown(c) && workable(s, c) && !(c.x === s.player.x && c.y === s.player.y))
    .sort((a, b) => d(a) - d(b))[0];
}

/** Open floor beside an underground cell, the nearest to the player: where to stand to work ore in a wall. */
export function standBeside(s: GameState, x: number, y: number): Point | undefined {
  if (s.z === 0) return undefined;
  const d = (p: Point) => Math.hypot(p.x - s.player.x, (p.y - s.player.y) / CELL_ASPECT);
  return AROUND.map(([dx, dy]) => ({ x: x + dx, y: y + dy }))
    .filter((p) => !rockAt(s, p.x, p.y))
    .sort((a, b) => d(a) - d(b))[0];
}


/**
 * Whether the player knows a site on the layer they are on: on the surface every site is (search still asks
 * whether its spot has been seen); underground, a stair once its cell has been seen, and a vein once prospecting
 * has found a cell of it there that is not buried.
 */
export const onThisMap = (s: GameState, site: Site): boolean => {
  if (s.z === 0) return (site.z ?? 0) === 0;
  if (site.ore === CAVE) return underSeenAt(s, site.x, site.y);
  return !!site.cells?.some((c) => layerOf(c) === s.z && cellKnown(c));
};

/**
 * Where a site is on the layer the player is on: its own spot when it lies there, else the nearest of its known
 * cells there. Undefined when it isn't known on this layer.
 */
export function siteSpotHere(s: GameState, site: Site): VeinCell | Point | undefined {
  if (!onThisMap(s, site)) return undefined;
  // A cave entrance is the same cell on both layers: a stair underground.
  if ((site.z ?? 0) === s.z || site.ore === CAVE) return { x: site.x, y: site.y };
  const d = (c: VeinCell) => Math.hypot(c.x - s.player.x, (c.y - s.player.y) / CELL_ASPECT);
  return cellsOf(site).filter((c) => layerOf(c) === s.z && cellKnown(c)).sort((a, b) => d(a) - d(b))[0];
}

// ---- Harvesting: digging ore, picking food and filling a drum at water are one action with three kinds.

type HarvestKindId = "ore" | "forage" | "water";
interface HarvestKind {
  /** Whether it can be worked now, apart from having enough left. */
  ready: (s: GameState, site: Site) => boolean;
  /** How much one action takes from the cell. */
  takes: number;
  /** Hands the player what one action gives; false if it can't be carried, and then nothing changes. */
  give: (s: GameState, site: Site) => boolean;
  /** The weight one action adds to the load. */
  adds: (site: Site) => number;
  /** When what was taken comes back: food as its season starts, water a little at a time, ore never. */
  refill?: "season" | "tick";
  /** Digging is heard underground. */
  noisy?: boolean;
}

/** Gives one of the site's own item, if the player can carry it. */
const giveOne = (s: GameState, site: Site): boolean =>
  carried(s) + itemWeight(site.ore) <= carryLimit(s) && addTo(s.inv, site.ore, 1) === 1;

const ownWeight = (site: Site): number => itemWeight(site.ore);

export const HARVEST: Record<HarvestKindId, HarvestKind> = {
  ore: { ready: () => true, takes: 1, give: giveOne, adds: ownWeight, noisy: true },
  forage: { ready: (s, site) => inSeason(s, site), takes: 1, give: giveOne, adds: ownWeight, refill: "season" },
  water: { ready: (s) => holdsEmptyDrum(s), takes: DRUM.liters, give: drumFromWater, adds: () => itemWeight(DRUM.fills[WATER]) - itemWeight(DRUM.empty), refill: "tick" },
};

/** Whether the only thing stopping the next dig, pick or fill is the load: one more would be too heavy to carry. */
export function tooHeavyToWork(s: GameState): boolean {
  const spot = harvestTarget(s);
  const kind = spot && harvestKind(spot.site);
  return !!spot && !!kind && canWork(s, spot) && carried(s) + HARVEST[kind].adds(spot.site) > carryLimit(s);
}

/** Why what the next dig or pick brings up couldn't be carried: too heavy, or no room in the bag. Null if it could. */
export function cantCarry(s: GameState): "heavy" | "full" | null {
  if (tooHeavyToWork(s)) return "heavy";
  const spot = harvestTarget(s);
  const kind = spot && harvestKind(spot.site);
  if (!spot || (kind !== "ore" && kind !== "forage") || !canWork(s, spot)) return null;
  return bagRoom(s, spot.site.ore) < 1 ? "full" : null;
}

/** Notes that carrying stopped the player, for the screen to say; held keys repeat, so once a second at most. */
function noteBlocked(s: GameState, why: "heavy" | "full"): void {
  if (s.blocked?.why === why && s.time - s.blocked.at < 1000) return;
  s.blocked = { why, at: s.time };
}

export const harvestKind = (site: Site): HarvestKindId | null =>
  site.ore === CAVE ? null : site.ore === WATER ? "water" : FORAGE.includes(site.ore) ? "forage" : "ore";

const inSeason = (s: GameState, site: Site): boolean => forageSeasons(site.ore)?.includes(s.season) ?? true;
const holdsEmptyDrum = (s: GameState): boolean => s.cursor?.id === DRUM.empty || s.inv.some((slot) => slot?.id === DRUM.empty);

/** Seasonal food can only be picked in its season. Ore is always there. Water is filled, not harvested. */
export function canHarvest(s: GameState, site: Site): boolean {
  const kind = harvestKind(site);
  return (kind === "ore" || kind === "forage") && HARVEST[kind].ready(s, site);
}

/** Whether the player can fill a drum here by hand: a riverbank with a drum's worth of water, and an empty drum in hand or bag. */
export function canScoop(s: GameState, site: Site): boolean {
  return harvestKind(site) === "water" && site.left >= DRUM.liters && holdsEmptyDrum(s);
}

/** Whether the action would do something at this vein cell now, carrying aside. */
export function canWork(s: GameState, spot: VeinSpot): boolean {
  const kind = harvestKind(spot.site);
  return !!kind && workable(s, spot.cell) && spot.cell.left >= HARVEST[kind].takes && HARVEST[kind].ready(s, spot.site);
}

/**
 * Swaps one empty drum for a full one of water, the one in hand first. The full drum goes in the bag, or
 * into an empty hand. Nothing happens if it would be too heavy to carry or there is nowhere to put it.
 */
function drumFromWater(s: GameState): boolean {
  const full = DRUM.fills[WATER];
  if (!full || !holdsEmptyDrum(s)) return false;
  if (carried(s) + itemWeight(full) - itemWeight(DRUM.empty) > carryLimit(s)) return false;
  const fromHand = s.cursor?.id === DRUM.empty;
  const slot = fromHand ? -1 : s.inv.findIndex((stack) => stack?.id === DRUM.empty);
  const take = (n: number) => {
    const stack = fromHand ? s.cursor! : s.inv[slot]!;
    stack.n += n;
    if (stack.n <= 0) {
      if (fromHand) s.cursor = null;
      else s.inv[slot] = null;
    }
  };
  take(-1);
  if (!addTo(s.inv, full, 1)) {
    if (s.cursor) {
      // Put the empty drum back where it was.
      if (fromHand) s.cursor.n += 1;
      else if (s.inv[slot]) s.inv[slot]!.n += 1;
      else s.inv[slot] = { id: DRUM.empty, n: 1 };
      return false;
    }
    s.cursor = { id: full, n: 1 };
  }
  return true;
}

/** Takes from one cell of a site. The site's own count is the sum of its cells, so it goes down too. */
function takeFrom(spot: VeinSpot, n: number): void {
  if (spot.site.cells) spot.cell.left -= n;
  spot.site.left -= n;
}

/**
 * The one action at a vein: dig ore, pick food or fill a drum, from the cell `harvestTarget` picks. One
 * action always takes one ore or one food, whatever the player wears.
 */
export function mine(s: GameState): boolean {
  const spot = harvestTarget(s);
  if (!spot || !canWork(s, spot)) return false;
  const kind = HARVEST[harvestKind(spot.site)!];
  s.probe = null;
  if (!kind.give(s, spot.site)) return false;
  takeFrom(spot, kind.takes);
  if (kind.noisy) makeNoise(s);
  return true;
}

/** What working a site asks of the hands: ore and stone want a pick, felling and picking food an axe. */
export function jobOf(site: Site): Job {
  const kind = harvestKind(site);
  return kind === "water" ? "water" : kind === "forage" ? "forage" : site.ore === "wood" ? "wood" : "ore";
}

/** The held tool made for a job, the quickest if both hands have one. */
export function toolFor(s: GameState, job: Job): { hand: string; stack: Stack; stats: ToolStats } | undefined {
  return heldTools(s).filter((t) => t.stats.jobs.includes(job)).sort((a, b) => b.stats.speed - a.stats.speed)[0];
}

/** How much faster than bare hands the player does a job: the speed of the tool for it in hand, else 1. */
export const digSpeed = (s: GameState, job: Job = "ore"): number => toolFor(s, job)?.stats.speed ?? 1;

/** How long one dig, pick or fill at a site takes: bare hands' time, divided by the right tool's speed. */
export function digTime(s: GameState, site: Site): number {
  const job = jobOf(site);
  return Math.round(digBaseMs(job) / digSpeed(s, job));
}

/**
 * Starts working the place underfoot: the dig takes digTime, and only then does one ore, food or drum come up
 * (see `mine`). False if there is nothing to work, it couldn't be carried, or one is already under way.
 */
export function startDig(s: GameState): boolean {
  if (s.dig) return false;
  const corpse = chosenGather(s)?.corpse;
  if (corpse) return startButcher(s, corpse);
  const spot = harvestTarget(s);
  if (!spot || !canWork(s, spot)) return false;
  const why = cantCarry(s);
  if (why) {
    noteBlocked(s, why);
    return false;
  }
  s.dig = { x: spot.cell.x, y: spot.cell.y, z: s.z, done: 0, ms: digTime(s, spot.site) };
  s.probe = null;
  return true;
}

/** How far the dig under way has got, 0 to 1, or null with none. */
export const digProgress = (s: GameState): number | null => (s.dig ? Math.min(1, s.dig.done / s.dig.ms) : null);

/** The dig goes on while the player stays put at the same cell; walking off or the cell changing stops it. */
export function digOn(s: GameState): void {
  const dig = s.dig;
  if (!dig) return;
  if (dig.corpse !== undefined) {
    // A cut goes on while the player stays on the carcass and it is still the one picked.
    const corpse = chosenGather(s)?.corpse;
    if (s.path.length || !corpse || corpse.id !== dig.corpse) {
      s.dig = null;
      return;
    }
    dig.done += STEP_MS;
    if (dig.done < dig.ms) return;
    s.dig = null;
    finishCut(s, corpse);
    return;
  }
  const spot = harvestTarget(s);
  if (s.path.length || !spot || spot.cell.x !== dig.x || spot.cell.y !== dig.y || s.z !== dig.z) {
    s.dig = null;
    return;
  }
  dig.done += STEP_MS;
  if (dig.done < dig.ms) return;
  s.dig = null;
  const job = jobOf(spot.site);
  if (!mine(s)) {
    // The bag filled or grew too heavy while the dig went on: what came up stays in the ground, and the screen says why.
    const why = cantCarry(s);
    if (why) noteBlocked(s, why);
    return;
  }
  s.dug = { x: dig.x, y: dig.y, at: s.time };
  // The last of a cell or of a whole vein dug out: the screen says it is spent. Food and water grow back, so only
  // ore, wood and stone.
  if (job === "ore" || job === "wood") {
    if (spot.site.left <= 0) s.depleted = { ore: spot.site.ore, at: s.time, what: "vein" };
    else if (spot.site.cells && spot.cell.left <= 0) s.depleted = { ore: spot.site.ore, at: s.time, what: "cell" };
  }
  // The tool that did the job wears by one use.
  const tool = toolFor(s, job);
  if (tool) wearTool(s, tool.hand);
}

/**
 * Stepping onto a big tree or a stone outcrop makes it a place to work, like a vein: F fells or breaks it.
 * Only the ones the player has stood on are kept, so the world doesn't fill up with every tree it has.
 */
export function gatherSpot(s: GameState): void {
  if (s.z !== 0) return;
  const { x, y } = s.player;
  const ore = groundGather(x, y, s.seed);
  if (!ore || s.sites.some((site) => site.x === x && site.y === y && (site.z ?? 0) === 0)) return;
  const [low, high] = gatherSize(ore);
  const total = low + Math.floor(hash(x, y, s.seed + 24) * (high - low + 1));
  addSite(s, { ore, x, y, total, left: total, seed: s.seed + Math.abs(x * 389 + y * 53) });
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

/**
 * Starts eating one of a bag stack: it takes EAT_MS, and only then is the food used up and does it help. Walking
 * off stops it with the food uneaten. False if it isn't food, the player is full, or something is being eaten.
 */
export function startEat(s: GameState, slot: number): boolean {
  const stack = s.inv[slot];
  const effect = stack && foodEffect(stack.id);
  if (s.eating || !stack || !effect) return false;
  if (s.hunger >= MAX_VITAL && (s.hp >= MAX_VITAL || !effect.hp)) return false;
  s.eating = { id: stack.id, done: 0, ms: EAT_MS };
  return true;
}

/** How far the eating under way has got, 0 to 1, or null with none. */
export const eatProgress = (s: GameState): number | null => (s.eating ? Math.min(1, s.eating.done / s.eating.ms) : null);

/** Eating goes on while the player stands still; done, one of that food from the bag is eaten. */
export function eatOn(s: GameState): void {
  const eating = s.eating;
  if (!eating) return;
  if (s.path.length) {
    s.eating = null;
    return;
  }
  eating.done += STEP_MS;
  if (eating.done < eating.ms) return;
  s.eating = null;
  const slot = s.inv.findIndex((stack) => stack?.id === eating.id);
  if (slot >= 0) eat(s, slot);
}
