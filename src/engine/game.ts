// Game rules. Plain data in, plain data out, no DOM, so saves are just JSON.
import { ALL, BYPRODUCT, DRUM, ENGINE, LINK, MAIN, MAX_PORTS, MOTOR, PLAYABLE_STAGES, POWER, PUMP, RIVER, RIVERBANK, Recipe, STAGES, WAREHOUSE, WATER, compareItems, isFluid, isMachine, isPowerSource, machinePower, machinePowerOut, machinesAt, foodEffect, forageSeasons, formLabel, itemWeight, machineCost, machineDifficulty, machineForms, machineManual, machineName, machineWork, matches, processOf } from "../content";
import { BASE, CELL_ASPECT, CHUNK, Point, Site, cellInChunk, chunkKey, chunkOf, chunkSites, generateSites, linePath, riverBanks, terrain } from "./world";

export const SAVE_VERSION = 13;
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
/** What a machine's tank holds, in litres. Two drums' worth. */
export const TANK_CAP = 200;
export const REVEAL = 4;
export const BASE_REVEAL = 9;

export const SEASON_NAMES = ["봄", "여름", "가을", "겨울"];
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
/** Each line needs a transfer unit. */
const LINE_COST = { iron_plate: 1, copper_tube: 1 };

export interface Stack {
  id: string;
  n: number;
}
export type Slots = (Stack | null)[];

export interface GameNode {
  id: number;
  type: string;
  /** Three characters that name this one machine, like K01. */
  code: string;
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
  /** Share of full speed from power, last step. Zero means no power reached it. */
  speed?: number;
  /** The riverbank this node stands for. */
  siteId?: number;
}

/** A planned machine: shown faded on the board, doing nothing until a real one takes its place. */
export interface Ghost {
  id: number;
  type: string;
  form: string;
  x: number;
  y: number;
}

/** A planned line. Either end can be a real node or a ghost. */
export interface GhostLine {
  from: number;
  to: number;
  material: string;
}

/** A facility being built. Materials are paid when work starts. */
export interface Project {
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
  /** What this line cost to build, returned when it is removed. */
  paid: Stack[];
}

export interface GameState {
  version: 13;
  seed: number;
  time: number;
  player: Point;
  path: Point[];
  walkTimer: number;
  inv: Slots;
  /** The stack the player has picked up and is moving with the pointer. */
  cursor: Stack | null;
  sites: Site[];
  /** Explored cells by chunk. A chunk's veins are generated when it first appears here. */
  revealed: Record<string, number[]>;
  nodes: GameNode[];
  lines: Line[];
  ghosts: Ghost[];
  ghostLines: GhostLine[];
  nextId: number;
  /** How many of each machine have ever been built. Codes are never reused. */
  built: Record<string, number>;
  project: Project | null;
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
    version: 13,
    seed,
    time: 0,
    player: { ...BASE },
    path: [],
    walkTimer: 0,
    inv: emptySlots(INV_SLOTS),
    cursor: null,
    sites: generateSites(seed),
    revealed: {},
    nodes: [],
    lines: [],
    ghosts: [],
    ghostLines: [],
    nextId: 1,
    built: {},
    project: null,
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
  reveal(state, BASE, BASE_REVEAL);
  return state;
}

