// Lines between machines: belts for items, tubes for fluids and rods for power, what they cost and carry,
// and the belt, pipe and power networks they make each step.
import { tr } from "../i18n";
import { BELT_DRIVE, lineage, SELF_PUSHING, PRESSURE_PUMP, PRESS, DRIVE, formOf, machineTier, tierRank, ALL, BYPRODUCT, ENGINE, MAIN, MANIFOLD, MAX_PORTS, MOTOR, isPassive, isStore, POWER, PUMP, TANK, TAR, isFluid, machinePower, machinePowerOut } from "../content";
import { STEP_MS, LINE_MS, GameNode, Line, GameState } from "./state";
import { addTo, bank, bagCount, bagRoom, spend } from "./inventory";
import { riverOf, nodeProcess, slotFor, portsUsed, takesSteam, roomFor, insert, readiness } from "./machines";
import { atBase, nodeById } from "./game";

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
export const lineFits = (id: string, key: string): boolean => lineage(id).some((kind) => kind === key || formOf(kind) === key);

/**
 * Items or litres per second one line carries, by the belt or tube it is laid with. Copper tube costs
 * more and carries twice what iron does. Better belts join here when they come.
 */
export const LINE_RATE: Record<string, number> = { iron_belt: 2, iron_tube: 2, copper_tube: 4 };
/** Litres of steam one litre of water makes, at the working pressure of an early boiler (about 6 bar). */
export const STEAM_EXPANSION = 300;
/** What one line of an item carries, its own rate or the one it inherits: a pig iron tube carries what an iron tube does. */
export const lineRateOf = (id: string): number | undefined => lineage(id).map((kind) => LINE_RATE[kind]).find(Boolean);
/** The belts or tubes a layer's lines can be laid with, the plainest first. Power lines are always a rod. */
export const lineKinds = (layer: LineLayer): string[] =>
  layer === "power" ? [] : Object.keys(LINE_RATE).filter((id) => lineFits(id, Object.keys(LINE_COST[layer])[0]));
/** What a line is laid with. Lines from before the choice go by what they were paid with, else the plainest kind. */
export const kindOf = (line: Line, layer: LineLayer): string | undefined =>
  line.kind ?? line.paid.find((stack) => lineRateOf(stack.id))?.id ?? lineKinds(layer)[0];

/**
 * How an item performs, as [what, how much] rows for the index's detail. Pickers show only names and
 * counts, so the numbers live here. Temperatures and the like will join these as items gain them.
 */
export function itemStats(id: string): [string, string][] {
  const rate = lineRateOf(id);
  if (rate && formOf(id) === TUBE) return [[tr("관 하나가 나르는 최대 유량"), `${rate} ${tr("L/초")}`]];
  if (rate && formOf(id) === BELT) return [[tr("벨트 하나가 나르는 최대 양"), `${rate} ${tr("개/초")}`]];
  // Inside the game a unit of steam is a litre of the water it came from; how much room it really takes is told here only.
  if (id === "steam") return [[tr("물 1L가 끓어 되는 증기"), `${STEAM_EXPANSION}L (${tr("약 6기압")})`]];
  return [];
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

export const hasLine = (s: GameState, fromId: number, toId: number, material: string): boolean =>
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

export function connect(s: GameState, fromId: number, toId: number, material: string): Line | null {
  if (!atBase(s) || !connectOptions(s, fromId, toId).includes(material)) return null;
  const line: Line = { id: s.nextId++, from: fromId, to: toId, material, timer: 0, active: false, lastMoved: 0, paid: [] };
  s.lines.push(line);
  return line;
}

/** Keeps the lines that pass the test and refunds the rest. */
export function cutLines(s: GameState, keep: (line: Line) => boolean): void {
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
export function supplyPower(s: GameState, drives: Map<number, GameNode[]>): void {
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

/** The power sources behind a node, looking through any manifolds on the way. */
export function sourcesOf(direct: Map<number, GameNode[]>, id: number, seen = new Set<number>()): GameNode[] {
  return (direct.get(id) ?? []).flatMap((from) => {
    if (seen.has(from.id)) return [];
    seen.add(from.id);
    return from.type === MANIFOLD ? sourcesOf(direct, from.id, seen) : [from];
  });
}

export function powerLines(s: GameState, nodes: Map<number, GameNode>): Map<number, GameNode[]> {
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
    const carrying = lines.filter((l) => inside.has(l.from) && l.material !== link && !SELF_PUSHING.includes(nodeById(s, l.from)?.type ?? ""));
    // Each line tops out at what its belt or tube carries, so the network shows the best a line can do.
    const top = Math.max(...lineKinds(layer).map((id) => LINE_RATE[id]));
    const rate = carrying.length ? Math.min(top, (running * DRIVE_RATE) / carrying.length) : 0;
    const net = { drives: drivers.length, running, belts: carrying.length, rate };
    for (const id of members) nets.set(id, net);
    for (const line of carrying) lineRates.set(line.id, Math.min(rate, lineCap(s, line)));
  }
}

export function runBelts(s: GameState): void {
  lineRates.clear();
  runNetworks(s, "item", BELT_DRIVE, DRIVE, beltNets);
  runNetworks(s, "fluid", PRESSURE_PUMP, PRESS, pipeNets);
}

/** The most a line can carry per second: what its belt or tube carries. */
export function lineCap(s: GameState, line: Line): number {
  const kind = kindOf(line, lineLayer(s, line.from, line.material));
  return (kind && lineRateOf(kind)) || BELT_MAX;
}

/** The belt network a node is on, as of the last step. */
export const beltNetOf = (nodeId: number): BeltNet | undefined => beltNets.get(nodeId);
/** The pipe network a node is on, as of the last step. */
export const pipeNetOf = (nodeId: number): BeltNet | undefined => pipeNets.get(nodeId);

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
export function runLine(s: GameState, line: Line, nodes: Map<number, GameNode>): void {
  if (line.material === POWER || line.material === DRIVE || line.material === PRESS) return;
  const from = nodes.get(line.from)!;
  const to = nodes.get(line.to)!;
  // A line moves at its network's pace. A riverbank pump or a boiler pushes its own fluid out.
  const self = SELF_PUSHING.includes(from.type);
  // The pump needs its power to push; a boiler's own steam pressure does it.
  const pushing = from.type !== PUMP || from.carry;
  const pace = (self ? (pushing ? lineCap(s, line) : 0) : lineRates.get(line.id) ?? 0) / BELT_MAX;
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
