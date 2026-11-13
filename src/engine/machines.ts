// Machines: placing, building and removing them, plans (ghosts) and groups, recipes, fuel, working them by
// hand, and running them each step. Pumps and the riverbanks they draw from live here too.
import { buildablesAt, namesItem, BELT_DRIVE, PRESSURE_PUMP, isBuilder, fuelValue, isFuel, machineBurn, ENGINE, MANIFOLD, MODULE, MOTOR, isSteamReady, SPLITTER, isPassive, isStore, POWER, PUMP, Recipe, TANK, TAR, WAREHOUSE, WATER, isFluid, isMachine, machinePower, machinePowerOut, machinesAt, formLabel, machineDifficulty, machineForms, machineManual, machineName, matches, processOf } from "../content";
import { BASE, Point, Site } from "./world";
import { SPRING_MAX, WIND, STEAM_MAX, STACK, stackSize, STEP_MS, OUTPUT_CAP, NAME_MAX, TANK_CAP, TAR_TANK_CAP, WEAK_WORK, Stack, Overflow, GameNode, Ghost, Group, GameState, Status, emptySlots, Button } from "./state";
import { addTo, giveBack, bank, countOf, bagCount, spend, refund, giveItem, lift, drop } from "./inventory";
import { lineKinds, routeMaterials, hasLine, toggleRoute, cutLines } from "./lines";
import { nextCode, newWarehouse, atBase, nodeById, isRevealed, isWeak, checkGoal } from "./game";

/** Riverbanks the player has found. */
export const foundRivers = (s: GameState): Site[] =>
  s.sites.filter((site) => site.ore === WATER && isRevealed(s, site.x, site.y));

/** Tubes a pipe from the base out to a riverbank takes: one for every cell between them. */
export const riverPipeCost = (site: Point): number => Math.max(1, Math.abs(site.x - BASE.x), Math.abs(site.y - BASE.y));

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

export const nodeProcess = (node: GameNode) => processOf(node.type, node.form);

/** The recipe the machine's current inputs select. */
export function recipeOf(node: GameNode): Recipe {
  const { recipes, slots } = nodeProcess(node);
  // The recipe for exactly what went in comes first: pyrite has a roast of its own though it is an iron ore,
  // and pig iron makes pig iron plates, though it fits iron's too.
  const named = (r: Recipe) =>
    Object.keys(r.in).some((ingredient, i) => {
      const stack = node.ins[slots[i].key];
      return !!stack && namesItem(stack.id, ingredient);
    }) &&
    Object.keys(r.in).every((ingredient, i) => {
      const stack = node.ins[slots[i].key];
      return !stack || matches(stack.id, ingredient, false);
    });
  const fits = (r: Recipe, inherit: boolean) =>
    Object.keys(r.in).every((ingredient, i) => {
      const stack = node.ins[slots[i].key];
      return !stack || matches(stack.id, ingredient, inherit);
    });
  return recipes.find(named) ?? recipes.find((r) => fits(r, false)) ?? recipes.find((r) => fits(r, true)) ?? recipes[0];
}

/** Amount of one batch for a slot. */
function batchOf(node: GameNode, key: string): number {
  const index = nodeProcess(node).slots.findIndex((slot) => slot.key === key);
  return Object.values(recipeOf(node).in)[index];
}

export const slotFor = (node: GameNode, item: string) =>
  nodeProcess(node).slots.find((slot) => slot.accepts.some((a) => matches(item, a)));

/** An input slot holds a slot's worth, or one batch if a recipe asks for more than that. */
export const inputCap = (node: GameNode, key: string): number => Math.max(STACK, batchOf(node, key));

export function placeMachine(s: GameState, type: string, x: number, y: number): GameNode | null {
  if (!atBase(s) || !machinesAt(s.stage).includes(type)) return null;
  return addNode(s, type, x, y);
}

/** Puts a new node of a type on the board, with no checks. */
export function addNode(s: GameState, type: string, x: number, y: number): GameNode {
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

export function slotsFor(type: string, form: string): Pick<GameNode, "ins" | "outs"> {
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
  if (isBuilder(node.type) && !buildablesAt(s.stage).includes(form)) return false;
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
export const takesSteam = (node: GameNode): boolean => !needsModule(node) || !!node.module;

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

/** Display name: the player's name if it has one, else the machine and its form, then its own code. */
export function nodeLabel(_s: GameState, node: GameNode): string {
  if (node.name) return `${node.name} ${node.code}`;
  const forms = machineForms(node.type);
  const form = forms.length > 1 ? ` (${formLabel(node.form)})` : "";
  return `${machineName(node.type)}${form} ${node.code}`;
}

/** Longest note on a map place. */
export const NOTE_MAX = 40;

/** Writes the player's note on a map place. A blank note removes it. */
export function setNote(s: GameState, siteId: number, text: string): boolean {
  const site = s.sites.find((v) => v.id === siteId);
  if (!site) return false;
  const note = text.trim().slice(0, NOTE_MAX);
  if (note) site.note = note;
  else delete site.note;
  return true;
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

/** How many of an item a node can still accept. */
export function roomFor(node: GameNode, item: string, viaLine = false): number {
  if (node.type === TANK) {
    if (item !== TAR) return 0;
    // A tank set to discard always takes more, and loses what doesn't fit.
    return node.overflow === "discard" ? TAR_TANK_CAP : TAR_TANK_CAP - (node.ins[TAR]?.n ?? 0);
  }
  if (isStore(node.type)) {
    if (isFluid(item)) return 0;
    return node.store.reduce((room, slot) => room + (!slot ? stackSize(item) : slot.id === item ? stackSize(item) - slot.n : 0), 0);
  }
  const key = slotFor(node, item)?.key;
  if (!key) return fuelRoom(node, item, viaLine);
  const slot = node.ins[key];
  if (slot && slot.id !== item) return 0;
  // Lines only top a machine up to two batches, so one machine can't hoard a shared material.
  const cap = viaLine ? batchOf(node, key) * 2 : isFluid(item) ? TANK_CAP : inputCap(node, key);
  return cap - (slot?.n ?? 0);
}

export function insert(node: GameNode, item: string, n: number, viaLine = false): number {
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
export const FUEL_CAP = STACK;
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
    // A hand furnace's fire only catches for a fresh batch once the bellows have blown it up into the green.
    // Mid-batch it takes the next piece by itself, as any fire does.
    if (machineManual(node.type) === "bellows" && node.progress <= 0 && (node.blast ?? 0) < BLAST.low) return false;
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
export function readiness(node: GameNode): "ready" | "idle" | "blocked" {
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
  // An engine burns nothing of its own: it runs whenever it has steam from a boiler.
  if (node.type === ENGINE) return state === "ready" ? "run" : "idle";
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

export function runMachine(s: GameState, node: GameNode): void {
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


/** Springs always run down. An engine's steam just tops out at its limit. */
export function leakForce(s: GameState): void {
  for (const node of s.nodes) {
    if (node.type === MOTOR) node.energy = Math.max(0, node.energy - 1);
  }
}
