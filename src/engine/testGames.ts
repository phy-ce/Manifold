// Test games: ready-made worlds for trying things out without playing up to them.
import { allTools, toolsAt, buildablesAt, DEER, BELT_DRIVE, CONSTRUCTION, WORKBENCH, DRIVE, CAVE, ALL, MAIN, MOTOR, PLAYABLE_STAGES, POWER, machinesAt } from "../content";
import { BASE, CELL_ASPECT, Point, cellsOf, layerOf } from "./world";
import { SPRING_MAX, stackSize, WARE_SLOTS, GameState } from "./state";
import { isDeer, newMobId, deerCanStand } from "./creatures";
import { addTo } from "./inventory";
import { placeMachine } from "./machines";
import { connect } from "./lines";
import { newWarehouse, createGame, reveal, addRivers, addLaterVeins, nameRivers } from "./game";

/** How far around the base the test game shows the map, in cells: far enough to reach every biome. */
const TEST_REVEAL = 160;

/** The test starts there are: everything, the first age, hunting, and every tool. */
export const TEST_SETS = ["full", "mythic", "hunt", "tools", "gather"] as const;
export type TestSet = (typeof TEST_SETS)[number];

/** Starts a test game of one set, on a world of its own, with no tutorial and the map shown far out. */
export function createTestGame(seed: number, set: TestSet = "full"): GameState {
  if (set === "full") return createFullTest(seed);
  const s = createGame(seed);
  if (s.tutorial) s.tutorial.off = true;
  reveal(s, BASE, TEST_REVEAL);
  nameRivers(s);
  if (set === "tools") {
    s.stage = PLAYABLE_STAGES - 1;
    // Every tool, then every iron head and sticks to put more together.
    const heads = ["pick", "axe", "shovel", "spear", "blade"].map((kind) => `iron_${kind}_head`);
    stockShelves(s, [...allTools().map((id): [string, number] => [id, 1]), ...heads.map((id): [string, number] => [id, 2]), ["stick", 64], ["wood", 64], ["stone", 64], ["bone", 32], ["iron", 64]], 40, 360);
    s.gear = { feet: { id: "iron_boots", n: 1 }, back: { id: "iron_pack", n: 1 }, left: { id: "iron_spear", n: 1 }, right: { id: "iron_pick", n: 1 } };
    return s;
  }
  // The first age: its materials, what the deer leave, its machines two each, and its tools.
  s.stage = 0;
  const s0Tools = toolsAt(0);
  stockShelves(s, [
    ["wood", 64], ["stone", 64], ["Kn", 64], ["brick", 64], ["Mt", 32], ["Lg", 32], ["bloom", 16], ["iron", 32], ["stick", 32],
    ["bone", 16], ["hide", 8], ["antler", 8], ["meat", 16], ["roast_meat", 16],
    ...buildablesAt(0).filter((type) => type !== WORKBENCH).map((type): [string, number] => [type, 2]),
    ...(set === "mythic" ? s0Tools.map((id): [string, number] => [id, 1]) : []),
  ], 40, 360);
  if (set === "mythic") {
    s.gear = { ...s.gear, left: { id: "stone_axe", n: 1 }, right: { id: "stone_pick", n: 1 } };
    return s;
  }
  if (set === "gather") {
    // Standing on a vein with two carcasses on it, and one step east two more on bare ground: the gathering
    // window lists them both times. A blade and a pick in hand for either.
    s.gear = { ...s.gear, left: { id: "stone_blade", n: 1 }, right: { id: "stone_pick", n: 1 } };
    const site = s.sites.find((v) => v.cells && (v.z ?? 0) === 0 && v.left > 0 && v.ore !== CAVE);
    if (site) {
      const cell = cellsOf(site).find((c) => layerOf(c) === 0 && c.left > 0)!;
      s.player = { x: cell.x, y: cell.y };
      reveal(s, s.player, 24);
    }
    const lay = (x: number, y: number) => {
      const corpses = (s.corpses ??= []);
      corpses.push({ id: corpses.length + 1, kind: "deer", x, y, z: 0, left: DEER.butcher.cuts });
    };
    lay(s.player.x, s.player.y);
    lay(s.player.x, s.player.y);
    lay(s.player.x + 1, s.player.y);
    lay(s.player.x + 1, s.player.y);
    return s;
  }
  // Hunting: out on deer ground with every spear and blade of the age, and deer grazing close by.
  s.gear = { ...s.gear, left: { id: "stone_blade", n: 1 }, right: { id: "bone_spear", n: 1 } };
  for (const id of s0Tools.filter((t) => /_(spear|blade)$/.test(t))) addTo(s.inv, id, 1);
  addTo(s.inv, "roast_meat", 8);
  const ground = deerGroundNear(s);
  if (ground) {
    s.player = ground;
    reveal(s, ground, 24);
    for (let i = 0; i < 6 && s.mobs.filter(isDeer).length < 3; i += 1) {
      const angle = (i / 6) * Math.PI * 2;
      const at = { x: Math.round(ground.x + Math.cos(angle) * 8), y: Math.round(ground.y + (Math.sin(angle) * 8) / CELL_ASPECT) };
      if (deerCanStand(s, null, at.x, at.y)) s.mobs.push({ id: newMobId(s), kind: "deer", ...at, wait: 1000, cool: 0, hp: DEER.hp });
    }
  }
  return s;
}

