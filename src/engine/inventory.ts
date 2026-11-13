// What the player holds: stacks and slots, the bag and the warehouses, the load, gear and tools in hand, and
// moving items by hand between slots and machines.
import { HANDS, ToolStats, fitsSlot, isTool, toolStats, DRUM, WAREHOUSE, gearOf, compareItems, isFluid, itemWeight, machineCost, matches } from "../content";
import { stackSize, MAX_CARRY, WALK_MS, WEAK_WALK, Stack, Slots, GameNode, GameState, Button } from "./state";
import { slotFor, roomFor, insert } from "./machines";
import { lineFits } from "./lines";
import { atBase, nodeById, biomeRules, isWeak } from "./game";

/** The tools in the player's hands, with which hand holds each. */
export const heldTools = (s: GameState): { hand: string; stack: Stack; stats: ToolStats }[] =>
  HANDS.flatMap((hand) => {
    const stack = s.gear[hand];
    const stats = stack ? toolStats(stack.id) : undefined;
    return stack && stats ? [{ hand, stack, stats }] : [];
  });

/** How many more uses a tool has before it breaks. */
export const usesLeft = (stack: Stack): number => (toolStats(stack.id)?.durability ?? 0) - (stack.wear ?? 0);

/** Wears a held tool by one use; at none left it breaks and the hand is empty. Says the tool's name if it broke. */
export function wearTool(s: GameState, hand: string): void {
  const stack = s.gear[hand];
  if (!stack) return;
  stack.wear = (stack.wear ?? 0) + 1;
  if (usesLeft(stack) > 0) return;
  s.gear[hand] = null;
  s.broke = { id: stack.id, at: s.time };
}

/** What the player is carrying: the bag, anything in hand, and what they wear and hold in their hands. */
export function carried(s: GameState): number {
  const load = [...s.inv, s.cursor, ...Object.values(s.gear)].reduce((sum, stack) => sum + (stack ? stack.n * itemWeight(stack.id) : 0), 0);
  return Math.round(load * 10) / 10;
}

/** The equipment on the player. */
const worn = (s: GameState) => Object.values(s.gear).flatMap((stack) => {
  const gear = stack ? gearOf(stack.id) : undefined;
  return gear ? [gear] : [];
});

/** The most the player can carry and still walk, with what they are wearing. */
export const carryLimit = (s: GameState): number => MAX_CARRY + worn(s).reduce((sum, gear) => sum + (gear.carry ?? 0), 0);

export const overloaded = (s: GameState): boolean => carried(s) > carryLimit(s);

/** How much longer each step takes with a full load: 0.6 means 60% longer than with an empty bag. */
export const LOAD_SLOW = 0.6;
/** A full load slows each step by LOAD_SLOW, a half load by half that. */
export const walkTime = (s: GameState): number =>
  WALK_MS * (1 + (LOAD_SLOW * Math.min(carried(s), carryLimit(s))) / carryLimit(s)) * (isWeak(s) ? WEAK_WALK : 1) *
  worn(s).reduce((pace, gear) => pace * (gear.walk ?? 1), 1) * (biomeRules(s).walk ?? 1);

/** Adds up to n of an item and returns how many fit. */
export function addTo(slots: Slots, id: string, n: number, wear?: number): number {
  const size = stackSize(id);
  let left = n;
  for (const slot of slots) {
    if (slot && slot.id === id && slot.n < size) {
      const moved = Math.min(left, size - slot.n);
      slot.n += moved;
      left -= moved;
    }
  }
  for (let i = 0; i < slots.length && left > 0; i += 1) {
    if (!slots[i]) {
      const moved = Math.min(left, size);
      // A worn tool keeps its wear wherever it goes.
      slots[i] = wear ? { id, n: moved, wear } : { id, n: moved };
      left -= moved;
    }
  }
  return n - left;
}

/** Gives back what was laid or built, into the bag first and a warehouse for what doesn't fit. */
export function giveBack(s: GameState, stacks: Stack[]): void {
  for (const stack of stacks) bank(s, stack.id, stack.n - addTo(s.inv, stack.id, stack.n));
}

