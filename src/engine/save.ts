// Saves: loading saved JSON and bringing an older version up to this one.
import { fitsSlot, isTool, DEER, CONSTRUCTION, WORKBENCH, CAVE, ENGINE, MANIFOLD, MOTOR, isPassive, POWER, STAGES, SURFACE_ORES, isMachine, processOf } from "../content";
import { BASE, Site, entrancesIn, chunkOf } from "./world";
import { SAVE_VERSION, OLDEST_SAVE, INV_SLOTS, Stack, GameState, Corpse } from "./state";
import { addTo, stores, bank, countOf, refund } from "./inventory";
import { addNode, slotsFor, nextSpot, needsModule } from "./machines";
import { cutLines } from "./lines";
import { nextCode, createGame, addNearCave, nodeById, addRivers, addLaterVeins } from "./game";

/** A machine being built the old way, before the construction bench. Only older saves have one, and it is refunded on load. */
interface Project {
  type: string;
  done: number;
  paid: Stack[];
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
 * Equipment from older saves: gear was kept as bare ids, with a pick in "hand" and a weapon in "weapon". Each
 * becomes a stack of one, the pick in the right hand and the weapon in the left. A tool kept several to a slot
 * (they used to stack) is split one to a slot where there is room. A forming bench set to make a tool now
 * makes its head.
 */
function fixGear(s: GameState): void {
  const old = s.gear as Record<string, Stack | string | null>;
  const stack = (v: Stack | string | null | undefined): Stack | null => (typeof v === "string" ? { id: v, n: 1 } : v ?? null);
  const gear: Record<string, Stack | null> = {};
  for (const [slot, value] of Object.entries(old)) {
    const to = slot === "hand" ? "right" : slot === "weapon" ? "left" : slot;
    const held = stack(value);
    // Anything that no longer goes where it was goes back to the bag.
    if (held && !fitsSlot(held.id, to)) addTo(s.inv, held.id, 1, held.wear) || bank(s, held.id, 1, held.wear);
    else gear[to] = held;
  }
  s.gear = gear;
  for (const slots of [s.inv, ...stores(s)]) {
    for (let i = 0; i < slots.length; i += 1) {
      const slot = slots[i];
      if (!slot || !isTool(slot.id) || slot.n <= 1) continue;
      while (slot.n > 1) {
        const free = slots.indexOf(null);
        if (free < 0) break;
        slots[free] = { id: slot.id, n: 1 };
        slot.n -= 1;
      }
    }
  }
  for (const node of s.nodes) {
    if (node.type === "forming_bench" && ["pick", "axe", "shovel", "spear", "blade"].includes(node.form)) node.form = `${node.form}_head`;
  }
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
  // A save from before the tutorial starts without it once past S0, and with it while still in S0.
  if (!old.tutorial) s.tutorial = { step: 0, off: (old.stage ?? 0) > 0 };
  // A save from before stages has to work its stage out from what it did have.
  if (old.stage === undefined) delete (s as Partial<GameState>).stage;
  dropRiverNodes(s);
  // Machines that no longer exist go, and their lines with them. What they held goes to the warehouse.
  const gone = s.nodes.filter((node) => node.type !== "stove" && !isMachine(node.type));
  s.nodes = s.nodes.filter((node) => !gone.includes(node));
  for (const node of gone) {
    for (const stack of [...Object.values(node.ins ?? {}), ...(node.store ?? [])]) if (stack) bank(s, stack.id, stack.n);
    for (const [id, n] of Object.entries(node.outs ?? {})) if (n > 0) bank(s, id, n);
  }
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

/** Items that changed: hematite gave way to pyrite, and pig iron tool heads became iron heads. */
const RENAMED_ITEMS: Record<string, string> = {
  Hm: "Py",
  ...Object.fromEntries(["pick", "axe", "shovel", "spear", "blade"].map((kind) => [`pig_iron_${kind}_head`, `iron_${kind}_head`])),
};

/** Renames items everywhere a save keeps them: veins, the bag, the hand, stores, machine slots and counts. */
function renameItems(s: GameState, renamed: Record<string, string>): void {
  const fix = (stack: Stack | null | undefined) => {
    if (stack && renamed[stack.id]) stack.id = renamed[stack.id];
  };
  for (const site of s.sites ?? []) if (renamed[site.ore]) site.ore = renamed[site.ore];
  (s.inv ?? []).forEach(fix);
  fix(s.cursor);
  for (const node of s.nodes ?? []) {
    (node.store ?? []).forEach(fix);
    Object.values(node.ins ?? {}).forEach(fix);
    for (const [from, to] of Object.entries(renamed)) {
      if (node.outs?.[from] === undefined) continue;
      node.outs[to] = (node.outs[to] ?? 0) + node.outs[from];
      delete node.outs[from];
    }
  }
  for (const [from, to] of Object.entries(renamed)) {
    if (s.made?.[from] === undefined) continue;
    s.made[to] = (s.made[to] ?? 0) + s.made[from];
    delete s.made[from];
  }
}

/**
 * Before version 19 every cave was a map of its own behind its entrance. Now there is one underground under the
 * whole surface. A player inside a cave comes out at its entrance. Its veins can't be moved into the new
 * underground, so they go, and what ore they still held is put in the warehouse. Entrances that no longer stand
 * over the underground's stairs (the land has changed since) go too. Sites are numbered again from 0.
 */
function intoOneUnderground(s: GameState): void {
  const old = s as GameState & { cave?: number | null; caveSeen?: unknown };
  const door = typeof old.cave === "number" ? s.sites.find((site) => site.id === old.cave) : undefined;
  if (typeof old.cave === "number") {
    s.player = door ? { x: door.x, y: door.y } : { ...BASE };
    s.path = [];
    s.mobs = [];
    s.shots = [];
  }
  delete old.cave;
  delete old.caveSeen;
  s.z ??= 0;
  s.underSeen ??= {};
  const inOldCave = (site: Site) => (site as Site & { cave?: number }).cave !== undefined;
  for (const site of s.sites.filter(inOldCave)) if (site.ore !== CAVE && site.left > 0) bank(s, site.ore, site.left);
  const stays = (site: Site) => !inOldCave(site) &&
    (site.ore !== CAVE || entrancesIn(s.seed, chunkOf(site.x), chunkOf(site.y)).some((e) => e.x === site.x && e.y === site.y));
  if (s.sites.every(stays)) return;
  const renumber = new Map<number, number>();
  s.sites = s.sites.filter(stays).map((site, i) => {
    renumber.set(site.id, i);
    return { ...site, id: i };
  });
  for (const holder of [...s.nodes, ...(s.ghosts ?? [])]) {
    if (holder.siteId === undefined) continue;
    const id = renumber.get(holder.siteId);
    if (id === undefined) delete holder.siteId;
    else holder.siteId = id;
  }
  addNearCave(s);
}

/** Brings a save from an older layout up to date. */
export function upgradeSave(s: GameState): GameState {
  renameItems(s, RENAMED_ITEMS);
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
  intoOneUnderground(s);
  addRivers(s);
  addLaterVeins(s);
  // Prospecting under way is not kept across a load, nor is a dig.
  s.probe = null;
  s.dig = null;
  fixGear(s);
  s.mobs ??= [];
  s.corpses ??= [];
  // Carcasses once held a fixed list of items; now they hold cuts, one item each.
  for (const corpse of s.corpses as (Corpse & { items?: Record<string, number> })[]) if (corpse.left === undefined) corpse.left = Object.values(corpse.items ?? {}).reduce((a, b) => a + b, 0) || DEER.butcher.cuts;
  s.eating = null;
  s.shots ??= [];
  // A yeti is not kept across a load: surface creatures come and go.
  if (s.z === 0) s.mobs = [];
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