/** The nearest open plains or forest cell to the base, off it, ringed by more of the same. */
function deerGroundNear(s: GameState): Point | null {
  for (let r = 12; r <= TEST_REVEAL; r += 4) {
    for (let a = 0; a < 16; a += 1) {
      const at = { x: Math.round(BASE.x + Math.cos((a / 16) * Math.PI * 2) * r), y: Math.round(BASE.y + Math.sin((a / 16) * Math.PI * 2) * r) };
      const ring = [0, 1, 2, 3, 4, 5].map((i) => ({ x: Math.round(at.x + Math.cos((i / 6) * Math.PI * 2) * 8), y: Math.round(at.y + (Math.sin((i / 6) * Math.PI * 2) * 8) / CELL_ASPECT) }));
      if (deerCanStand(s, null, at.x, at.y) && ring.filter((p) => deerCanStand(s, null, p.x, p.y)).length >= 4) return at;
    }
  }
  return null;
}

/** Fills warehouses side by side from x, y with the stacks, as many as it takes. */
function stockShelves(s: GameState, stacks: [string, number][], x: number, y: number): void {
  for (let i = 0; i < stacks.length; i += WARE_SLOTS) {
    const shelf = newWarehouse(s, x + ((i / WARE_SLOTS) % 3) * 260, y + Math.floor(i / WARE_SLOTS / 3) * 160);
    s.nodes.push(shelf);
    stacks.slice(i, i + WARE_SLOTS).forEach(([id, n], j) => {
      shelf.store[j] = { id, n: Math.min(n, stackSize(id)) };
    });
  }
}

/**
 * A running start for trying things out, on a world of its own: every playable stage open, a wound motor
 * driving a brick kiln from a warehouse of raw materials, warehouses of metals, parts and field kit, two of
 * every machine, the player fully equipped, line materials in the bag, and the map shown far enough out
 * to see every biome. No tutorial.
 */