/** Equips what is in hand, swapping out what was there. With empty hands, takes the item off. */
export function clickGear(s: GameState, slot: string): void {
  const current = s.gear[slot] ?? null;
  if (!s.cursor) {
    if (!current) return;
    s.gear[slot] = null;
    s.cursor = current;
    return;
  }
  if (!fitsSlot(s.cursor.id, slot)) return;
  // One goes on, with its wear; the rest stays in hand.
  s.gear[slot] = { ...s.cursor, n: 1 };
  s.cursor.n -= 1;
  if (s.cursor.n <= 0) s.cursor = null;
  if (!current) return;
  if (!s.cursor) s.cursor = current;
  else if (!addTo(s.inv, current.id, 1, current.wear)) bank(s, current.id, 1, current.wear);
}

export const stores = (s: GameState): Slots[] => s.nodes.filter((n) => n.type === WAREHOUSE).map((n) => n.store);

/** Puts items in the first warehouse with room and returns how many fit. */
export function bank(s: GameState, id: string, n: number, wear?: number): number {
  return stores(s).reduce((done, store) => done + addTo(store, id, n - done, wear), 0);
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
export const bagRoom = (s: GameState, id: string): number => s.inv.reduce((room, slot) => room + (!slot ? stackSize(id) : slot.id === id ? stackSize(id) - slot.n : 0), 0);

export function spend(s: GameState, ingredient: string, amount: number, bagOnly = false): Stack[] {
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

export function refund(s: GameState, stacks: Stack[]): void {
  for (const stack of stacks) {
    const banked = bank(s, stack.id, stack.n);
    addTo(s.inv, stack.id, stack.n - banked);
  }
}

/** Puts one item in the bag, or a warehouse if the bag is full. False when neither has room. */
export function giveItem(s: GameState, id: string): boolean {
  return addTo(s.inv, id, 1) > 0 || bank(s, id, 1) > 0;
}

// ---- Moving items by hand

/** Lifts up to n from a stack onto the cursor. Returns how many moved. */
export function lift(s: GameState, stack: Stack, n: number): number {
  if (s.cursor && s.cursor.id !== stack.id) return 0;
  const moved = Math.min(n, stack.n, stackSize(stack.id) - (s.cursor?.n ?? 0));
  if (moved <= 0) return 0;
  // A tool comes up whole, wear and all.
  s.cursor = { ...stack, n: (s.cursor?.n ?? 0) + moved };
  stack.n -= moved;
  return moved;
}

export function drop(s: GameState, n: number): void {
  if (!s.cursor) return;
  s.cursor.n -= n;
  if (s.cursor.n <= 0) s.cursor = null;
}

/** Puts a held stack back in the inventory, or a warehouse if the bag is full. */
export function stowCursor(s: GameState): void {
  if (!s.cursor) return;
  const held = addTo(s.inv, s.cursor.id, s.cursor.n, s.cursor.wear);
  drop(s, held);
  if (s.cursor) drop(s, bank(s, s.cursor.id, s.cursor.n, s.cursor.wear));
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
    slots[index] = { ...cursor, n };
    drop(s, n);
  } else if (slot.id === cursor.id && stackSize(slot.id) > 1) {
    const n = Math.min(button === "left" ? cursor.n : 1, stackSize(slot.id) - slot.n);
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
  if (!s.cursor || (slot && (slot.id !== s.cursor.id || slot.n >= stackSize(slot.id)))) return false;
  if (slot) slot.n += 1;
  else slots[index] = { ...s.cursor, n: 1 };
  drop(s, 1);
  return true;
}

/** Hands back one drum, to the cursor if it can hold it. */
function giveDrum(s: GameState, id: string): void {
  if (!s.cursor) s.cursor = { id, n: 1 };
  else if (s.cursor.id === id && s.cursor.n < stackSize(id)) s.cursor.n += 1;
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
  // Tools are kept whole, each with its own wear; everything else is counted up and stacked again.
  const tools: Stack[] = [];
  for (const slot of slots) {
    if (slot && isTool(slot.id)) tools.push(slot);
    else if (slot) totals.set(slot.id, (totals.get(slot.id) ?? 0) + slot.n);
  }
  slots.fill(null);
  let i = 0;
  const ids = [...new Set([...totals.keys(), ...tools.map((t) => t.id)])].sort(compareItems);
  for (const id of ids) {
    for (const tool of tools.filter((t) => t.id === id).sort((a, b) => (a.wear ?? 0) - (b.wear ?? 0))) slots[i++] = tool;
    let left = totals.get(id) ?? 0;
    while (left > 0) {
      const n = Math.min(left, stackSize(id));
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