function addChunkSites(state: GameState, x: number, y: number): void {
  for (const site of chunkSites(state.seed, chunkOf(x), chunkOf(y))) {
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

export const atBase = (s: GameState): boolean => s.player.x === BASE.x && s.player.y === BASE.y && !s.path.length;
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
  return s.sites.find((site) => site.x === s.player.x && site.y === s.player.y);
}

/** What the player is carrying, including anything in hand. */
export function carried(s: GameState): number {
  const load = [...s.inv, s.cursor].reduce((sum, stack) => sum + (stack ? stack.n * itemWeight(stack.id) : 0), 0);
  return Math.round(load * 10) / 10;
}

export const overloaded = (s: GameState): boolean => carried(s) > MAX_CARRY;

/** A full load takes twice as long to carry as an empty bag. */
export const walkTime = (s: GameState): number =>
  WALK_MS * (1 + Math.min(carried(s), MAX_CARRY) / MAX_CARRY) * (isWeak(s) ? WEAK_WALK : 1);

/** Starts walking. Too heavy a load keeps the player where they are. */
export function walkTo(s: GameState, target: Point): boolean {
  if (overloaded(s)) return false;
  s.path = linePath(s.player, target);
  s.walkTimer = 0;
  return true;
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

export const seasonAt = (time: number): number => Math.floor(time / SEASON_MS) % SEASON_NAMES.length;

/** Seasonal food can only be picked in its season. Ore is always there. */
export function canHarvest(s: GameState, site: Site): boolean {
  if (site.ore === WATER) return false;
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
  showRivers(s);
}

/** A riverbank joins the base graph, with its own code, once the player has found it. */
function showRivers(s: GameState): void {
  for (const site of s.sites) {
    if (site.ore !== WATER || !isRevealed(s, site.x, site.y)) continue;
    if (s.nodes.some((node) => node.siteId === site.id)) continue;
    const count = s.nodes.filter((node) => node.type === RIVERBANK).length;
    const node: GameNode = { ...newWarehouse(s, 40, 340 + count * 124), type: RIVERBANK, store: [], siteId: site.id };
    site.code = node.code;
    s.nodes.push(node);
  }
}

/** Riverbanks the player has found, as base nodes. */
export const foundRivers = (s: GameState): GameNode[] => s.nodes.filter((node) => node.type === RIVERBANK);

/** Points a pump at a riverbank, moving it off any other. Choosing its own riverbank again unlinks it. */
export function linkRiver(s: GameState, pumpId: number, bankId: number): boolean {
  const current = s.lines.find((l) => l.to === pumpId && l.material === LINK);
  if (current?.from === bankId) return removeLine(s, current.id);
  if (!canAffordRoute(s, bankId, pumpId) && !current) return false;
  if (current) removeLine(s, current.id);
  return toggleRoute(s, bankId, pumpId, LINK);
}

/** The riverbank a pump is linked to, if any. */
export function riverOf(s: GameState, pump: GameNode): Site | undefined {
  const line = s.lines.find((l) => l.to === pump.id && l.material === LINK);
  const bank = line && nodeById(s, line.from);
  return bank?.siteId === undefined ? undefined : s.sites[bank.siteId];
}

function refillRivers(s: GameState): void {
  for (const site of s.sites) {
    if (site.ore === WATER) site.left = Math.min(site.total, site.left + 1);
  }
}

export function mine(s: GameState): boolean {
  const site = siteHere(s);
  if (!site || site.left <= 0 || !canHarvest(s, site)) return false;
  if (carried(s) + itemWeight(site.ore) > MAX_CARRY || !addTo(s.inv, site.ore, 1)) return false;
  site.left -= 1;
  return true;
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
  if (type === WAREHOUSE) {
    const store = newWarehouse(s, x, y);
    s.nodes.push(store);
    return store;
  }
  if (type === MOTOR) {
    const motor: GameNode = { ...newWarehouse(s, x, y), type: MOTOR, store: [] };
    s.nodes.push(motor);
    return motor;
  }
  const form = machineForms(type)[0] ?? "";
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

function spend(s: GameState, ingredient: string, amount: number): Stack[] {
  const spent: Stack[] = [];
  let left = amount;
  for (const slots of [s.inv, ...stores(s)]) {
    slots.forEach((slot, i) => {
      if (!slot || left <= 0 || !matches(slot.id, ingredient)) return;
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

/** Pays for a facility and starts the work. One project runs at a time. */
export function startProject(s: GameState, type: string): boolean {
  stowCursor(s);
  if (!atBase(s) || s.project || !machinesAt(s.stage).includes(type) || !canAfford(s, type)) return false;
  const paid = Object.entries(machineCost(type)).flatMap(([key, need]) => spend(s, key, need));
  s.project = { type, done: 0, paid };
  return true;
}

/** Puts one item in the bag, or a warehouse if the bag is full. False when neither has room. */
function giveItem(s: GameState, id: string): boolean {
  return addTo(s.inv, id, 1) > 0 || bank(s, id, 1) > 0;
}

/** One click of work. The finished machine is an item, to install or store. */
export function workProject(s: GameState): boolean {
  const project = s.project;
  if (!atBase(s) || !project) return false;
  const work = machineWork(project.type);
  project.done = Math.min(work, project.done + (isWeak(s) ? WEAK_WORK : 1));
  // With nowhere to put the machine, the work waits at the last step.
  if (project.done >= work && giveItem(s, project.type)) s.project = null;
  return true;
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
    if (!source || source.type === RIVERBANK) continue;
    copies.set(id, { id: s.nextId++, type: source.type, form: source.form, x: source.x + dx, y: source.y + dy });
  }
  s.ghosts.push(...copies.values());
  for (const line of [...s.lines, ...s.ghostLines]) {
    const from = copies.get(line.from);
    const to = copies.get(line.to);
    if (from && to) s.ghostLines.push({ from: from.id, to: to.id, material: line.material });
    // A pump's riverbank stays where it is, so the copy points at the same one.
    else if (to && line.material === LINK) s.ghostLines.push({ from: line.from, to: to.id, material: LINK });
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

export function cancelProject(s: GameState): boolean {
  if (!atBase(s) || !s.project) return false;
  refund(s, s.project.paid);
  s.project = null;
  return true;
}

/** Brings a save from an older layout up to date. */
export function upgradeSave(s: GameState): GameState {
  s.ghosts ??= [];
  s.ghostLines ??= [];
  // Goals used to be handed in. Count what was handed in or still exists as made.
  const old = s as GameState & { delivered?: number; won?: boolean };
  if (s.stage === undefined) {
    const { item } = STAGES[0].goal;
    s.stage = old.won ? 1 : 0;
    s.made = { [item]: (old.delivered ?? 0) + countOf(s, item) };
    s.announced = null;
  }
  if (s.stage >= 1) addRivers(s);
  // Pumps used to draw from the nearest riverbank by themselves.
  for (const pump of s.nodes) {
    if (pump.type !== PUMP || pump.siteId === undefined) continue;
    const bank = s.nodes.find((node) => node.type === RIVERBANK && node.siteId === pump.siteId);
    if (bank) s.lines.push({ id: s.nextId++, from: bank.id, to: pump.id, material: LINK, timer: 0, active: false, lastMoved: 0, paid: [] });
    delete pump.siteId;
  }
  // The stove merged into the brick kiln.
  if (s.project?.type === "stove") s.project.type = "brick_kiln";
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
export const canRemove = (s: GameState, node: GameNode): boolean =>
  node.type !== RIVERBANK && !isFirstWarehouse(s, node) && node.store.every((slot) => !slot);

export function removeNode(s: GameState, id: number): boolean {
  const node = nodeById(s, id);
  if (!atBase(s) || !node || !canRemove(s, node)) return false;
  // Fluids have no container to go back in, so they are lost with the machine.
  for (const stack of Object.values(node.ins)) if (stack && !isFluid(stack.id)) bank(s, stack.id, stack.n);
  for (const [item, n] of Object.entries(node.outs)) if (n && !isFluid(item)) bank(s, item, n);
  s.nodes = s.nodes.filter((n) => n !== node);
  // Older saves built nodes straight from materials, and get those back instead.
  if (node.paid.length) refund(s, node.paid);
  else if (!giveItem(s, node.type)) s.cursor ??= { id: node.type, n: 1 };
  cutLines(s, (l) => l.from !== id && l.to !== id);
  s.ghostLines = s.ghostLines.filter((l) => l.from !== id && l.to !== id);
  return true;
}

export const portsUsed = (s: GameState, id: number): number =>
  s.lines.filter((l) => l.from === id || l.to === id).length;

/** What any line between two nodes could carry, before ports or existing lines are counted. */
export function routeMaterials(s: GameState, fromId: number, toId: number): string[] {
  const from = nodeById(s, fromId);
  const to = nodeById(s, toId);
  if (!from || !to || from === to || to.type === MOTOR || to.type === RIVERBANK) return [];
  // A pump draws from one riverbank at a time.
  if (from.type === RIVERBANK) {
    const taken = s.lines.some((l) => l.to === to.id && l.material === LINK && l.from !== from.id);
    return to.type === PUMP && !taken ? [LINK] : [];
  }
  if (isPowerSource(from.type)) return to.type === ENGINE ? [] : [POWER];
  // A warehouse has no filter: it can only send what it holds, in turn.
  if (from.type === WAREHOUSE) return [ALL];
  // A warehouse takes items only: fluids need a tank or a drum.
  const usable = (items: string[]) => items.some((item) => (to.type === WAREHOUSE ? !isFluid(item) : slotFor(to, item)));
  const { main, byproducts } = outputChannels(from);
  return [...(usable(main) ? [MAIN] : []), ...(usable(byproducts) ? [BYPRODUCT] : [])];
}

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

/** What a new line costs. */
export const routeCost = (_s: GameState, _fromId: number, _toId: number): Record<string, number> => LINE_COST;

export const canAffordRoute = (s: GameState, fromId: number, toId: number): boolean =>
  Object.entries(routeCost(s, fromId, toId)).every(([id, n]) => countOf(s, id) >= n);

/** Switches one channel on a route on or off. Switching off gives the parts back. */
export function toggleRoute(s: GameState, fromId: number, toId: number, material: string): boolean {
  const line = s.lines.find((l) => l.from === fromId && l.to === toId && l.material === material);
  if (line) return removeLine(s, line.id);
  if (!canAffordRoute(s, fromId, toId)) return false;
  const cost = routeCost(s, fromId, toId);
  const added = connect(s, fromId, toId, material);
  if (!added) return false;
  added.paid = Object.entries(cost).flatMap(([id, n]) => spend(s, id, n));
  return true;
}

/** Display name: the machine, its form if it has one, and its own code. */
export function nodeLabel(_s: GameState, node: GameNode): string {
  const forms = machineForms(node.type);
  const form = forms.length > 1 ? ` (${formLabel(node.form)})` : "";
  return `${machineName(node.type)}${form} ${node.code}`;
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
  for (const line of gone) refund(s, line.paid);
}

export function removeLine(s: GameState, id: number): boolean {
  if (!atBase(s)) return false;
  cutLines(s, (l) => l.id !== id);
  return true;
}

/** How many of an item a node can still accept. */
function roomFor(node: GameNode, item: string, viaLine = false): number {
  if (node.type === WAREHOUSE) {
    if (isFluid(item)) return 0;
    return node.store.reduce((room, slot) => room + (!slot ? STACK : slot.id === item ? STACK - slot.n : 0), 0);
  }
  const key = slotFor(node, item)?.key;
  if (!key) return 0;
  const slot = node.ins[key];
  if (slot && slot.id !== item) return 0;
  // Lines only top a machine up to two batches, so one machine can't hoard a shared material.
  const cap = viaLine ? batchOf(node, key) * 2 : isFluid(item) ? TANK_CAP : inputCap(node, key);
  return cap - (slot?.n ?? 0);
}

function insert(node: GameNode, item: string, n: number, viaLine = false): number {
  const moved = Math.min(n, roomFor(node, item, viaLine));
  if (moved <= 0) return 0;
  if (node.type === WAREHOUSE) return addTo(node.store, item, moved);
  const key = slotFor(node, item)!.key;
  node.ins[key] = { id: item, n: (node.ins[key]?.n ?? 0) + moved };
  return moved;
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
  readiness(node) === "ready" ? Object.keys(recipeOf(node).out) : [];

/** How much of an output a machine can hold before it stops. */
export const outputCap = (item: string): number => (isFluid(item) ? TANK_CAP : OUTPUT_CAP);

export function status(node: GameNode): Status {
  if (node.type === WAREHOUSE || node.type === RIVERBANK) return "idle";
  if (node.type === MOTOR) return node.energy > 0 ? "run" : "idle";
  const state = readiness(node);
  if (node.type === ENGINE) return node.energy > 0 || state === "ready" ? "run" : "idle";
  if (state !== "ready") return state;
  if (node.speed) return "run";
  if (machineManual(node.type)) return "manual";
  return machinePower(node.type) ? "idle" : "run";
}

/** Loaded and able to run, but no power is reaching it. */
export const lacksPower = (node: GameNode): boolean =>
  !!machinePower(node.type) && !machineManual(node.type) && readiness(node) === "ready" && !node.speed;

/** An engine burns only while its boiler has room, so a quiet factory saves coal. */
function boil(s: GameState, node: GameNode): void {
  if (node.energy >= STEAM_MAX || readiness(node) !== "ready") return;
  advance(s, node, STEP_MS / (recipeOf(node).time * 1000));
  node.energy = Math.min(STEAM_MAX, node.energy + (machinePowerOut(node.type) * STEP_MS) / 1000);
}

function runMachine(s: GameState, node: GameNode): void {
  if (node.type === WAREHOUSE || node.type === MOTOR || node.type === RIVERBANK) return;
  if (node.type === ENGINE) {
    boil(s, node);
    return;
  }
  if (status(node) !== "run") return;
  const pace = machinePower(node.type) ? node.speed ?? 0 : 1;
  advance(s, node, (pace * STEP_MS) / (recipeOf(node).time * 1000));
}

/** Force per second a source's lines are using to move items right now. */
function lineLoad(s: GameState, source: GameNode): number {
  const driven = s.lines.filter((l) => l.from === source.id && l.material === POWER).map((l) => l.to);
  return (s.lines.filter((l) => l.active && driven.includes(l.from)).length * 1000) / LINE_MS;
}

/**
 * Shares each power source among the machines drawing on it. A source gives at most its
 * output, less what its lines are using, and never more than it holds. Past that limit
 * every machine on it slows down together.
 */
function supplyPower(s: GameState, drives: Map<number, GameNode[]>): void {
  const users = new Map<GameNode, GameNode[]>();
  for (const node of s.nodes) {
    if (!machinePower(node.type)) continue;
    node.speed = 0;
    if (readiness(node) !== "ready") continue;
    if (node.type === PUMP && (riverOf(s, node)?.left ?? 0) < 1) continue;
    const source = drives.get(node.id)?.find((m) => m.energy > 0);
    if (source) users.set(source, [...(users.get(source) ?? []), node]);
  }
  for (const [source, machines] of users) {
    const perSecond = machines.reduce((sum, node) => sum + machinePower(node.type), 0);
    const demand = perSecond * (STEP_MS / 1000);
    const output = Math.max(0, machinePowerOut(source.type) - lineLoad(s, source));
    const share = Math.min(1, output / perSecond, source.energy / demand);
    source.energy -= demand * share;
    for (const node of machines) node.speed = share;
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
}

/** One press of work by the player, worth one second of machine time. */
export function workMachine(s: GameState, nodeId: number): boolean {
  const node = nodeById(s, nodeId);
  if (!atBase(s) || !node || status(node) !== "manual") return false;
  advance(s, node, (isWeak(s) ? WEAK_WORK : 1) / recipeOf(node).time);
  return true;
}

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

function advance(s: GameState, node: GameNode, amount: number): void {
  const recipe = recipeOf(node);
  node.progress += amount;
  if (node.progress < 1 - 1e-9) return;
  node.progress = 0;
  for (const { key } of nodeProcess(node).slots) {
    const slot = node.ins[key]!;
    slot.n -= batchOf(node, key);
    if (!slot.n) node.ins[key] = null;
  }
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

/** Whether a node has a wound motor pushing what it sends out. */
export function hasDrive(s: GameState, nodeId: number): boolean {
  return s.lines.some((l) => l.to === nodeId && l.material === POWER && (nodeById(s, l.from)?.energy ?? 0) > 0);
}

/** Springs always run down. An engine only loses steam sitting full, never while it is working. */
function leakForce(s: GameState): void {
  for (const node of s.nodes) {
    if (node.type === MOTOR || (node.type === ENGINE && node.energy >= STEAM_MAX)) node.energy = Math.max(0, node.energy - 1);
  }
}

/**
 * What a power source is carrying, in force per second: `now` is what its machines and lines
 * are using this moment, `connected` the most its machines could use if all of them ran at once.
 */
export function powerLoad(s: GameState, source: GameNode): { now: number; connected: number; limit: number } {
  const driven = s.lines.filter((l) => l.from === source.id && l.material === POWER).map((l) => nodeById(s, l.to)!);
  const working = driven.reduce((sum, node) => sum + machinePower(node.type) * (node.speed ?? 0), 0);
  return {
    now: Math.round(working + lineLoad(s, source)),
    connected: driven.reduce((sum, node) => sum + machinePower(node.type), 0),
    limit: machinePowerOut(source.type),
  };
}

/** Lines are only passages: something at the sending end has to push. */
function runLine(s: GameState, line: Line, nodes: Map<number, GameNode>, drives: Map<number, GameNode[]>): void {
  if (line.material === POWER || line.material === LINK) return;
  line.timer += STEP_MS;
  if (line.timer < LINE_MS) return;
  line.timer = 0;
  line.active = false;
  const motor = drives.get(line.from)?.find((m) => m.energy > 0);
  if (!motor) return;
  const from = nodes.get(line.from)!;
  const to = nodes.get(line.to)!;
  const moved = from.type === WAREHOUSE ? sendStored(from, to) : sendOutput(from, to, line);
  if (!moved) return;
  motor.energy -= 1;
  line.active = true;
  line.lastMoved = s.time;
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
  s.player = s.path.shift()!;
  reveal(s, s.player, visionAt(s, s.player));
  if (s.stage >= 1) showRivers(s);
  const onSite = s.sites.some((site) => site.x === s.player.x && site.y === s.player.y);
  const atHome = s.player.x === BASE.x && s.player.y === BASE.y;
  if (onSite || atHome) return;
  const [, kind, height] = terrain(s.player.x, s.player.y, s.seed);
  if (kind === "t-water") hurt(s, WATER_DAMAGE);
  else if (kind === "t-hill") hurt(s, 1 + height);
}

function hurt(s: GameState, amount: number): void {
  s.hp -= amount;
  if (s.hp <= 0) collapse(s);
}

/** The player wakes at the base, having dropped part of what they carried. */
function collapse(s: GameState): void {
  stowCursor(s);
  // The further from home, the more is dropped. At the base nothing is.
  const steps = Math.max(Math.abs(s.player.x - BASE.x), Math.abs(s.player.y - BASE.y));
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

/** A running start for trying things out: the steam stage open and a wound motor driving a stocked warehouse. */
export function createTestGame(seed: number): GameState {
  const s = createGame(seed);
  const store = s.nodes[0];
  const stock: [string, number][] = [
    ["Lm", 64], ["Ml", 64], ["Lg", 64], ["Kn", 64], ["iron", 32], ["copper", 32], ["iron_plate", 32], ["copper_tube", 32], ["brick", 32], ["steam_engine_unit", 2], ["iron_cylinder", 8], ["iron_drum", 4],
  ];
  stock.forEach(([id, n], i) => {
    store.store[i] = { id, n };
  });
  s.stage = 1;
  addRivers(s);
  for (const bank of riverBanks(seed)) reveal(s, bank, REVEAL);
  showRivers(s);
  const motor = placeMachine(s, MOTOR, 40, 40)!;
  motor.energy = SPRING_MAX;
  const smelter = placeMachine(s, "smelter", 300, 200)!;
  connect(s, motor.id, store.id, POWER);
  connect(s, motor.id, smelter.id, POWER);
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
  survive(s);
  turnSeason(s);
  if (s.time % SPRING_LEAK_MS === 0) leakForce(s);
  if (s.time % RIVER.regenMs === 0) refillRivers(s);
  const nodes = new Map(s.nodes.map((n) => [n.id, n]));
  const drives = new Map<number, GameNode[]>();
  for (const line of s.lines) {
    if (line.material === POWER) drives.set(line.to, [...(drives.get(line.to) ?? []), nodes.get(line.from)!]);
  }
  supplyPower(s, drives);
  s.nodes.forEach((node) => runMachine(s, node));
  // Least recently served first, so lines leaving one machine share its output evenly.
  [...s.lines].sort((a, b) => a.lastMoved - b.lastMoved).forEach((line) => runLine(s, line, nodes, drives));
}