function createFullTest(seed: number): GameState {
  const s = createGame(seed);
  if (s.tutorial) s.tutorial.off = true;
  const store = s.nodes[0];
  // Every ore and fuel there is. This one feeds the kiln, so it holds nothing a line shouldn't carry off: no food.
  const raw: [string, number][] = [
    ["Kn", 64], ["Lm", 64], ["Py", 64], ["Mt", 32], ["Ml", 64], ["Cc", 64], ["Ls", 64], ["Lg", 64], ["Bt", 64], ["An", 32], ["coke", 64],
  ];
  // Metals and bricks, from the bloom to steel, the by-products that come with them, and wood and stone.
  const metals: [string, number][] = [
    ["iron", 32], ["iron", 32], ["bloom", 16], ["pig_iron", 32], ["copper", 32], ["steel", 32], ["brick", 32], ["brick", 32], ["slag", 16], ["sulfur", 16], ["wood", 32], ["stone", 32],
  ];
  // For going out: spare weapons, drums empty and full, and cooked food.
  const kit: [string, number][] = [
    ["iron_spear", 1], ["iron_blade", 1], ["iron_drum", 8], ["water_drum", 8], ["Bc", 16], ["Mc", 16],
    // A slot holds 32: the plates a converter takes spill over here.
    ["iron_plate", 32],
  ];
  // Building parts: enough for a few of each S0 to S1-3 machine, and the steam engine's pieces. One warehouse holds 12.
  const parts: [string, number][] = [
    ["iron_plate", 64], ["copper_tube", 64], ["iron_rod", 64], ["iron_rivet", 64], ["iron_gear", 32], ["iron_spring", 16],
    ["iron_cylinder", 16], ["iron_fan", 4], ["iron_drum", 4], ["steam_drum", 4], ["steam_engine_unit", 4], ["steam_module", 4],
  ];
  // Line materials, one layer each: belts for items, tubes for fluids, rods for power.
  // They weigh 2 each, so the bag stays under its limit and the player can still walk.
  const transport: [string, number][] = [["iron_belt", 16], ["iron_tube", 8], ["iron_rod", 8]];
  raw.forEach(([id, n], i) => {
    store.store[i] = { id, n: Math.min(n, stackSize(id)) };
  });
  const depot = newWarehouse(s, 40, 360);
  s.nodes.push(depot);
  parts.forEach(([id, n], i) => {
    depot.store[i] = { id, n: Math.min(n, stackSize(id)) };
  });
  // Metals sit to the right of the parts.
  const metalStore = newWarehouse(s, 300, 360);
  s.nodes.push(metalStore);
  metals.forEach(([id, n], i) => {
    metalStore.store[i] = { id, n: Math.min(n, stackSize(id)) };
  });
  const kitStore = newWarehouse(s, 560, 360);
  s.nodes.push(kitStore);
  kit.forEach(([id, n], i) => {
    kitStore.store[i] = { id, n: Math.min(n, stackSize(id)) };
  });
  // Lines are paid from the bag, so these go in the player's inventory. The player wears a full set.
  for (const [id, n] of transport) addTo(s.inv, id, n);
  s.gear = { feet: { id: "iron_boots", n: 1 }, back: { id: "iron_pack", n: 1 }, left: { id: "iron_blade", n: 1 }, right: { id: "iron_pick", n: 1 } };
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
  // The whole neighbourhood is shown, so every biome, the rivers and the caves can be found at once.
  reveal(s, BASE, TEST_REVEAL);
  nameRivers(s);
  // The workbench moves aside for a construction bench, which makes everything from S1-1 on.
  const workbench = s.nodes.find((n) => n.type === WORKBENCH)!;
  workbench.x = 780;
  workbench.y = 40;
  placeMachine(s, CONSTRUCTION, 40, 40);
  const motor = placeMachine(s, MOTOR, 300, 40)!;
  motor.energy = SPRING_MAX;
  const kiln = placeMachine(s, "brick_kiln", 300, 200)!;
  // The motor runs a belt drive, and the drive runs the warehouse's belt network.
  const drive = placeMachine(s, BELT_DRIVE, 540, 40)!;
  connect(s, motor.id, drive.id, POWER);
  connect(s, drive.id, store.id, DRIVE);
  connect(s, store.id, kiln.id, ALL);
  connect(s, kiln.id, store.id, MAIN);
  return s;
}
