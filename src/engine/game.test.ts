import { describe, expect, it } from "vitest";
import { FORAGE, stageOres, BIOMES, DRUM, BELT_DRIVE, categoryNames, machineRhythm, formOf, PRESSURE_PUMP, PRESS, CONSTRUCTION, WORKBENCH, STAGES, DRIVE, machineWork, LAYERS, kindOf, machineCost, MACHINE_TYPES, MAX_PORTS, inputRole, outputRole, MOTOR, POWER, PUMP, SURFACE_ORES, WAREHOUSE, itemWeight, buildUses, familyMembers, indexItems, itemName, itemSource, recipesFor, usesOf, machineForms, machineManual, machineName, machinePower, machineTier, fuelValue, matches, processOf, FUEL_GROUP, burners, isGroup, membersOf, machinesAt, RICHNESS, VEINS } from "../content";
import {
  GameState, GameNode, lineLayer, goalMade, itemStats, bagCount, BLAST, riverPipeCost, beltNetOf, pipeNetOf, BELT_MAX, DRIVE_RATE, clickFuel, lacksFuel, OLDEST_SAVE, carryLimit, clickGear, fitModule, needsModule, nodeProcess, removeModule, NAME_MAX, SAVE_VERSION, STEAM_MAX, TANK_CAP, TAR_TANK_CAP, addTo, setOverflow, loadSave, rename, setSafeWalk, yearAt, createGroup, removeGroup, buildAllGhosts, buildGhost, copyToGhosts, installHeld, installMachine, removeGhost, foundRivers, linkRiver, powerLoad, bagHolds, expectedOutput, fillFromBag, lacksPower, riverOf, runsRecipe, createTestGame, upgradeSave, SPRING_LEAK_MS, SPRING_MAX, WIND, hasDrive, windMotor, SEASON_MS as ONE_SEASON, canAffordRoute, failWork, isRevealed, isVisible, isWeak, routeCost, takeInput, visionAt, INV_SLOTS, MAX_CARRY, MAX_VITAL, OUTPUT_CAP, WALK_MS, LOAD_SLOW, carried, overloaded, walkTime, clickInput, clickOutput, clickStack, nudgeFromStore, nudgeToNode, sortSlots, stowCursor, trashCursor, wheelInput, wheelStack, eat, SEASON_MS, canHarvest, routeMaterials, seasonAt, toggleRoute, nodeLabel, atBase, canAfford, connect, connectOptions, countOf, createGame as newGame, mine, moveToNode, nodeById,
  REVEAL, NOTE_MAX, setNote, placeMachine, recipeOf, portsUsed, removeNode, setForm, siteHere, status, step, takeOutput, walkStep, walkTo, workMachine,
} from "./game";
import { BASE, biomeAt, cellsOf, chunkSites, generateSites, orderSites, safePath, terrain } from "./world";
import { gameWithVeins, withVeinsNearBase } from "./testWorld";

/** Most tests aren't about survival, so they keep the player fed. */
const keepAlive = (s: GameState) => {
  s.hp = MAX_VITAL;
  s.hunger = MAX_VITAL;
};
const run = (s: GameState, seconds: number) => {
  for (let i = 0; i < seconds * 10; i += 1) {
    keepAlive(s);
    step(s);
  }
};
/** Runs while steady bellows hold a hand furnace's blast in the middle of its zone. */
const blown = (s: GameState, node: GameNode, seconds: number) => {
  for (let i = 0; i < seconds * 10; i += 1) {
    keepAlive(s);
    node.blast = (BLAST.low + BLAST.high) / 2;
    step(s);
  }
};
/** Walks until there, going on past each hazard safe mode stops at, as a player who has read the warning does. */
const arrive = (s: GameState) => {
  for (let guard = 0; guard < 100000 && (s.path.length || s.halt); guard += 1) {
    if (s.halt) walkTo(s, s.halt.target);
    keepAlive(s);
    step(s);
  }
};
const age = (s: GameState, seconds: number) => {
  for (let i = 0; i < seconds * 10; i += 1) step(s);
};
/**
 * Most tests are about S1-1 and later, so they start a game already past S0: the construction bench
 * is made and stands beside the workbench. Tests about S0 itself use newGame.
 */
const createGame = (seed: number): GameState => {
  const s = newGame(seed);
  s.stage = 1;
  placeMachine(s, CONSTRUCTION, 300, 40);
  return s;
};
const warehouse = (s: GameState) => s.nodes.find((n) => n.type === WAREHOUSE)!;
/** A vein grade's [smallest, largest] size, from the ore data. */
/** A grade's vein sizes, scaled as veins are. */
const grade = (id: string): number[] => RICHNESS.find((r) => r.id === id)!.size.map((n) => n * VEINS.sizeScale);
/** Enough tubes in the bag to pipe out to either riverbank, twice over. */
const tubes = (s: GameState) => addTo(s.inv, "iron_tube", 160);
/** Gives a node a fully wound motor, for tests that aren't about power. */
/**
 * Powers a node with a source that never runs dry. A spring carries and drives pumps;
 * anything that needs steam gets its own stoked engine, whatever stage the test is at.
 */
const power = (s: GameState, id: number) => {
  if (s.lines.some((l) => l.to === id && (l.material === POWER || l.material === DRIVE))) return;
  const node = nodeById(s, id)!;
  if (!machinePower(node.type) || machineTier(node.type) === "spring") {
    const motor = placeMachine(s, MOTOR, 0, 0)!;
    motor.energy = 100000;
    // A machine that uses power takes it straight. Anything else only sends, so it gets a belt drive.
    if (!connect(s, motor.id, id, POWER)) belt(s, id, motor);
    return;
  }
  const stage = s.stage;
  s.stage = Math.max(2, stage);
  const engine = placeMachine(s, "steam_engine", 0, 0)!;
  s.stage = stage;
  // Fed by a boiler that never runs dry.
  engine.energy = STEAM_MAX;
  engine.ins.steam = { id: "steam", n: 99999 };
  node.module = true;
  connect(s, engine.id, id, POWER);
};
/** Makes a machine as a player does: picks it on the construction bench, loads its cost from the bag, works it and takes it. */
const make = (s: GameState, type: string): boolean => {
  const bench = s.nodes.find((n) => n.type === CONSTRUCTION)!;
  setForm(s, bench.id, type);
  fillFromBag(s, bench.id, recipeOf(bench), 1);
  if (status(bench) !== "manual") return false;
  for (let i = 0; i < recipeOf(bench).time; i += 1) workMachine(s, bench.id);
  return takeOutput(s, bench.id, type);
};
/** Joins a node's belt network to a belt drive on a motor that never runs down, unless it has one. */
const belt = (s: GameState, id: number, motor?: GameNode) => {
  if (s.lines.some((l) => l.to === id && l.material === DRIVE)) return;
  if (!motor) {
    motor = placeMachine(s, MOTOR, 0, 0)!;
    motor.energy = 100000;
  }
  const drive = placeMachine(s, BELT_DRIVE, 0, 0)!;
  connect(s, motor.id, drive.id, POWER);
  connect(s, drive.id, id, DRIVE);
};
const carrying = (s: GameState) => s.lines.filter((l) => l.material !== POWER && l.material !== DRIVE);
/** Routes cost parts; tests about routing itself just pay for them. */
const route = (s: GameState, from: number, to: number, material: string) => {
  s.inv[6] = { id: "iron_belt", n: 64 };
  s.inv[7] = { id: "iron_rod", n: 64 };
  s.inv[8] = { id: "iron_tube", n: 64 };
  power(s, from);
  belt(s, from);
  return toggleRoute(s, from, to, material);
};
const press = (s: GameState, id: number, times: number) => {
  for (let i = 0; i < times; i += 1) workMachine(s, id);
};

/** Walks out, mines by hand, walks home and banks the ore. */
function gather(s: GameState, family: string, amount: number) {
  let left = amount;
  // Only S0's essentials are promised near the base. A chain test that needs more lays a vein of its own,
  // a little way out, so it tests the chain rather than how lucky the map is.
  const stock = s.sites.filter((x) => matches(x.ore, family)).reduce((n, x) => n + x.left, 0);
  if (stock < amount) {
    const ore = SURFACE_ORES.find((id) => matches(id, family))!;
    const spot = { x: 6, y: 3 + s.sites.length % 5 };
    s.sites.push({ id: s.sites.length, ore, ...spot, total: amount - stock, left: amount - stock, seed: 1 });
  }
  for (const site of s.sites.filter((x) => matches(x.ore, family))) {
    while (left > 0 && site.left > 0) {
      // A vein runs over several cells: go to one that still holds ore.
      walkTo(s, cellsOf(site).find((cell) => cell.left > 0)!);
      arrive(s);
      let carried = 0;
      while (carried < 300 && left > 0 && mine(s)) {
        carried += 1;
        left -= 1;
      }
      walkTo(s, BASE);
      arrive(s);
      s.inv.forEach((_, i) => moveToNode(s, i, warehouse(s).id));
    }
  }
  expect(left).toBe(0);
}

describe("world", () => {
  it("is deterministic per seed", () => {
    expect(generateSites(7)).toEqual(generateSites(7));
    expect(generateSites(7)).not.toEqual(generateSites(8));
  });

  it("promises no vein near the base: only food is laid there, the rest is rolled like anywhere else", () => {
    expect(VEINS.starter.families).toEqual([]);
    for (let seed = 1; seed <= 300; seed += 1) {
      const sites = generateSites(seed);
      expect(sites.filter((x) => SURFACE_ORES.includes(x.ore))).toEqual([]);
      expect(sites.some((x) => FORAGE.includes(x.ore))).toBe(true);
    }
  });
});

describe("endless map", () => {
  it("rolls the same chunk the same way", () => {
    expect(chunkSites(7, 12, -3)).toEqual(chunkSites(7, 12, -3));
    const a = Array.from({ length: 40 }, (_, i) => chunkSites(7, i + 5, 5));
    const b = Array.from({ length: 40 }, (_, i) => chunkSites(8, i + 5, 5));
    expect(a).not.toEqual(b);
  });

  it("keeps finding veins however far the player walks, in any direction", () => {
    for (const target of [{ x: 600, y: 0 }, { x: -600, y: 0 }, { x: 0, y: 400 }, { x: 0, y: -400 }]) {
      const s = createGame(5);
      const before = s.sites.length;
      walkTo(s, target);
      arrive(s);
      expect(s.player).toEqual(target);
      expect(s.sites.length).toBeGreaterThan(before + 3);
    }
  });

  it("doesn't scale vein size with distance", () => {
    const sizes = (from: number) => {
      const list: number[] = [];
      for (let cx = from; cx < from + 30; cx += 1) {
        for (let cy = from; cy < from + 30; cy += 1) {
          list.push(...chunkSites(3, cx, cy).filter((v) => SURFACE_ORES.includes(v.ore)).map((v) => v.total));
        }
      }
      return list;
    };
    for (const total of [...sizes(5), ...sizes(5000)]) {
      expect(total).toBeGreaterThanOrEqual(grade("scarce")[0]);
      expect(total).toBeLessThanOrEqual(grade("rich")[1]);
    }
  });

  it("walks one cell per key step at the same pace as a clicked walk", () => {
    const s = createGame(5);
    expect(walkStep(s, 1, 0)).toBe(true);
    expect(s.path).toEqual([{ x: BASE.x + 1, y: BASE.y }]);
    // Nothing moves before a full step's time has passed.
    let ticks = 0;
    while (s.player.x === BASE.x && ticks < 1000) {
      step(s);
      ticks += 1;
    }
    expect(ticks).toBe(Math.ceil(walkTime(s) / 100));
    expect(s.player).toEqual({ x: BASE.x + 1, y: BASE.y });
    // Two keys at once go diagonally, and a key replaces a clicked walk.
    walkTo(s, { x: BASE.x + 20, y: BASE.y });
    walkStep(s, -1, 1);
    expect(s.path).toEqual([{ x: BASE.x, y: BASE.y + 1 }]);
    expect(walkStep(s, 0, 0)).toBe(false);
  });

  it("does not walk by key while overloaded", () => {
    const s = createGame(5);
    addTo(s.inv, "iron", 999);
    expect(overloaded(s)).toBe(true);
    expect(walkStep(s, 1, 0)).toBe(false);
    expect(s.path).toEqual([]);
  });

  it("keeps mined amounts after walking away and back", () => {
    const s = createGame(5);
    const site = s.sites[0];
    walkTo(s, site);
    arrive(s);
    mine(s);
    const left = site.left;
    walkTo(s, { x: 300, y: 0 });
    arrive(s);
    walkTo(s, site);
    arrive(s);
    expect(siteHere(s)!.left).toBe(left);
  });

  it("never stacks two veins on one cell", () => {
    const s = createGame(9);
    walkTo(s, { x: 500, y: 300 });
    arrive(s);
    // On either layer, as each layer counts its own cells.
    const cells = s.sites.flatMap((v) => cellsOf(v).map((c) => `${c.z ?? 0},${c.x},${c.y}`));
    expect(new Set(cells).size).toBe(cells.length);
  });
});

describe("rules", () => {
  it("has a recipe for every S1-1 machine", () => {
    for (const type of MACHINE_TYPES.filter((t) => t !== WAREHOUSE && t !== MOTOR && t !== BELT_DRIVE)) {
      expect(processOf(type, machineForms(type)[0] ?? "").recipes.length).toBeGreaterThan(0);
    }
  });

  it("limits mining to the cell underfoot", () => {
    const s = gameWithVeins(1);
    const site = s.sites[0];
    const cell = site.cells!.find((c) => c.x === site.x && c.y === site.y)!;
    site.left -= cell.left - 2;
    cell.left = 2;
    walkTo(s, site);
    arrive(s);
    expect(siteHere(s)).toBe(site);
    expect([mine(s), mine(s), mine(s)]).toEqual([true, true, false]);
  });

  it("only allows base work at the base", () => {
    const s = createGame(1);
    walkTo(s, s.sites[0]);
    arrive(s);
    expect(atBase(s)).toBe(false);
    expect(placeMachine(s, "brick_kiln", 0, 0)).toBeNull();
  });

  it("keeps machines running while the player is away", () => {
    const s = createGame(1);
    const kiln = placeMachine(s, "brick_kiln", 0, 0)!;
    kiln.ins.clay = { id: "Kn", n: 8 };
    kiln.fuel = { id: "Lg", n: 4 };
    walkTo(s, s.sites[0]);
    run(s, 9);
    expect(kiln.outs.brick).toBe(2);
  });

  it("stops a machine when an unconnected by-product fills up", () => {
    const s = createGame(1);
    const furnace = placeMachine(s, "bloomery", 0, 0)!;
    furnace.ins.iron_ore = { id: "Lm", n: 15 };
    furnace.fuel = { id: "Lg", n: 16 };
    furnace.outs.slag = OUTPUT_CAP;
    expect(status(furnace)).toBe("blocked");
    // Even with the bellows holding the blast in the zone, nothing moves.
    blown(s, furnace, 12);
    expect(furnace.ins.iron_ore!.n).toBe(15);
    expect(furnace.progress).toBe(0);
  });

  it("enforces the port limit", () => {
    const s = createGame(1);
    const store = warehouse(s);
    for (let i = 0; i < MAX_PORTS; i += 1) {
      const kiln = placeMachine(s, "brick_kiln", 0, 0)!;
      expect(connect(s, store.id, kiln.id, "all")).toBeTruthy();
    }
    const extra = placeMachine(s, "brick_kiln", 0, 0)!;
    expect(portsUsed(s, store.id)).toBe(MAX_PORTS);
    expect(connectOptions(s, store.id, extra.id)).toEqual([]);
  });

  it("only offers materials the target can use", () => {
    const s = createGame(1);
    const forge = placeMachine(s, "hand_forge", 0, 0)!;
    const hammer = placeMachine(s, "plate_hammer", 0, 0)!;
    expect(connectOptions(s, forge.id, hammer.id)).toEqual(["main"]);
    expect(connectOptions(s, hammer.id, forge.id)).toEqual([]);
  });

  it("returns a removed machine's contents to the warehouse", () => {
    const s = createGame(1);
    const kiln = placeMachine(s, "brick_kiln", 0, 0)!;
    kiln.ins.clay = { id: "Kn", n: 5 };
    removeNode(s, kiln.id);
    expect(nodeById(s, kiln.id)).toBeUndefined();
    expect(warehouse(s).store[0]).toEqual({ id: "Kn", n: 5 });
  });

  it("survives a save round trip", () => {
    const s = createGame(3);
    placeMachine(s, "bloomery", 5, 5);
    run(s, 1);
    expect(JSON.parse(JSON.stringify(s))).toEqual(s);
  });
});

describe("materials", () => {
  /** One batch of ore through a bloomery, with the bellows held in the zone. */
  const smelt = (ore: string, n: number) => {
    const s = createGame(1);
    const furnace = placeMachine(s, "bloomery", 0, 0)!;
    furnace.ins.iron_ore = { id: ore, n };
    furnace.fuel = { id: "Lg", n: 4 };
    // Long enough for the slowest batch, sulfide copper at 12 s, and not for a second one.
    blown(s, furnace, 13);
    return furnace;
  };

  it("names parts from metal and form", () => {
    expect(itemName("iron_plate")).toBe("철판");
    expect(itemName("copper_plate")).toBe("구리판");
    expect(itemName("copper_tube")).toBe("구리관");
    expect(itemName("iron_cylinder")).toBe("철 실린더");
  });

  it("lights the bloomery's fire only once the bellows blow it into the green", () => {
    const s = createGame(1);
    const furnace = placeMachine(s, "bloomery", 0, 0)!;
    furnace.ins.iron_ore = { id: "Lm", n: 3 };
    furnace.fuel = { id: "Lg", n: 4 };
    for (let i = 0; i < 30; i += 1) step(s);
    // Loaded, but cold: no fuel burnt, nothing done.
    expect(furnace.fuel).toEqual({ id: "Lg", n: 4 });
    expect(furnace.heat ?? 0).toBe(0);
    while ((furnace.blast ?? 0) < BLAST.low) workMachine(s, furnace.id);
    step(s);
    expect(furnace.fuel).toEqual({ id: "Lg", n: 3 });
    expect(furnace.heat).toBeGreaterThan(0);
  });

  it("lets the ore decide what the bloomery makes", () => {
    // Iron ore gives a bloom for the forge; oxide and sulfide copper ore give copper outright.
    expect(smelt("Lm", 3).outs.bloom).toBe(1);
    expect(smelt("Ml", 2).outs.copper).toBe(1);
    expect(smelt("Cc", 3).outs.copper).toBe(1);
    // Pyrite is an iron ore with a roast of its own: less iron for the ore, and sulfur powder besides.
    const pyrite = smelt("Py", 4);
    expect(pyrite.outs.bloom).toBe(1);
    expect(pyrite.outs.sulfur).toBe(2);
    expect(machineForms("bloomery")).toEqual([]);
  });

  it("lets the metal decide the plate, with no form choice on the hammer", () => {
    const s = createGame(1);
    const hammer = placeMachine(s, "plate_hammer", 0, 0)!;
    expect(machineForms("plate_hammer")).toEqual(["plate"]);
    hammer.ins.iron = { id: "copper", n: 2 };
    press(s, hammer.id, 3);
    expect(hammer.outs.copper_plate).toBe(1);
  });

  it("gives the bloomery one metal slot and one by-product slot", () => {
    expect(processOf("bloomery", "").outSlots).toEqual([["bloom", "copper"], ["slag", "sulfur"]]);
    // Pig iron makes its own tube, a kind of iron tube.
    expect(processOf("forming_bench", "tube").outSlots).toEqual([["iron_tube", "copper_tube", "pig_iron_tube"]]);
  });

  it("stops when the metal slot still holds another metal", () => {
    const s = createGame(1);
    const furnace = placeMachine(s, "bloomery", 0, 0)!;
    furnace.outs.bloom = 3;
    furnace.ins.iron_ore = { id: "Ml", n: 2 };
    furnace.fuel = { id: "Lg", n: 1 };
    expect(status(furnace)).toBe("blocked");
    furnace.outs.bloom = 0;
    expect(status(furnace)).toBe("manual");
  });

  it("works softer metals faster", () => {
    const s = createGame(1);
    const soft = placeMachine(s, "plate_hammer", 0, 0)!;
    const hard = placeMachine(s, "plate_hammer", 0, 0)!;
    soft.ins.iron = { id: "copper", n: 2 };
    hard.ins.iron = { id: "iron", n: 2 };
    press(s, soft.id, 3);
    press(s, hard.id, 3);
    expect(soft.outs.copper_plate).toBe(1);
    expect(hard.outs.iron_plate).toBe(0);
  });

  it("offers forms, not metals, on the forming bench", () => {
    expect(machineForms("forming_bench")).toEqual(["tube", "cylinder", "drum", "rod", "rivet", "gear", "spring", "belt", "fan", "boots", "pack", "pick", "blade", "spear"]);
  });

  it("makes the chosen form from whichever metal goes in", () => {
    const s = createGame(1);
    const bench = placeMachine(s, "forming_bench", 0, 0)!;
    setForm(s, bench.id, "cylinder");
    bench.ins.iron = { id: "copper", n: 4 };
    press(s, bench.id, 9);
    expect(bench.outs.copper_cylinder).toBe(1);
  });

  it("keeps the metal in the machine when the form changes", () => {
    const s = createGame(1);
    const bench = placeMachine(s, "forming_bench", 0, 0)!;
    bench.ins.iron = { id: "iron", n: 3 };
    setForm(s, bench.id, "cylinder");
    expect(bench.ins.iron).toEqual({ id: "iron", n: 3 });
  });

  it("hands finished parts to the player when the form changes", () => {
    const s = createGame(1);
    const bench = placeMachine(s, "forming_bench", 0, 0)!;
    bench.outs.iron_tube = 2;
    setForm(s, bench.id, "cylinder");
    expect(s.inv[0]).toEqual({ id: "iron_tube", n: 2 });
  });

  it("waits for a full batch before it can be worked", () => {
    const s = createGame(1);
    const bench = placeMachine(s, "forming_bench", 0, 0)!;
    setForm(s, bench.id, "cylinder");
    bench.ins.iron = { id: "iron", n: 3 };
    expect(status(bench)).toBe("idle");
    bench.ins.iron = { id: "iron", n: 4 };
    expect(status(bench)).toBe("manual");
  });

  it("cuts stale lines when the form changes", () => {
    const s = createGame(1);
    const bench = placeMachine(s, "forming_bench", 0, 0)!;
    const boiler = placeMachine(s, "boiler_bench", 0, 0)!;
    const forge = placeMachine(s, "hand_forge", 0, 0)!;
    bench.ins.iron = { id: "iron", n: 3 };
    connect(s, forge.id, bench.id, "main");
    connect(s, bench.id, boiler.id, "main");
    setForm(s, bench.id, "cylinder");
    expect(s.lines.map((l) => l.material)).toEqual(["main"]);
  });
});

describe("manual work", () => {
  it("does nothing on its own without the player", () => {
    const s = createGame(1);
    const hammer = placeMachine(s, "plate_hammer", 0, 0)!;
    hammer.ins.iron = { id: "iron", n: 2 };
    expect(status(hammer)).toBe("manual");
    run(s, 30);
    expect(hammer.outs.iron_plate).toBe(0);
    expect(hammer.progress).toBe(0);
  });

  it("finishes after one press per second of work", () => {
    const s = createGame(1);
    const hammer = placeMachine(s, "plate_hammer", 0, 0)!;
    hammer.ins.iron = { id: "iron", n: 2 };
    press(s, hammer.id, 3);
    expect(hammer.outs.iron_plate).toBe(0);
    press(s, hammer.id, 1);
    expect(hammer.outs.iron_plate).toBe(1);
  });

  it("can't be worked while empty, blocked, or away", () => {
    const s = createGame(1);
    const hammer = placeMachine(s, "plate_hammer", 0, 0)!;
    expect(workMachine(s, hammer.id)).toBe(false);
    hammer.ins.iron = { id: "iron", n: 2 };
    walkTo(s, s.sites[0]);
    arrive(s);
    expect(workMachine(s, hammer.id)).toBe(false);
  });

  it("leaves fuel-fired machines automatic", () => {
    expect(machineManual("brick_kiln")).toBeUndefined();
    expect(machineManual("plate_hammer")).toBe("rhythm");
    expect(machineManual("bloomery")).toBe("bellows");
    expect(machineManual("forming_bench")).toBe("keys");
    expect(machineManual("boiler_bench")).toBe("keys");
  });
});

describe("labels and lines", () => {
  it("gives each machine its own three-character code", () => {
    const s = createGame(1);
    const codes = [warehouse(s).code, ...Array.from({ length: 200 }, () => placeMachine(s, "brick_kiln", 0, 0)!.code)];
    for (const code of codes) expect(code).toMatch(/^[0-9a-z]{3}$/);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("never reuses a code", () => {
    const s = createGame(1);
    const a = placeMachine(s, "brick_kiln", 0, 0)!;
    const code = a.code;
    removeNode(s, a.id);
    expect(placeMachine(s, "brick_kiln", 0, 0)!.code).not.toBe(code);
  });

  it("shows the form on machines that have one", () => {
    const s = createGame(1);
    const a = placeMachine(s, "forming_bench", 0, 0)!;
    expect(nodeLabel(s, a)).toBe(`성형대 (관) ${a.code}`);
    setForm(s, a.id, "cylinder");
    expect(nodeLabel(s, a)).toBe(`성형대 (실린더) ${a.code}`);
  });


  it("gives a warehouse one channel, because it has no filter", () => {
    const s = createGame(1);
    const kiln = placeMachine(s, "brick_kiln", 0, 0)!;
    expect(routeMaterials(s, warehouse(s).id, kiln.id)).toEqual(["all"]);
  });

  it("gives a machine main and by-product channels", () => {
    const s = createGame(1);
    const furnace = placeMachine(s, "bloomery", 0, 0)!;
    expect(routeMaterials(s, furnace.id, warehouse(s).id)).toEqual(["main", "byproduct"]);
    const hammer = placeMachine(s, "plate_hammer", 0, 0)!;
    expect(routeMaterials(s, hammer.id, warehouse(s).id)).toEqual(["main"]);
  });

  it("fills from the first slot, then moves on to what the target still needs", () => {
    const s = createGame(1);
    const kiln = placeMachine(s, "brick_kiln", 0, 0)!;
    const store = warehouse(s);
    store.store[0] = { id: "Kn", n: 2 };
    store.store[1] = { id: "Lm", n: 5 };
    store.store[2] = { id: "Lg", n: 1 };
    route(s, store.id, kiln.id, "all");
    run(s, 2);
    expect(kiln.ins.clay).toEqual({ id: "Kn", n: 2 });
    // The coal went to the firebox, and the kiln has already started burning it.
    expect(store.store[2]).toBeNull();
    expect(!!kiln.fuel || (kiln.heat ?? 0) > 0).toBe(true);
    expect(store.store[1]).toEqual({ id: "Lm", n: 5 });
  });

  it("runs a kiln from one warehouse on a single line", () => {
    const s = createGame(1);
    const kiln = placeMachine(s, "brick_kiln", 0, 0)!;
    const store = warehouse(s);
    store.store[0] = { id: "Kn", n: 20 };
    store.store[1] = { id: "Lg", n: 10 };
    route(s, store.id, kiln.id, "all");
    run(s, 40);
    expect(kiln.outs.brick).toBeGreaterThan(3);
  });

  it("has no filter: two ores in one warehouse both go in", () => {
    const s = createGame(1);
    const furnace = placeMachine(s, "bloomery", 0, 0)!;
    const store = warehouse(s);
    store.store[0] = { id: "Ml", n: 1 };
    store.store[1] = { id: "Lm", n: 1 };
    route(s, store.id, furnace.id, "all");
    run(s, 1);
    expect(furnace.ins.iron_ore).toEqual({ id: "Ml", n: 1 });
  });

  it("keeps by-products off the main channel", () => {
    const s = createGame(1);
    const furnace = placeMachine(s, "bloomery", 0, 0)!;
    furnace.outs.bloom = 1;
    furnace.outs.slag = 1;
    route(s, furnace.id, warehouse(s).id, "main");
    run(s, 2);
    expect(furnace.outs.slag).toBe(1);
    expect(furnace.outs.bloom).toBe(0);
  });

  it("switches a channel back off", () => {
    const s = createGame(1);
    const kiln = placeMachine(s, "brick_kiln", 0, 0)!;
    route(s, warehouse(s).id, kiln.id, "all");
    route(s, warehouse(s).id, kiln.id, "all");
    expect(carrying(s)).toEqual([]);
  });

  it("connects warehouses and moves everything across", () => {
    const s = createGame(1);
    const other = placeMachine(s, WAREHOUSE, 0, 0)!;
    route(s, warehouse(s).id, other.id, "all");
    warehouse(s).store[0] = { id: "Kn", n: 2 };
    run(s, 2);
    expect(other.store[0]).toEqual({ id: "Kn", n: 2 });
  });

  it("won't add a route past the port limit", () => {
    const s = createGame(1);
    const store = warehouse(s);
    for (let i = 0; i < MAX_PORTS; i += 1) route(s, store.id, placeMachine(s, "brick_kiln", 0, 0)!.id, "all");
    const extra = placeMachine(s, "brick_kiln", 0, 0)!;
    expect(route(s, store.id, extra.id, "all")).toBe(false);
  });
});

describe("warehouses", () => {
  /** The parts a warehouse costs, short by one plate when asked. */
  const withParts = (short = false) => {
    const s = createGame(1);
    s.inv[0] = { id: "iron_plate", n: short ? 5 : 6 };
    s.inv[1] = { id: "iron_rod", n: 4 };
    s.inv[2] = { id: "iron_rivet", n: 8 };
    return s;
  };
  const buildWarehouse = (s: GameState) => {
    expect(make(s, WAREHOUSE)).toBe(true);
    return installMachine(s, WAREHOUSE, 0, 0)!;
  };

  it("costs metal to build", () => {
    expect(make(withParts(true), WAREHOUSE)).toBe(false);
    const s = withParts();
    buildWarehouse(s);
    for (const id of ["iron_plate", "iron_rod", "iron_rivet"]) expect(countOf(s, id)).toBe(0);
  });

  it("counts what every warehouse holds", () => {
    const s = withParts();
    const extra = buildWarehouse(s);
    extra.store[0] = { id: "Kn", n: 12 };
    warehouse(s).store[0] = { id: "Kn", n: 8 };
    expect(countOf(s, "clay")).toBe(20);
  });

  it("overflows into the next warehouse", () => {
    const s = withParts();
    const extra = buildWarehouse(s);
    warehouse(s).store.fill({ id: "Lm", n: 64 });
    const kiln = placeMachine(s, "brick_kiln", 0, 0)!;
    kiln.ins.clay = { id: "Kn", n: 5 };
    removeNode(s, kiln.id);
    expect(extra.store.some((slot) => slot?.id === "Kn")).toBe(true);
  });

  it("keeps the first warehouse and needs a built one emptied before demolition", () => {
    const s = withParts();
    const extra = buildWarehouse(s);
    expect(removeNode(s, warehouse(s).id)).toBe(false);
    extra.store[0] = { id: "Kn", n: 1 };
    expect(removeNode(s, extra.id)).toBe(false);
    extra.store[0] = null;
    expect(removeNode(s, extra.id)).toBe(true);
    expect(countOf(s, WAREHOUSE)).toBe(1);
  });

  it("moves goods between lines into a built warehouse", () => {
    const s = withParts();
    const extra = buildWarehouse(s);
    const yard = placeMachine(s, "hand_forge", 0, 0)!;
    yard.outs.iron = 2;
    connect(s, yard.id, extra.id, "main");
    power(s, yard.id);
    run(s, 2);
    expect(extra.store[0]).toEqual({ id: "iron", n: 2 });
  });
});

describe("slot roles", () => {
  it("names slots by what they are for, not by the material", () => {
    // Fuel has its own firebox, so recipe slots only hold materials.
    expect(processOf("brick_kiln", "").slots.map((slot) => inputRole(slot.key))).toEqual(["재료"]);
    expect(processOf("bloomery", "").slots.map((slot) => inputRole(slot.key))).toEqual(["재료"]);
    expect([0, 1, 2].map(outputRole)).toEqual(["결과", "부산물", "부산물"]);
  });
});

describe("item index", () => {
  const ids = (list: { id: string }[]) => list.map((r) => r.id);

  it("makes every metal's plate on both hammers, the steam hammer with the better yield", () => {
    for (const metal of ["iron", "copper"]) {
      const ways = recipesFor(`${metal}_plate`, 2);
      expect(ways.find((r) => r.machine === "plate_hammer")).toMatchObject({ in: { [metal]: 2 }, out: { [`${metal}_plate`]: 1 } });
      expect(ways.find((r) => r.machine === "steam_hammer")).toMatchObject({ in: { [metal]: 3 }, out: { [`${metal}_plate`]: 2 } });
    }
    // Steel plate only shows once steel can be made.
    expect(recipesFor("steel_plate", 2)).toEqual([]);
    expect(recipesFor("steel_plate", 3).map((r) => r.machine)).toEqual(expect.arrayContaining(["plate_hammer", "steam_hammer"]));
  });

  it("smelts oxide copper ore simply, and sulfide copper ore poorly unless through the blast furnace and converter", () => {
    const s = createGame(3);
    s.stage = 3;
    const run = (type: string, inputs: [string, number][]) => {
      const node = placeMachine(s, type, 0, 0)!;
      const slots = nodeProcess(node).slots;
      inputs.forEach(([id, n], i) => { node.ins[slots[i].key] = { id, n }; });
      return recipeOf(node);
    };
    // Slots keep the names of each machine's first recipe, so old saves still fit.
    expect(nodeProcess(placeMachine(s, "bloomery", 0, 0)!).slots[0].key).toBe("iron_ore");
    expect(run("bloomery", [["Ml", 2]])).toMatchObject({ id: "copper", out: { copper: 1, slag: 1 } });
    expect(run("bloomery", [["Cc", 3]])).toMatchObject({ id: "copper_sulfide_smelt", in: { copper_sulfide: 3 }, out: { copper: 1 } });
    expect(run("blast_furnace", [["Cc", 4], ["coke", 2], ["Ls", 1]])).toMatchObject({ id: "copper_matte", out: { copper_matte: 3 } });
    expect(run("blast_furnace", [["Py", 4], ["coke", 2], ["Ls", 1]])).toMatchObject({ id: "iron_blast" });
    expect(run("converter", [["copper_matte", 2]])).toMatchObject({ id: "copper_converted", out: { copper: 2 } });
    expect(run("converter", [["iron", 4]])).toMatchObject({ id: "steel" });
    expect(machineName("converter")).toBe("전로");
    // Oxide ore isn't sulfide, so it never goes down the matte route.
    expect(matches("Ml", "copper_sulfide")).toBe(false);
    expect(matches("Cc", "copper_oxide")).toBe(false);
  });

  it("lists current items and hides later tiers", () => {
    const items = indexItems(1);
    for (const id of ["Lm", "Lg", "Kn", "Ml", "Be", "iron", "copper_plate", "iron_cylinder", "steam_engine_unit", "Bc"]) {
      expect(items).toContain(id);
    }
    for (const id of ["steel", "coke", "port_flange", "steam_generator"]) expect(items).not.toContain(id);
  });

  it("doesn't list ore families as items", () => {
    for (const id of ["coal", "iron_ore", "clay", "copper_ore"]) expect(indexItems()).not.toContain(id);
    expect(familyMembers("coal")).toEqual(["Lg"]);
  });

  it("shows how an item is made", () => {
    // Iron is forged by hand from a bloom, and stays that way through S1-1 and S1-2.
    expect(ids(recipesFor("iron"))).toEqual(["forge_iron"]);
    expect(ids(recipesFor("iron", 2))).toEqual(["forge_iron"]);
    expect(ids(recipesFor("bloom", 1))).toEqual(["bloomery_bloom", "pyrite_roast"]);
    expect(ids(recipesFor("copper", 1))).toEqual(expect.arrayContaining(["copper", "copper_sulfide_smelt"]));
    expect(ids(recipesFor("copper_tube", 1))).toEqual(["tube_copper"]);
  });

  it("shows what an item is used for, through its ore family too", () => {
    expect(ids(usesOf("iron", 1))).toEqual(expect.arrayContaining(["plate_iron", "tube_iron", "cylinder_iron"]));
    // Coal burns as fuel, which isn't a recipe; as a material it goes into coke.
    expect(ids(usesOf("Lg", 3))).toEqual(expect.arrayContaining(["coke"]));
    expect(usesOf("slag")).toEqual([]);
  });

  it("names each raw item by its categories too, for map search", () => {
    expect(categoryNames("Kn")).toContain("점토");
    expect(categoryNames("Ml")).toEqual(expect.arrayContaining(["구리광", "산화 구리광"]));
    expect(categoryNames("Lg")).toEqual(expect.arrayContaining(["석탄", "연료"]));
    expect(categoryNames("Be")).toContain("음식");
  });

  it("treats ore families and fuel as groups with members", () => {
    expect(membersOf("coal")).toEqual(["Lg", "Bt", "An"]);
    expect(membersOf("clay")).toEqual(["Kn"]);
    expect(membersOf(FUEL_GROUP)).toEqual(["Lg", "Bt", "An", "coke"]);
    expect(isGroup("Lg")).toBe(false);
    expect(itemName(FUEL_GROUP)).toBe("연료");
  });

  it("knows which machines burn fuel", () => {
    expect(burners(1)).toEqual(expect.arrayContaining(["brick_kiln", "bloomery"]));
    expect(burners(1)).not.toContain("smelter");
    expect(burners(1)).not.toContain("plate_hammer");
  });

  it("shows which buildings need an item", () => {
    expect(buildUses("iron_rivet", 1).map(([type]) => type)).toContain("warehouse");
    expect(buildUses("Kn", 1).map(([type]) => type)).toContain("brick_kiln");
  });

  it("says where raw items come from", () => {
    expect(itemSource("Lm")).toBeTruthy();
    expect(itemSource("Be")).toBeTruthy();
    expect(itemSource("iron")).toBeNull();
  });
});

describe("moving items by hand", () => {
  const bag = (...stacks: [string, number][]) => {
    const s = createGame(1);
    stacks.forEach(([id, n], i) => { s.inv[i] = { id, n }; });
    return s;
  };

  it("merges two stacks into one slot", () => {
    const s = bag(["Lm", 21], ["Lm", 30]);
    clickStack(s, s.inv, 0, "left");
    expect(s.cursor).toEqual({ id: "Lm", n: 21 });
    expect(s.inv[0]).toBeNull();
    clickStack(s, s.inv, 1, "left");
    expect(s.inv[1]).toEqual({ id: "Lm", n: 51 });
    expect(s.cursor).toBeNull();
  });

  it("keeps the overflow on the cursor when a merge doesn't fit", () => {
    const s = bag(["Lm", 40], ["Lm", 30]);
    clickStack(s, s.inv, 0, "left");
    clickStack(s, s.inv, 1, "left");
    expect(s.inv[1]).toEqual({ id: "Lm", n: 64 });
    expect(s.cursor).toEqual({ id: "Lm", n: 6 });
  });

  it("swaps different items", () => {
    const s = bag(["Lm", 5], ["Kn", 3]);
    clickStack(s, s.inv, 0, "left");
    clickStack(s, s.inv, 1, "left");
    expect(s.inv[1]).toEqual({ id: "Lm", n: 5 });
    expect(s.cursor).toEqual({ id: "Kn", n: 3 });
  });

  it("right click takes half, rounded up, and places one", () => {
    const s = bag(["Lm", 7]);
    clickStack(s, s.inv, 0, "right");
    expect(s.cursor!.n).toBe(4);
    expect(s.inv[0]!.n).toBe(3);
    clickStack(s, s.inv, 5, "right");
    expect(s.inv[5]).toEqual({ id: "Lm", n: 1 });
    expect(s.cursor!.n).toBe(3);
  });

  it("moves one at a time with the wheel", () => {
    const s = bag(["Lm", 3]);
    expect(wheelStack(s, s.inv, 0, "out")).toBe(true);
    expect(s.cursor).toEqual({ id: "Lm", n: 1 });
    expect(wheelStack(s, s.inv, 4, "in")).toBe(true);
    expect(s.inv[4]).toEqual({ id: "Lm", n: 1 });
    expect(s.cursor).toBeNull();
    expect(wheelStack(s, s.inv, 4, "in")).toBe(false);
  });

  it("feeds a machine from the cursor, whole or one at a time", () => {
    const s = bag(["Lm", 10]);
    const furnace = placeMachine(s, "bloomery", 0, 0)!;
    clickStack(s, s.inv, 0, "left");
    clickInput(s, furnace.id, "iron_ore", "right");
    expect(furnace.ins.iron_ore).toEqual({ id: "Lm", n: 1 });
    expect(wheelInput(s, furnace.id, "iron_ore", "in")).toBe(true);
    expect(furnace.ins.iron_ore!.n).toBe(2);
    clickInput(s, furnace.id, "iron_ore", "left");
    expect(furnace.ins.iron_ore!.n).toBe(10);
    expect(s.cursor).toBeNull();
  });

  it("refuses the wrong material in a machine slot", () => {
    const s = bag(["Kn", 4]);
    const furnace = placeMachine(s, "bloomery", 0, 0)!;
    clickStack(s, s.inv, 0, "left");
    clickInput(s, furnace.id, "iron_ore", "left");
    expect(furnace.ins.iron_ore).toBeNull();
    expect(s.cursor).toEqual({ id: "Kn", n: 4 });
  });

  it("takes machine output onto the cursor", () => {
    const s = createGame(1);
    const furnace = placeMachine(s, "bloomery", 0, 0)!;
    furnace.outs.bloom = 5;
    clickOutput(s, furnace.id, "bloom", "right");
    expect(s.cursor).toEqual({ id: "bloom", n: 3 });
    expect(furnace.outs.bloom).toBe(2);
  });

  it("nudges single items with empty hands", () => {
    const s = bag(["Lm", 2]);
    const furnace = placeMachine(s, "bloomery", 0, 0)!;
    expect(nudgeToNode(s, 0, furnace.id)).toBe(true);
    expect(furnace.ins.iron_ore).toEqual({ id: "Lm", n: 1 });
    expect(wheelInput(s, furnace.id, "iron_ore", "out")).toBe(true);
    expect(furnace.ins.iron_ore).toBeNull();
    expect(s.inv[0]).toEqual({ id: "Lm", n: 2 });
    warehouse(s).store[0] = { id: "Kn", n: 2 };
    expect(nudgeFromStore(s, warehouse(s).id, 0)).toBe(true);
    expect(warehouse(s).store[0]!.n).toBe(1);
  });

  it("sorts and merges stacks", () => {
    const s = bag(["Lm", 40], ["Kn", 2], ["Lm", 30], ["Kn", 3]);
    sortSlots(s.inv);
    expect(s.inv.slice(0, 3)).toEqual([{ id: "Lm", n: 64 }, { id: "Lm", n: 6 }, { id: "Kn", n: 5 }]);
    expect(s.inv[3]).toBeNull();
  });

  it("sorts raw material first, then metal parts by form and metal, then finished goods", () => {
    const order = ["Lm", "Ml", "Lg", "Kn", "Be", "iron", "copper", "iron_plate", "copper_plate", "iron_tube", "copper_tube", "brick", "steam_drum", "steam_engine_unit"];
    const s = createGame(1);
    s.inv = [...order].reverse().map((id) => ({ id, n: 1 }));
    sortSlots(s.inv);
    expect(s.inv.map((slot) => slot!.id)).toEqual(order);
  });

  it("never loses a held stack by accident", () => {
    const s = bag(["Lm", 5]);
    clickStack(s, s.inv, 0, "left");
    stowCursor(s);
    expect(s.inv[0]).toEqual({ id: "Lm", n: 5 });
    expect(s.cursor).toBeNull();
    clickStack(s, s.inv, 0, "left");
    s.hunger = 0;
    s.hp = 1;
    age(s, 3);
    expect(s.cursor).toBeNull();
    expect(s.inv[0]).toEqual({ id: "Lm", n: 5 });
  });

  it("throws away the held stack only when asked", () => {
    const s = bag(["Lm", 5]);
    clickStack(s, s.inv, 0, "left");
    trashCursor(s);
    expect(s.cursor).toBeNull();
    expect(s.inv[0]).toBeNull();
  });
});

describe("seasons", () => {
  const berrySite = (s: GameState) => s.sites.find((v) => v.ore === "Be")!;
  const skip = (s: GameState, seasons: number) => {
    for (let i = 0; i < (seasons * SEASON_MS) / 100; i += 1) {
      keepAlive(s);
      step(s);
    }
  };

  it("cycles through four seasons", () => {
    expect([0, 1, 2, 3, 4].map((n) => seasonAt(n * SEASON_MS))).toEqual([0, 1, 2, 3, 0]);
  });

  it("only allows picking food in its season", () => {
    const s = createGame(1);
    const site = berrySite(s);
    expect(canHarvest(s, site)).toBe(false);
    walkTo(s, site);
    arrive(s);
    expect(mine(s)).toBe(false);
    skip(s, 1);
    expect(s.season).toBe(1);
    expect(mine(s)).toBe(true);
  });

  it("closes food in winter but never ore", () => {
    const s = gameWithVeins(1);
    skip(s, 3);
    expect(s.season).toBe(3);
    expect(s.sites.filter((v) => v.ore === "Be" || v.ore === "Mu").some((v) => canHarvest(s, v))).toBe(false);
    expect(canHarvest(s, s.sites[0])).toBe(true);
  });

  it("regrows food when its season begins", () => {
    const s = createGame(1);
    const site = berrySite(s);
    site.left = 0;
    skip(s, 1);
    expect(site.left).toBe(site.total);
  });

  it("keeps food yields under ten", () => {
    for (let cx = 5; cx < 60; cx += 1) {
      for (const site of chunkSites(4, cx, 7).filter((v) => v.ore === "Be" || v.ore === "Mu")) {
        expect(site.total).toBeLessThan(10);
      }
    }
  });
});

describe("carrying weight", () => {
  it("has a small bag", () => {
    expect(INV_SLOTS).toBe(8);
    expect(createGame(1).inv.length).toBe(8);
  });

  it("weighs parts by metal and form", () => {
    expect(itemWeight("iron")).toBe(4);
    expect(itemWeight("iron_plate")).toBe(8);
    expect(itemWeight("copper_tube")).toBe(2);
    expect(itemWeight("iron_cylinder")).toBe(16);
    expect(itemWeight("Be")).toBeLessThan(itemWeight("Lm"));
  });

  it("counts the bag and the hand", () => {
    const s = createGame(1);
    s.inv[0] = { id: "Lm", n: 10 };
    s.cursor = { id: "iron", n: 2 };
    expect(carried(s)).toBe(28);
  });

  it("walks slower the more is carried", () => {
    const s = createGame(1);
    expect(walkTime(s)).toBe(WALK_MS);
    s.inv[0] = { id: "Lm", n: 40 };
    expect(walkTime(s)).toBeCloseTo(WALK_MS * (1 + LOAD_SLOW));
  });

  it("stops mining at the limit", () => {
    const s = gameWithVeins(1);
    const site = s.sites[0];
    walkTo(s, site);
    arrive(s);
    s.inv[1] = { id: "iron", n: MAX_CARRY / 4 };
    expect(mine(s)).toBe(false);
    s.inv[1] = { id: "iron", n: MAX_CARRY / 4 - 1 };
    expect(mine(s)).toBe(true);
  });

  it("won't walk overloaded, and nothing is lost", () => {
    const s = createGame(1);
    s.inv[0] = { id: "steam_drum", n: 3 };
    expect(overloaded(s)).toBe(true);
    expect(walkTo(s, { x: 5, y: 0 })).toBe(false);
    expect(s.path).toEqual([]);
    expect(s.inv[0]!.n).toBe(3);
  });
});

describe("spring power", () => {
  const setup = () => {
    const s = createGame(1);
    const furnace = placeMachine(s, "brick_kiln", 0, 0)!;
    const store = warehouse(s);
    store.store[0] = { id: "Lg", n: 10 };
    connect(s, store.id, furnace.id, "all");
    return { s, furnace, store };
  };

  it("moves nothing along a line without power", () => {
    const { s, furnace } = setup();
    run(s, 5);
    expect(furnace.fuel).toBeNull();
  });

  /** A motor runs a belt drive, and the drive joins the warehouse's network. */
  const driven = (s: GameState, store: GameNode, energy: number) => {
    const motor = placeMachine(s, MOTOR, 0, 0)!;
    motor.energy = energy;
    const drive = placeMachine(s, BELT_DRIVE, 0, 0)!;
    expect(connect(s, motor.id, drive.id, POWER)).toBeTruthy();
    expect(connect(s, drive.id, store.id, DRIVE)).toBeTruthy();
    return { motor, drive };
  };

  it("needs a wound motor behind the belt drive, not just a connected one", () => {
    const { s, furnace, store } = setup();
    driven(s, store, 0);
    run(s, 5);
    expect(furnace.fuel).toBeNull();
    expect(beltNetOf(store.id)).toMatchObject({ drives: 1, running: 0, rate: 0 });
  });

  it("moves belts on a belt drive, and the drive draws force as it runs", () => {
    const { s, furnace, store } = setup();
    const { motor } = driven(s, store, SPRING_MAX);
    run(s, 2);
    expect(furnace.fuel?.id).toBe("Lg");
    expect(beltNetOf(furnace.id)).toMatchObject({ drives: 1, running: 1, belts: 1, rate: BELT_MAX });
    expect(motor.energy).toBeLessThan(SPRING_MAX - 2);
  });

  it("shares one drive's rate across every belt of its network", () => {
    const { s, store } = setup();
    driven(s, store, SPRING_MAX);
    for (let i = 0; i < 3; i += 1) connect(s, store.id, placeMachine(s, "brick_kiln", 0, 0)!.id, "all");
    run(s, 1);
    expect(beltNetOf(store.id)).toMatchObject({ belts: 4, rate: DRIVE_RATE / 4 });
  });

  it("takes no power line into a warehouse: belts run on a drive instead", () => {
    const { s, store } = setup();
    const motor = placeMachine(s, MOTOR, 0, 0)!;
    expect(routeMaterials(s, motor.id, store.id)).toEqual([]);
  });

  it("runs down by itself over time, but never below empty", () => {
    const s = createGame(1);
    const motor = placeMachine(s, MOTOR, 0, 0)!;
    motor.energy = 2;
    run(s, SPRING_LEAK_MS / 1000);
    expect(motor.energy).toBe(1);
    run(s, (SPRING_LEAK_MS / 1000) * 3);
    expect(motor.energy).toBe(0);
  });

  it("runs a belt drive but can't drive a machine: a spring is too weak a tier for a hammer", () => {
    const { s, furnace, store } = setup();
    s.stage = 2;
    const { motor } = driven(s, store, SPRING_MAX);
    const hammer = placeMachine(s, "steam_hammer", 0, 0)!;
    hammer.module = true;
    connect(s, motor.id, hammer.id, POWER);
    hammer.ins.iron = { id: "iron", n: 12 };
    run(s, 1);
    expect(hammer.speed).toBe(0);
    expect(hammer.tierLow).toBe(true);
    expect(hammer.outs.iron_plate).toBe(0);
    // The warehouse's belt still moves on the spring's drive.
    expect(!!furnace.fuel || (furnace.heat ?? 0) > 0).toBe(true);
    expect(powerLoad(s, motor)).toEqual({ now: 2, connected: 2, limit: 5 });
  });

  it("winds by hand up to a limit", () => {
    const s = createGame(1);
    const motor = placeMachine(s, MOTOR, 0, 0)!;
    expect(windMotor(s, motor.id)).toBe(true);
    expect(motor.energy).toBe(WIND);
    motor.energy = SPRING_MAX;
    expect(windMotor(s, motor.id)).toBe(false);
  });

  it("uses a port for the belt drive's line", () => {
    const { s, store } = setup();
    driven(s, store, SPRING_MAX);
    expect(portsUsed(s, store.id)).toBe(2);
  });

  it("only sends power, only from a motor, and only to what uses it", () => {
    const { s, store, furnace } = setup();
    const motor = placeMachine(s, MOTOR, 0, 0)!;
    const drive = placeMachine(s, BELT_DRIVE, 0, 0)!;
    expect(routeMaterials(s, motor.id, drive.id)).toEqual([POWER]);
    // A kiln burns fuel and its belts run on a drive, so a power line would do nothing.
    expect(routeMaterials(s, motor.id, furnace.id)).toEqual([]);
    expect(routeMaterials(s, store.id, motor.id)).toEqual([]);
    expect(routeMaterials(s, drive.id, store.id)).toEqual([DRIVE]);
    expect(routeMaterials(s, store.id, drive.id)).toEqual([]);
  });

  it("keeps its power line when a machine changes form", () => {
    const s = createGame(1);
    const bench = placeMachine(s, "forming_bench", 0, 0)!;
    power(s, bench.id);
    setForm(s, bench.id, "cylinder");
    expect(s.lines.some((l) => l.to === bench.id && l.material === POWER)).toBe(true);
  });
});

describe("map notes", () => {
  it("keeps a note on a place, trimmed and cut to length, through a save; a blank note removes it", () => {
    const s = createGame(1);
    const site = s.sites[0];
    expect(setNote(s, site.id, "  철 많음, 강 건너  ")).toBe(true);
    expect(site.note).toBe("철 많음, 강 건너");
    expect(setNote(s, site.id, "x".repeat(NOTE_MAX + 10))).toBe(true);
    expect(site.note).toHaveLength(NOTE_MAX);
    expect(loadSave(JSON.parse(JSON.stringify(s)))!.sites[0].note).toBe(site.note);
    setNote(s, site.id, "   ");
    expect(site.note).toBeUndefined();
    expect(setNote(s, 99999, "없는 곳")).toBe(false);
  });
});

describe("test preset", () => {
  it("starts with a motor driving a brick kiln that actually runs", () => {
    const s = createTestGame(1);
    const kiln = s.nodes.find((n) => n.type === "brick_kiln")!;
    const motor = s.nodes.find((n) => n.type === MOTOR)!;
    expect(motor.energy).toBe(SPRING_MAX);
    run(s, 12);
    expect(warehouse(s).store.some((slot) => slot?.id === "brick")).toBe(true);
    expect(motor.energy).toBeLessThan(SPRING_MAX);
    expect(kiln.progress + (warehouse(s).store.find((x) => x?.id === "brick")?.n ?? 0)).toBeGreaterThan(0);
  });

  it("stocks the parts to build every machine open so far", () => {
    const s = createTestGame(1);
    // Raw materials, metals, parts, field kit, and as many shelves of built machines as it takes to hold them.
    const shelves = Math.ceil(machinesAt(s.stage).length / warehouse(s).store.length);
    expect(s.nodes.filter((n) => n.type === WAREHOUSE).length).toBe(4 + shelves);
    for (const type of machinesAt(s.stage)) expect([type, canAfford(s, type)]).toEqual([type, true]);
  });

  it("holds every ore, and sends the player out fully equipped with no tutorial", () => {
    const s = createTestGame(1);
    for (const ore of ["Kn", "Lm", "Py", "Mt", "Ml", "Cc", "Ls", "Lg", "Bt", "An"]) expect([ore, countOf(s, ore) > 0]).toEqual([ore, true]);
    expect(s.gear).toEqual({ feet: "iron_boots", back: "iron_pack", hand: "iron_pick", weapon: "iron_blade" });
    expect(countOf(s, "iron_drum")).toBeGreaterThan(0);
    expect(s.tutorial?.off).toBe(true);
  });

  it("shows the map far enough out to find every biome, on a world of its own", () => {
    const s = createTestGame(4);
    const seen = new Set<string>();
    for (let x = -160; x <= 160; x += 4) {
      for (let y = -96; y <= 96; y += 4) if (isRevealed(s, x, y)) seen.add(biomeAt(x, y, s.seed));
    }
    expect(seen.size).toBeGreaterThanOrEqual(4);
    expect(createTestGame(5).sites.map((v) => `${v.x},${v.y}`)).not.toEqual(s.sites.map((v) => `${v.x},${v.y}`));
  });

  it("keeps two of every machine open so far, built and ready to install", () => {
    const s = createTestGame(1);
    expect(machinesAt(s.stage)).toContain("blast_furnace");
    for (const type of machinesAt(s.stage)) expect([type, countOf(s, type) >= 2]).toEqual([type, true]);
  });

  it("runs the kiln's belts on a belt drive driven by the motor", () => {
    const s = createTestGame(1);
    const kiln = s.nodes.find((n) => n.type === "brick_kiln")!;
    const drive = s.nodes.find((n) => n.type === BELT_DRIVE)!;
    expect(s.lines.some((l) => l.to === drive.id && l.material === POWER)).toBe(true);
    expect(s.lines.some((l) => l.from === drive.id && l.material === DRIVE)).toBe(true);
    run(s, 3);
    // Materials in, bricks back: two belts on the one drive.
    expect(beltNetOf(kiln.id)).toMatchObject({ running: 1, belts: 2 });
    expect(Object.values(kiln.ins).some((slot) => slot) || !!kiln.fuel).toBe(true);
  });

  it("runs a belt drive and a piping riverbank pump off one spring motor", () => {
    // 2 for the drive and 3 for the pump fill the motor's 5: the pump's water carries free, here to a boiler.
    const s = createTestGame(1);
    const motor = s.nodes.find((n) => n.type === MOTOR)!;
    const drive = s.nodes.find((n) => n.type === BELT_DRIVE)!;
    const pump = placeMachine(s, PUMP, 0, 0)!;
    const boiler = placeMachine(s, "steam_boiler", 0, 0)!;
    expect(toggleRoute(s, motor.id, pump.id, POWER)).toBe(true);
    expect(toggleRoute(s, pump.id, boiler.id, "main")).toBe(true);
    run(s, 1);
    expect(drive.speed).toBe(1);
    expect(pump.carry).toBe(true);
  });

  it("carries line materials for every layer in the bag", () => {
    const s = createTestGame(1);
    for (const id of ["iron_belt", "iron_tube", "iron_rod"]) expect([id, bagCount(s, id) >= 8]).toEqual([id, true]);
  });
});

describe("costly routes", () => {
  it("needs parts to connect anything", () => {
    const s = createGame(1);
    const furnace = placeMachine(s, "bloomery", 0, 0)!;
    expect(canAffordRoute(s, warehouse(s).id, "all")).toBe(false);
    expect(toggleRoute(s, warehouse(s).id, furnace.id, "all")).toBe(false);
    expect(s.lines).toEqual([]);
  });

  it("charges a belt for an item line", () => {
    const s = createGame(1);
    const furnace = placeMachine(s, "bloomery", 0, 0)!;
    const store = warehouse(s).id;
    // Any belt will do, or the kind picked.
    expect(routeCost(s, store, "all")).toEqual({ belt: 1 });
    expect(routeCost(s, store, "all", "iron_belt")).toEqual({ iron_belt: 1 });
    s.inv[0] = { id: "iron_belt", n: 1 };
    expect(toggleRoute(s, store, furnace.id, "all")).toBe(true);
    expect(s.inv[0]).toBeNull();
  });

  it("puts each line on its layer and charges for it there", () => {
    // The pump opens in a later stage, so start from the test game with everything open.
    const s = createTestGame(1);
    const pump = placeMachine(s, PUMP, 0, 0)!;
    const kiln = placeMachine(s, "brick_kiln", 0, 0)!;
    const motor = placeMachine(s, MOTOR, 0, 0)!;
    expect(lineLayer(s, warehouse(s).id, "all")).toBe("item");
    expect(lineLayer(s, kiln.id, "main")).toBe("item");
    expect(lineLayer(s, pump.id, "main")).toBe("fluid");
    expect(lineLayer(s, motor.id, POWER)).toBe("power");
    expect(routeCost(s, pump.id, "main")).toEqual({ tube: 1 });
    expect(routeCost(s, motor.id, POWER)).toEqual({ iron_rod: 1 });
  });

  it("gives the parts back when a route or machine goes", () => {
    const s = createGame(1);
    const furnace = placeMachine(s, "bloomery", 0, 0)!;
    s.inv[0] = { id: "iron_belt", n: 1 };
    toggleRoute(s, warehouse(s).id, furnace.id, "all");
    toggleRoute(s, warehouse(s).id, furnace.id, "all");
    expect(countOf(s, "iron_belt")).toBe(1);
    toggleRoute(s, warehouse(s).id, furnace.id, "all");
    removeNode(s, furnace.id);
    expect(countOf(s, "iron_belt")).toBe(1);
  });

  it("pays for a line from the bag, never a warehouse", () => {
    const s = createGame(1);
    const furnace = placeMachine(s, "bloomery", 0, 0)!;
    addTo(warehouse(s).store, "iron_belt", 5);
    expect(canAffordRoute(s, warehouse(s).id, "all")).toBe(false);
    expect(toggleRoute(s, warehouse(s).id, furnace.id, "all")).toBe(false);
    expect(countOf(s, "iron_belt")).toBe(5);
  });

  it("puts a taken-down line's belt in the bag, not a warehouse", () => {
    const s = createGame(1);
    const furnace = placeMachine(s, "bloomery", 0, 0)!;
    s.inv[0] = { id: "iron_belt", n: 1 };
    toggleRoute(s, warehouse(s).id, furnace.id, "all");
    toggleRoute(s, warehouse(s).id, furnace.id, "all");
    expect(s.inv[0]).toEqual({ id: "iron_belt", n: 1 });
    expect(warehouse(s).store.some((slot) => slot?.id === "iron_belt")).toBe(false);
  });

  it("refuses to take a line down into a full bag", () => {
    const s = createGame(1);
    const furnace = placeMachine(s, "bloomery", 0, 0)!;
    s.inv[0] = { id: "iron_belt", n: 1 };
    toggleRoute(s, warehouse(s).id, furnace.id, "all");
    s.inv = s.inv.map(() => ({ id: "Lm", n: 64 }));
    expect(toggleRoute(s, warehouse(s).id, furnace.id, "all")).toBe(false);
    expect(s.lines).toHaveLength(1);
  });
});

describe("work and failure", () => {
  const loaded = (type: string, key: string, id: string, n: number) => {
    const s = createGame(1);
    const node = placeMachine(s, type, 0, 0)!;
    node.ins[key] = { id, n };
    return { s, node };
  };

  it("restarts the work when material is pulled out", () => {
    const { s, node } = loaded("plate_hammer", "iron", "iron", 4);
    press(s, node.id, 2);
    expect(node.progress).toBeGreaterThan(0);
    clickInput(s, node.id, "iron", "right");
    expect(node.progress).toBe(0);
    node.ins.iron = { id: "iron", n: 4 };
    press(s, node.id, 2);
    takeInput(s, node.id, "iron");
    expect(node.progress).toBe(0);
  });

  it("loses more progress on harder machines", () => {
    const easy = loaded("forming_bench", "iron", "iron", 4);
    easy.node.progress = 0.5;
    failWork(easy.s, easy.node.id);
    expect(easy.node.progress).toBeCloseTo(0.3);
    const hard = placeMachine(easy.s, "engine_bench", 0, 0)!;
    hard.ins.cylinder = null;
    expect(failWork(easy.s, hard.id)).toBe(false);
  });

  it("destroys material on repeated mistakes at high difficulty", () => {
    const s = createGame(1);
    const bench = placeMachine(s, "boiler_bench", 0, 0)!;
    bench.ins.iron_plate = { id: "iron_plate", n: 12 };
    bench.ins.brick = { id: "brick", n: 16 };
    bench.ins.copper_tube = { id: "copper_tube", n: 8 };
    bench.ins.iron_rivet = { id: "iron_rivet", n: 32 };
    for (let i = 0; i < 3; i += 1) failWork(s, bench.id);
    expect(bench.ins.iron_plate!.n).toBe(12);
    failWork(s, bench.id);
    expect(bench.ins.iron_plate!.n).toBe(11);
  });

  it("leaves easy machines' material alone", () => {
    const { s, node } = loaded("forming_bench", "iron", "iron", 4);
    for (let i = 0; i < 20; i += 1) failWork(s, node.id);
    expect(node.ins.iron!.n).toBe(4);
    expect(node.progress).toBe(0);
  });
});

describe("collapse penalties", () => {
  const fall = (x: number) => {
    const s = createGame(1);
    s.inv[0] = { id: "Lm", n: 20 };
    s.player = { x, y: 0 };
    s.hunger = 0;
    s.hp = 1;
    age(s, 3);
    return s;
  };

  it("loses nothing at the base", () => {
    const s = fall(0);
    expect(s.inv[0]!.n).toBe(20);
    expect(s.lost).toEqual([]);
  });

  it("loses more the further out", () => {
    expect(fall(20).inv[0]!.n).toBeGreaterThan(fall(100).inv[0]!.n);
    expect(fall(1000).inv[0]!.n).toBe(8);
  });

  it("weakens the player for one season", () => {
    const s = fall(10);
    expect(isWeak(s)).toBe(true);
    const hammer = placeMachine(s, "plate_hammer", 0, 0)!;
    hammer.ins.iron = { id: "iron", n: 2 };
    press(s, hammer.id, 4);
    expect(hammer.outs.iron_plate).toBe(0);
    press(s, hammer.id, 4);
    expect(hammer.outs.iron_plate).toBe(1);
    s.time = s.weakUntil;
    expect(isWeak(s)).toBe(false);
    expect(ONE_SEASON).toBeGreaterThan(0);
  });
});

describe("map knowledge", () => {
  it("separates seen, remembered and unknown ground", () => {
    const s = createGame(1);
    expect(isVisible(s, 2, 0)).toBe(true);
    expect(isRevealed(s, 500, 0)).toBe(false);
    walkTo(s, { x: 30, y: 0 });
    arrive(s);
    expect(isRevealed(s, 2, 0)).toBe(true);
    expect(isVisible(s, 2, 0)).toBe(false);
  });

  it("sees further from high ground", () => {
    const s = createGame(1);
    let peak = { x: 0, y: 0 };
    for (let x = 0; x < 400 && !terrain(peak.x, peak.y, s.seed)[2]; x += 1) {
      for (let y = -30; y < 30; y += 1) if (terrain(x, y, s.seed)[2] === 3) peak = { x, y };
    }
    // Against flat open ground, so no biome rule muddles the comparison.
    expect(visionAt(s, peak) - (BIOMES[biomeAt(peak.x, peak.y, s.seed)].rules?.vision ?? 0)).toBe(REVEAL + 6);
  });

  it("sees less in a forest, walks slower in a marsh, and hungers faster in a desert", () => {
    const s = createGame(1);
    const find = (id: string) => {
      for (let r = 80; r < 2000; r += 7) {
        for (let a = 0; a < 24; a += 1) {
          const x = Math.round(Math.cos(a) * r);
          const y = Math.round(Math.sin(a) * r * 0.6);
          if (biomeAt(x, y, s.seed) === id && terrain(x, y, s.seed)[2] === 0 && terrain(x, y, s.seed)[1] !== "t-water") return { x, y };
        }
      }
      throw new Error(`no ${id}`);
    };
    const plain = walkTime(s);
    s.player = find("forest");
    expect(visionAt(s, s.player)).toBe(REVEAL - 1);
    s.player = find("marsh");
    expect(walkTime(s)).toBeCloseTo(plain * 1.5);
    // Hunger over a minute, stepping without the helper that keeps the player fed.
    const hungerOver = (at: { x: number; y: number }) => {
      s.player = at;
      s.hunger = 100;
      s.hungerTimer = 0;
      for (let i = 0; i < 600; i += 1) step(s);
      return 100 - s.hunger;
    };
    expect(hungerOver(find("desert"))).toBeGreaterThan(hungerOver({ x: 0, y: 0 }));
  });

});

describe("scale", () => {
  it("keeps a large factory well inside the step budget", () => {
    const s = createGame(1);
    // Kilns that fire on their own, each sending bricks to a boiler bench.
    const nodes = Array.from({ length: 400 }, () => placeMachine(s, "boiler_bench", 0, 0)!);
    const furnaces = Array.from({ length: 200 }, () => {
      const f = placeMachine(s, "brick_kiln", 0, 0)!;
      f.ins.clay = { id: "Kn", n: 16 };
      f.fuel = { id: "Lg", n: 16 };
      return f;
    });
    furnaces.forEach((f, i) => connect(s, f.id, nodes[i * 2].id, "main"));
    const start = performance.now();
    for (let i = 0; i < 300; i += 1) step(s);
    const perStep = (performance.now() - start) / 300;
    console.log(`${s.nodes.length} machines, ${s.lines.length} lines: ${perStep.toFixed(3)} ms per step`);
    expect(perStep).toBeLessThan(10);
  });
});

describe("survival", () => {
  it("gets hungrier over time, wherever the player is", () => {
    const s = createGame(1);
    age(s, 60);
    expect(s.hunger).toBe(MAX_VITAL - 10);
  });

  it("drains health only once hunger reaches zero", () => {
    const s = createGame(1);
    s.hunger = 1;
    age(s, 5);
    expect(s.hp).toBe(MAX_VITAL);
    age(s, 1);
    expect(s.hunger).toBe(0);
    age(s, 9);
    expect(s.hp).toBe(MAX_VITAL - 3);
  });

  it("heals slowly while well fed, and not while hungry", () => {
    const s = createGame(1);
    s.hp = 50;
    age(s, 10);
    expect(s.hp).toBe(52);
    s.hp = 50;
    s.hunger = 40;
    age(s, 20);
    expect(s.hp).toBe(50);
  });

  it("hurts on a change of height and on going into water, and costs nothing along a ridge", () => {
    const s = createGame(1);
    const free = (x: number, y: number) => !s.sites.some((v) => cellsOf(v).some((c) => c.x === x && c.y === y));
    const height = (x: number, y: number) => terrain(x, y, s.seed)[2];
    const dry = (x: number, y: number) => terrain(x, y, s.seed)[1] !== "t-water";
    /** Steps once from `from` to `to`, safe mode off, and gives the health it cost. */
    const stepCost = (from: { x: number; y: number }, to: { x: number; y: number }) => {
      s.player = { ...from };
      s.hp = MAX_VITAL;
      s.path = [to];
      s.walkTimer = 0;
      s.safeWalk = false;
      while (s.path.length) step(s);
      return MAX_VITAL - s.hp;
    };
    const find = (ok: (x: number, y: number) => boolean) => {
      for (let x = 1; x < 600; x += 1) for (let y = -60; y < 60; y += 1) if (ok(x, y)) return { x, y };
      throw new Error("no such place");
    };
    // Up a slope: as much as the height rises.
    const up = find((x, y) => dry(x, y) && dry(x, y - 1) && height(x, y) > height(x, y - 1) && free(x, y));
    expect(stepCost({ x: up.x, y: up.y - 1 }, up)).toBe(height(up.x, up.y) - height(up.x, up.y - 1));
    // Along a ridge of one height: nothing.
    const ridge = find((x, y) => dry(x, y) && dry(x + 1, y) && height(x, y) > 0 && height(x + 1, y) === height(x, y) && free(x + 1, y));
    expect(stepCost(ridge, { x: ridge.x + 1, y: ridge.y })).toBe(0);
    // Down again: as much as it falls.
    const down = find((x, y) => dry(x, y) && dry(x, y - 1) && height(x, y - 1) > height(x, y) && free(x, y));
    expect(stepCost({ x: down.x, y: down.y - 1 }, down)).toBe(height(down.x, down.y - 1) - height(down.x, down.y));
    // Into water, as before.
    const water = find((x, y) => !dry(x, y) && dry(x, y - 1) && free(x, y));
    expect(stepCost({ x: water.x, y: water.y - 1 }, water)).toBe(3);
  });

  it("warns in safe mode of what the next step would cost from where the player stands", () => {
    const s = createGame(1);
    const height = (x: number, y: number) => terrain(x, y, s.seed)[2];
    const dry = (x: number, y: number) => terrain(x, y, s.seed)[1] !== "t-water";
    let at: { x: number; y: number } | undefined;
    for (let x = 1; x < 600 && !at; x += 1) for (let y = -60; y < 60 && !at; y += 1) {
      if (dry(x, y) && dry(x + 1, y) && height(x, y) === 0 && height(x + 1, y) >= 2 && !s.sites.some((v) => cellsOf(v).some((c) => c.x === x + 1 && c.y === y))) at = { x, y };
    }
    s.player = at!;
    // Safe mode warns only of ground the player has seen.
    s.revealed[`${Math.floor((at!.x + 1) / 16)},${Math.floor(at!.y / 16)}`] = new Array(256).fill(1);
    setSafeWalk(s, true);
    walkTo(s, { x: at!.x + 1, y: at!.y });
    for (let i = 0; i < 20 && s.path.length; i += 1) step(s);
    expect(s.halt?.damage).toBe(height(at!.x + 1, at!.y));
    expect(s.player).toEqual(at);
  });

  it("collapses to the base, loses 30% of what is carried, and keeps stored goods", () => {
    const s = createGame(1);
    s.inv[0] = { id: "Lm", n: 10 };
    s.inv[1] = { id: "Kn", n: 1 };
    warehouse(s).store[0] = { id: "Lg", n: 20 };
    s.player = { x: 30, y: 5 };
    s.hunger = 0;
    s.hp = 1;
    age(s, 3);
    expect(atBase(s)).toBe(true);
    expect(s.inv[0]).toEqual({ id: "Lm", n: 8 });
    expect(s.inv[1]).toBeNull();
    expect(s.lost).toEqual([{ id: "Lm", n: 2 }, { id: "Kn", n: 1 }]);
    expect(warehouse(s).store[0]).toEqual({ id: "Lg", n: 20 });
    expect([s.hp, s.hunger]).toEqual([50, 50]);
  });

  it("restores more from cooked food", () => {
    const s = createGame(1);
    s.hunger = 20;
    s.hp = 50;
    s.inv[0] = { id: "Be", n: 1 };
    s.inv[1] = { id: "Mc", n: 1 };
    expect(eat(s, 0)).toBe(true);
    expect([s.hunger, s.hp]).toEqual([30, 50]);
    expect(eat(s, 1)).toBe(true);
    expect([s.hunger, s.hp]).toEqual([55, 65]);
    expect(s.inv[0]).toBeNull();
  });

  it("caps at the maximum and won't waste food when full", () => {
    const s = createGame(1);
    s.hunger = 95;
    s.inv[0] = { id: "Bc", n: 2 };
    eat(s, 0);
    expect(s.hunger).toBe(MAX_VITAL);
    expect(eat(s, 0)).toBe(false);
    expect(s.inv[0]!.n).toBe(1);
  });

  it("won't eat things that aren't food", () => {
    const s = createGame(1);
    s.inv[0] = { id: "Lm", n: 2 };
    expect(eat(s, 0)).toBe(false);
  });

  it("cooks in the brick kiln from whichever food goes in", () => {
    const s = createGame(1);
    const kiln = placeMachine(s, "brick_kiln", 0, 0)!;
    kiln.ins.clay = { id: "Mu", n: 1 };
    kiln.fuel = { id: "Lg", n: 1 };
    run(s, 6);
    expect(kiln.outs.Mc).toBe(1);
  });

  it("lets the work cool back slowly once the fire is out, and picks up from there", () => {
    const s = createGame(1);
    const kiln = placeMachine(s, "brick_kiln", 0, 0)!;
    kiln.ins.clay = { id: "Kn", n: 2 };
    kiln.progress = 0.5;
    // No fuel: half a batch of an 8 s recipe is 4 s of work, and it cools at half pace, so 2 s takes back 1 s.
    run(s, 2);
    expect(kiln.progress).toBeCloseTo(0.5 - 1 / 8, 5);
    run(s, 10);
    expect(kiln.progress).toBe(0);
    expect(kiln.ins.clay).toEqual({ id: "Kn", n: 2 });
    kiln.fuel = { id: "Lg", n: 2 };
    run(s, 9);
    expect(kiln.outs.brick).toBe(2);
  });

  it("still fires bricks after food shares the kiln", () => {
    const s = createGame(1);
    const kiln = placeMachine(s, "brick_kiln", 0, 0)!;
    kiln.ins.clay = { id: "Kn", n: 2 };
    kiln.fuel = { id: "Lg", n: 1 };
    run(s, 9);
    expect(kiln.outs.brick).toBe(2);
  });

  it("guarantees food near the base on every seed", () => {
    for (let seed = 1; seed <= 300; seed += 1) {
      const sites = generateSites(seed);
      for (const id of ["Be", "Mu"]) {
        const near = sites.find((v) => v.ore === id)!;
        expect(Math.hypot(near.x, near.y / 0.6)).toBeLessThanOrEqual(13);
        expect(near.total).toBeGreaterThanOrEqual(3);
        expect(near.total).toBeLessThan(10);
      }
    }
  });
});

describe("building", () => {
  const withClay = (n: number) => {
    const s = createGame(1);
    s.inv[0] = { id: "Kn", n };
    return s;
  };

  const bench = (s: GameState) => s.nodes.find((n) => n.type === CONSTRUCTION)!;

  it("starts with a construction bench, and keeps the last one", () => {
    const s = createGame(1);
    expect(removeNode(s, bench(s).id)).toBe(false);
  });

  it("won't run until the whole cost is loaded, like any machine", () => {
    const s = withClay(19);
    setForm(s, bench(s).id, "brick_kiln");
    fillFromBag(s, bench(s).id, recipeOf(bench(s)), 1);
    expect(status(bench(s))).toBe("idle");
    expect(workMachine(s, bench(s).id)).toBe(false);
  });

  it("makes a machine item by hand from what is loaded, taking nothing from warehouses", () => {
    const s = withClay(22);
    warehouse(s).store[0] = { id: "Kn", n: 40 };
    setForm(s, bench(s).id, "brick_kiln");
    expect(fillFromBag(s, bench(s).id, recipeOf(bench(s)), 1)).toBe(true);
    expect(s.inv[0]).toEqual({ id: "Kn", n: 2 });
    expect(warehouse(s).store[0]).toEqual({ id: "Kn", n: 40 });
    // The construction bench takes half the machine's own work.
    expect(recipeOf(bench(s)).time).toBe(Math.ceil(machineWork("brick_kiln") / 2));
    for (let i = 0; i < recipeOf(bench(s)).time - 1; i += 1) workMachine(s, bench(s).id);
    expect(bench(s).outs.brick_kiln).toBe(0);
    workMachine(s, bench(s).id);
    expect(bench(s).outs.brick_kiln).toBe(1);
    expect(s.nodes.some((n) => n.type === "brick_kiln")).toBe(false);
  });

  it("offers only the machines open so far", () => {
    const s = createGame(1);
    expect(setForm(s, bench(s).id, "steam_hammer")).toBe(false);
    expect(setForm(s, bench(s).id, "forming_bench")).toBe(true);
  });

  it("installs a machine item from the bag or a warehouse, and needs one", () => {
    const s = createGame(1);
    expect(installMachine(s, "brick_kiln", 10, 20)).toBeNull();
    warehouse(s).store[0] = { id: "brick_kiln", n: 2 };
    const kiln = installMachine(s, "brick_kiln", 10, 20)!;
    expect([kiln.x, kiln.y]).toEqual([10, 20]);
    expect(countOf(s, "brick_kiln")).toBe(1);
  });

  it("installs the machine in hand where the player clicks", () => {
    const s = createGame(1);
    s.cursor = { id: "spring_motor", n: 2 };
    expect(installHeld(s, 5, 6)).toBeTruthy();
    expect(s.cursor).toEqual({ id: "spring_motor", n: 1 });
    s.cursor = { id: "Lm", n: 1 };
    expect(installHeld(s, 5, 6)).toBeNull();
  });

  it("keeps a machine item in storage for later", () => {
    const s = withClay(20);
    expect(make(s, "brick_kiln")).toBe(true);
    const index = s.inv.findIndex((slot) => slot?.id === "brick_kiln");
    clickStack(s, s.inv, index, "left");
    clickStack(s, warehouse(s).store, 0, "left");
    expect(warehouse(s).store[0]).toEqual({ id: "brick_kiln", n: 1 });
    expect(installMachine(s, "brick_kiln", 0, 0)).toBeTruthy();
  });

  it("won't install a machine from a later stage", () => {
    const s = createGame(1);
    s.inv[0] = { id: "steam_hammer", n: 1 };
    expect(installMachine(s, "steam_hammer", 0, 0)).toBeNull();
    expect(s.inv[0]).toEqual({ id: "steam_hammer", n: 1 });
  });

  it("needs the player at the base to work", () => {
    const s = withClay(20);
    setForm(s, bench(s).id, "brick_kiln");
    fillFromBag(s, bench(s).id, recipeOf(bench(s)), 1);
    walkTo(s, s.sites[0]);
    arrive(s);
    expect(workMachine(s, bench(s).id)).toBe(false);
  });

  it("gives an older save's build in progress back, and a bench if it had none", () => {
    const s = createGame(1);
    s.nodes = s.nodes.filter((n) => n.type !== CONSTRUCTION);
    Object.assign(s, { project: { type: "brick_kiln", done: 3, paid: [{ id: "Kn", n: 20 }] } });
    upgradeSave(s);
    expect(countOf(s, "clay")).toBe(20);
    expect("project" in s).toBe(false);
    expect(s.nodes.filter((n) => n.type === CONSTRUCTION)).toHaveLength(1);
  });

  it("gives a removed machine back as an item", () => {
    const s = withClay(20);
    expect(make(s, "brick_kiln")).toBe(true);
    const kiln = installMachine(s, "brick_kiln", 0, 0)!;
    expect(countOf(s, "brick_kiln")).toBe(0);
    removeNode(s, kiln.id);
    expect(countOf(s, "brick_kiln")).toBe(1);
    expect(countOf(s, "clay")).toBe(0);
  });

  it("gives old machines their materials back instead", () => {
    const s = createGame(1);
    const kiln = placeMachine(s, "brick_kiln", 0, 0)!;
    kiln.paid = [{ id: "Kn", n: 10 }];
    removeNode(s, kiln.id);
    expect(countOf(s, "clay")).toBe(10);
    expect(countOf(s, "brick_kiln")).toBe(0);
  });

});

describe("steam power", () => {
  const steamStage = () => {
    const s = createTestGame(1);
    s.nodes = s.nodes.slice(0, 1);
    s.lines = [];
    return s;
  };
  /** A running engine with plenty of steam, as though a boiler were already feeding it. */
  const engineAt = (s: GameState) => {
    const engine = placeMachine(s, "steam_engine", 0, 0)!;
    engine.ins.steam = { id: "steam", n: 16 };
    return engine;
  };
  const stock = (node: GameNode) => {
    node.ins.steam!.n = 16;
  };

  it("opens new machines only at the steam stage", () => {
    const s = createGame(1);
    expect(placeMachine(s, "steam_hammer", 0, 0)).toBeNull();
    s.stage = 2;
    expect(placeMachine(s, "steam_hammer", 0, 0)).toBeTruthy();
  });

  it("burns coal and water into steam, but holds only a little", () => {
    const s = steamStage();
    const engine = engineAt(s);
    run(s, 5);
    expect(engine.energy).toBeGreaterThan(20);
    expect(engine.energy).toBeLessThanOrEqual(STEAM_MAX);
    run(s, 30);
    expect(engine.energy).toBeLessThanOrEqual(STEAM_MAX);
  });

  /** A boiler with lignite and water, nothing taking its steam. */
  const boilerAt = (s: GameState, water: number) => {
    const boiler = placeMachine(s, "steam_boiler", 0, 0)!;
    boiler.fuel = { id: "Lg", n: 16 };
    boiler.ins.water = water ? { id: "water", n: water } : null;
    return boiler;
  };

  it("boils water into steam and keeps burning while it has water and fuel, even with nothing drawing on it", () => {
    const s = steamStage();
    const boiler = boilerAt(s, 40);
    run(s, 40);
    // 1.6 heat a second for 40 seconds is eight lignite; 2 L of water every 4 s makes 2 steam.
    expect(boiler.fuel!.n).toBe(16 - 8);
    expect(boiler.outs.steam).toBe(20);
    expect(boiler.ins.water?.n).toBe(20);
  });

  it("burns nothing without water", () => {
    const s = steamStage();
    const boiler = boilerAt(s, 0);
    run(s, 20);
    expect(boiler.fuel!.n).toBe(16);
    expect(boiler.outs.steam ?? 0).toBe(0);
  });

  it("feeds two steam engines from one boiler, its steam going out without a pressure pump", () => {
    const s = steamStage();
    const boiler = boilerAt(s, 200);
    boiler.fuel = { id: "An", n: 64 };
    const engines = [placeMachine(s, "steam_engine", 0, 0)!, placeMachine(s, "steam_engine", 0, 0)!];
    for (const engine of engines) expect(connect(s, boiler.id, engine.id, "main")).toBeTruthy();
    run(s, 60);
    // Each engine burns 1 steam every 4 s for 10 power; one boiler makes enough for both to run on.
    for (const engine of engines) {
      expect(status(engine)).toBe("run");
      expect(engine.energy).toBeGreaterThan(0);
    }
    expect(itemStats("steam")[0][1]).toContain("300");
  });

  it("turns a belt drive on steam", () => {
    const s = steamStage();
    const engine = engineAt(s);
    const drive = placeMachine(s, "belt_drive", 0, 0)!;
    const store = warehouse(s);
    expect(connect(s, engine.id, drive.id, POWER)).toBeTruthy();
    expect(connect(s, drive.id, store.id, DRIVE)).toBeTruthy();
    run(s, 4);
    expect(drive.speed).toBe(1);
  });

  it("turns a belt drive on an engine fed by a boiler", () => {
    const s = steamStage();
    const boiler = boilerAt(s, 200);
    const engine = placeMachine(s, "steam_engine", 0, 0)!;
    const drive = placeMachine(s, "belt_drive", 0, 0)!;
    const store = warehouse(s);
    expect(connect(s, boiler.id, engine.id, "main")).toBeTruthy();
    expect(connect(s, engine.id, drive.id, POWER)).toBeTruthy();
    expect(connect(s, drive.id, store.id, DRIVE)).toBeTruthy();
    run(s, 30);
    expect([status(engine), engine.energy, engine.ins.steam?.n, boiler.outs.steam]).toEqual(["run", expect.any(Number), expect.any(Number), expect.any(Number)]);
    expect(drive.speed).toBe(1);
  });

  it("runs the steam hammer at full speed within its limit", () => {
    const s = steamStage();
    const engine = engineAt(s);
    const hammer = placeMachine(s, "steam_hammer", 0, 0)!;
    connect(s, engine.id, hammer.id, POWER);
    hammer.ins.iron = { id: "iron", n: 12 };
    run(s, 4);
    expect(hammer.speed).toBe(1);
    expect(hammer.outs.iron_plate).toBeGreaterThanOrEqual(2);
  });

  it("stops the machines connected last when power runs short, rather than slowing them all", () => {
    const s = steamStage();
    const engine = engineAt(s);
    // Four hammers want 12 against the engine's 10: the first three fit, the fourth doesn't.
    const hammers = [1, 2, 3, 4].map(() => placeMachine(s, "steam_hammer", 0, 0)!);
    for (const hammer of hammers) {
      connect(s, engine.id, hammer.id, POWER);
      hammer.ins.iron = { id: "iron", n: 12 };
    }
    stock(engine);
    run(s, 1);
    expect(hammers.map((h) => h.order)).toEqual([1, 2, 3, 4]);
    expect(hammers.map((h) => h.speed)).toEqual([1, 1, 1, 0]);
    expect(powerLoad(s, engine)).toMatchObject({ connected: 12, limit: 10 });
  });

  it("counts idle machines too, so the queue doesn't flicker", () => {
    const s = steamStage();
    const engine = engineAt(s);
    const hammers = [1, 2, 3, 4].map(() => placeMachine(s, "steam_hammer", 0, 0)!);
    for (const hammer of hammers) connect(s, engine.id, hammer.id, POWER);
    // Only the last one has work, but the three before it reserve their share all the same.
    hammers[3].ins.iron = { id: "iron", n: 12 };
    run(s, 1);
    expect(hammers[3].speed).toBe(0);
    expect(hammers[3].outs.iron_plate).toBe(0);
  });

  it("pools engines through a manifold", () => {
    const s = steamStage();
    s.stage = 3;
    const engines = [engineAt(s), engineAt(s)];
    const manifold = placeMachine(s, "steam_manifold", 0, 0)!;
    for (const engine of engines) connect(s, engine.id, manifold.id, POWER);
    const hammers = [1, 2, 3, 4].map(() => placeMachine(s, "steam_hammer", 0, 0)!);
    for (const hammer of hammers) {
      connect(s, manifold.id, hammer.id, POWER);
      hammer.ins.iron = { id: "iron", n: 12 };
    }
    run(s, 1);
    expect(hammers.map((h) => h.speed)).toEqual([1, 1, 1, 1]);
    expect(powerLoad(s, engines[0])).toMatchObject({ connected: 12, limit: 20 });
  });

  it("works a bench by itself once powered, and by hand without", () => {
    const s = steamStage();
    const hammer = placeMachine(s, "plate_hammer", 0, 0)!;
    hammer.ins.iron = { id: "iron", n: 4 };
    run(s, 1);
    expect(status(hammer)).toBe("manual");
    const engine = engineAt(s);
    hammer.module = true;
    connect(s, engine.id, hammer.id, POWER);
    run(s, 1);
    expect(status(hammer)).toBe("run");
  });

  it("won't take steam without a module, unless built for it", () => {
    const s = steamStage();
    const engine = engineAt(s);
    const bench = placeMachine(s, "plate_hammer", 0, 0)!;
    const steam = placeMachine(s, "steam_hammer", 0, 0)!;
    const pump = placeMachine(s, "drainage_pump", 0, 0)!;
    expect(connect(s, engine.id, bench.id, POWER)).toBeNull();
    expect(connect(s, engine.id, steam.id, POWER)).toBeTruthy();
    expect(connect(s, engine.id, pump.id, POWER)).toBeTruthy();
    // A warehouse's belts run on a belt drive, so it takes no power of its own.
    expect(connect(s, engine.id, s.nodes[0].id, POWER)).toBeNull();
  });

  it("still takes a spring's power without a module", () => {
    const s = steamStage();
    const motor = placeMachine(s, MOTOR, 0, 0)!;
    const bench = placeMachine(s, "plate_hammer", 0, 0)!;
    expect(connect(s, motor.id, bench.id, POWER)).toBeTruthy();
  });

  it("fits a module from storage, and gives it back when removed", () => {
    const s = steamStage();
    const engine = engineAt(s);
    const bench = placeMachine(s, "plate_hammer", 0, 0)!;
    expect(fitModule(s, bench.id)).toBe(false);
    s.nodes[0].store = s.nodes[0].store.map(() => null);
    s.nodes[0].store[0] = { id: "steam_module", n: 1 };
    expect(needsModule(bench)).toBe(true);
    expect(fitModule(s, bench.id)).toBe(true);
    expect(countOf(s, "steam_module")).toBe(0);
    expect(connect(s, engine.id, bench.id, POWER)).toBeTruthy();
    expect(removeModule(s, bench.id)).toBe(true);
    expect(countOf(s, "steam_module")).toBe(1);
    expect(s.lines.some((l) => l.to === bench.id)).toBe(false);
  });

  it("returns a fitted module when the machine comes down", () => {
    const s = steamStage();
    const bench = placeMachine(s, "plate_hammer", 0, 0)!;
    bench.module = true;
    removeNode(s, bench.id);
    expect(countOf(s, "steam_module")).toBe(1);
  });

  it("makes modules from a steam engine", () => {
    const s = steamStage();
    const bench = placeMachine(s, "engine_bench", 0, 0)!;
    const slots = nodeProcess(bench).slots.map((slot) => slot.key);
    bench.ins[slots[0]] = { id: "iron_cylinder", n: 1 };
    bench.ins[slots[1]] = { id: "iron_plate", n: 2 };
    bench.ins[slots[2]] = { id: "steam_engine_unit", n: 1 };
    bench.ins[slots[3]] = { id: "copper_tube", n: 2 };
    power(s, bench.id);
    run(s, 21);
    expect(bench.outs.steam_module).toBe(2);
  });

  it("keeps old machines on steam working", () => {
    const s = steamStage();
    const engine = engineAt(s);
    const bench = placeMachine(s, "plate_hammer", 0, 0)!;
    s.lines.push({ id: 900, from: engine.id, to: bench.id, material: POWER, timer: 0, active: false, lastMoved: 0, paid: [] });
    upgradeSave(s);
    expect(bench.module).toBe(true);
  });

  it("reports what it is carrying against its limit", () => {
    const s = steamStage();
    const engine = engineAt(s);
    const hammers = [1, 2].map(() => placeMachine(s, "steam_hammer", 0, 0)!);
    for (const hammer of hammers) connect(s, engine.id, hammer.id, POWER);
    run(s, 2);
    expect(powerLoad(s, engine)).toEqual({ now: 0, connected: 6, limit: 10 });
    hammers[0].ins.iron = { id: "iron", n: 12 };
    run(s, 1);
    expect(powerLoad(s, engine)).toEqual({ now: 3, connected: 6, limit: 10 });
  });

  it("carries items along lines on a belt drive run by steam", () => {
    const s = steamStage();
    const engine = engineAt(s);
    const store = s.nodes[0];
    const kiln = placeMachine(s, "brick_kiln", 0, 0)!;
    store.store = store.store.map(() => null);
    store.store[0] = { id: "Lg", n: 4 };
    const drive = placeMachine(s, BELT_DRIVE, 0, 0)!;
    expect(connect(s, engine.id, drive.id, POWER)).toBeTruthy();
    connect(s, drive.id, store.id, DRIVE);
    connect(s, store.id, kiln.id, "all");
    run(s, 3);
    expect(kiln.fuel?.n).toBeGreaterThan(0);
  });
});

describe("riverbanks", () => {
  const atRiver = () => {
    const s = createTestGame(1);
    s.nodes = s.nodes.slice(0, 1);
    s.lines = [];
    const motor = placeMachine(s, MOTOR, 0, 0)!;
    motor.energy = SPRING_MAX;
    const pump = placeMachine(s, "drainage_pump", 0, 0)!;
    tubes(s);
    expect(linkRiver(s, pump.id, foundRivers(s)[0].id)).toBe(true);
    return { s, motor, pump, river: riverOf(s, pump)! };
  };

  it("gets a code once found, and stays off the board", () => {
    const { s, river } = atRiver();
    expect(river.code).toMatch(/^[0-9a-z]{3}$/);
    expect(s.nodes.some((n) => n.siteId === river.id && n.type !== "drainage_pump")).toBe(false);
  });

  it("does nothing for a pump until linked, even with power", () => {
    const { s, motor, pump } = atRiver();
    delete pump.siteId;
    connect(s, motor.id, pump.id, POWER);
    run(s, 3);
    expect(pump.outs.water).toBe(0);
    expect(riverOf(s, pump)).toBeUndefined();
  });

  it("lets the pump pick any found riverbank, and move between them", () => {
    const { s, pump } = atRiver();
    const [first, second] = foundRivers(s);
    expect(riverOf(s, pump)?.id).toBe(first.id);
    expect(linkRiver(s, pump.id, second.id)).toBe(true);
    expect(riverOf(s, pump)?.id).toBe(second.id);
    expect(portsUsed(s, pump.id)).toBe(0);
    expect(linkRiver(s, pump.id, second.id)).toBe(true);
    expect(riverOf(s, pump)).toBeUndefined();
  });

  it("can't be mined by hand", () => {
    const { s, river } = atRiver();
    s.player = { x: river.x, y: river.y };
    expect(mine(s)).toBe(false);
  });

  it("pumps only with power, draining the reserve", () => {
    const { s, motor, pump, river } = atRiver();
    run(s, 2);
    expect(pump.outs.water).toBe(0);
    connect(s, motor.id, pump.id, POWER);
    run(s, 4);
    expect(pump.outs.water).toBeGreaterThan(5);
    expect(river.left).toBeLessThan(river.total);
  });

  it("refills on its own up to the reserve", () => {
    const { s, river } = atRiver();
    river.left = 10;
    run(s, 20);
    expect(river.left).toBe(20);
    river.left = river.total;
    run(s, 10);
    expect(river.left).toBe(river.total);
  });

  it("tells a pump without power from one without water", () => {
    const { pump } = atRiver();
    expect(lacksPower(pump)).toBe(true);
  });

  it("turns an old riverbank node and its line into the pump's own choice", () => {
    const { s, pump, river } = atRiver();
    delete pump.siteId;
    const save = JSON.parse(JSON.stringify(s));
    save.nodes.push({ ...save.nodes[0], id: 700, type: "riverbank", store: [], siteId: river.id });
    save.lines.push({ id: 701, from: 700, to: pump.id, material: "link", timer: 0, active: false, lastMoved: 0, paid: [{ id: "iron_plate", n: 1 }] });
    const loaded = loadSave(save)!;
    expect(loaded.nodes.some((n) => n.type === "riverbank")).toBe(false);
    expect(loaded.lines).toEqual([]);
    expect(nodeById(loaded, pump.id)!.siteId).toBe(river.id);
  });

  it("lays one tube for every cell between the base and the riverbank", () => {
    const s = createTestGame(1);
    const pump = placeMachine(s, PUMP, 0, 0)!;
    const [near, far] = [...foundRivers(s)].sort((a, b) => riverPipeCost(a) - riverPipeCost(b));
    expect(riverPipeCost(near)).toBe(Math.max(1, Math.abs(near.x - BASE.x)));
    expect(riverPipeCost(far)).toBeGreaterThan(riverPipeCost(near));
    // Too few tubes in the bag: nothing is spent and the pump stays unlinked. A warehouse doesn't count.
    s.inv = s.inv.map((slot) => (slot && formOf(slot.id) === "tube" ? null : slot));
    s.inv[0] = { id: "iron_tube", n: riverPipeCost(near) - 1 };
    addTo(warehouse(s).store, "copper_tube", 200);
    expect(linkRiver(s, pump.id, near.id)).toBe(false);
    expect(pump.siteId).toBeUndefined();
    expect(bagCount(s, "tube")).toBe(riverPipeCost(near) - 1);
    // Copper picked: the pipe takes exactly its length, all copper, and the iron is left alone.
    addTo(s.inv, "copper_tube", 150);
    expect(linkRiver(s, pump.id, near.id, "copper_tube")).toBe(true);
    expect(bagCount(s, "copper_tube")).toBe(150 - riverPipeCost(near));
    expect(bagCount(s, "iron_tube")).toBe(riverPipeCost(near) - 1);
    // Moving to the far bank lays the longer pipe and takes the short one back up.
    expect(linkRiver(s, pump.id, far.id, "copper_tube")).toBe(true);
    expect(bagCount(s, "copper_tube")).toBe(150 - riverPipeCost(far));
    // Unlinking, or taking the pump down, gives every tube back.
    expect(linkRiver(s, pump.id, far.id)).toBe(true);
    expect(bagCount(s, "copper_tube")).toBe(150);
    linkRiver(s, pump.id, near.id, "copper_tube");
    removeNode(s, pump.id);
    expect(bagCount(s, "copper_tube")).toBe(150);
  });

  it("stops pumping when dry", () => {
    const { s, motor, pump, river } = atRiver();
    connect(s, motor.id, pump.id, POWER);
    river.left = 0;
    pump.outs.water = 0;
    run(s, 1);
    expect(pump.speed).toBe(0);
  });

  it("feeds a boiler whose engine then keeps its own pump running", () => {
    const { s, motor, pump } = atRiver();
    const boiler = placeMachine(s, "steam_boiler", 0, 0)!;
    const engine = placeMachine(s, "steam_engine", 0, 0)!;
    boiler.fuel = { id: "An", n: 32 };
    // Started on the spring: pump to boiler, boiler to engine.
    connect(s, motor.id, pump.id, POWER);
    expect(connect(s, pump.id, boiler.id, "main")).toBeTruthy();
    expect(connect(s, boiler.id, engine.id, "main")).toBeTruthy();
    run(s, 20);
    expect(engine.energy).toBeGreaterThan(0);
    // Then the engine takes over the pump and the spring runs out.
    s.lines = s.lines.filter((l) => l.from !== motor.id);
    connect(s, engine.id, pump.id, POWER);
    motor.energy = 0;
    run(s, 30);
    expect(engine.energy).toBeGreaterThan(0);
    expect(boiler.ins.water?.n).toBeGreaterThan(0);
  });
});

describe("filling a machine from the index", () => {
  const kilnRecipe = () => recipesFor("brick", 1).find((r) => r.machine === "brick_kiln")!;
  const setup = () => {
    const s = createGame(1);
    return { s, kiln: placeMachine(s, "brick_kiln", 0, 0)! };
  };

  it("moves one batch from the bag", () => {
    const { s, kiln } = setup();
    s.inv[0] = { id: "Kn", n: 10 };
    s.inv[1] = { id: "Lg", n: 10 };
    expect(fillFromBag(s, kiln.id, kilnRecipe(), 1)).toBe(true);
    expect(kiln.ins.clay).toEqual({ id: "Kn", n: 2 });
    expect(kiln.fuel).toEqual({ id: "Lg", n: 1 });
    expect(s.inv[0]!.n).toBe(8);
  });

  it("never reaches into the warehouse", () => {
    const { s, kiln } = setup();
    s.nodes[0].store[0] = { id: "Kn", n: 10 };
    expect(bagHolds(s, kilnRecipe())).toBe(false);
    expect(fillFromBag(s, kiln.id, kilnRecipe(), 1)).toBe(false);
    expect(s.nodes[0].store[0]).toEqual({ id: "Kn", n: 10 });
    expect(kiln.ins.clay).toBeNull();
  });

  it("fills as far as the slot allows, and keeps the rest in the bag", () => {
    const { s, kiln } = setup();
    s.inv[0] = { id: "Kn", n: 64 };
    fillFromBag(s, kiln.id, kilnRecipe(), Infinity);
    expect(kiln.ins.clay!.n).toBe(16);
    expect(s.inv[0]!.n).toBe(48);
  });

  it("gives what it can when the bag runs short, across stacks", () => {
    const { s, kiln } = setup();
    s.inv[0] = { id: "Kn", n: 1 };
    s.inv[3] = { id: "Kn", n: 2 };
    fillFromBag(s, kiln.id, kilnRecipe(), 2);
    expect(kiln.ins.clay!.n).toBe(3);
    expect(s.inv[0]).toBeNull();
    expect(s.inv[3]).toBeNull();
  });

  it("only offers recipes the machine is set to", () => {
    const s = createGame(1);
    const bench = placeMachine(s, "forming_bench", 0, 0)!;
    const tube = recipesFor("iron_tube", 1)[0];
    const cylinder = recipesFor("iron_cylinder", 1)[0];
    setForm(s, bench.id, "tube");
    expect(runsRecipe(bench, tube)).toBe(true);
    expect(runsRecipe(bench, cylinder)).toBe(false);
    expect(fillFromBag(s, bench.id, cylinder, 1)).toBe(false);
  });
});

describe("fluids", () => {
  const pumped = () => {
    const s = createTestGame(1);
    s.nodes = s.nodes.slice(0, 1);
    s.lines = [];
    const pump = placeMachine(s, "drainage_pump", 0, 0)!;
    const boiler = placeMachine(s, "steam_boiler", 0, 0)!;
    pump.outs.water = 150;
    return { s, pump, boiler };
  };

  it("sorts items into kinds", () => {
    expect(kindOf("water")).toBe("liquid");
    expect(kindOf("steam")).toBe("gas");
    expect(kindOf("iron")).toBe("item");
  });

  it("can't be picked up by hand from an output or a tank", () => {
    const { s, pump, boiler } = pumped();
    clickOutput(s, pump.id, "water", "left");
    expect(s.cursor).toBeNull();
    expect(takeOutput(s, pump.id, "water")).toBe(false);
    boiler.ins.water = { id: "water", n: 20 };
    clickInput(s, boiler.id, "water", "left");
    expect(s.cursor).toBeNull();
    expect(takeInput(s, boiler.id, "water")).toBe(false);
    expect(wheelInput(s, boiler.id, "water", "out")).toBe(false);
    expect(boiler.ins.water!.n).toBe(20);
  });

  it("fills an empty drum with exactly one drum's worth", () => {
    const { s, pump } = pumped();
    pump.outs.water = DRUM.liters + 2;
    s.cursor = { id: "iron_drum", n: 2 };
    clickOutput(s, pump.id, "water", "left");
    expect(pump.outs.water).toBe(2);
    expect(s.cursor).toEqual({ id: "iron_drum", n: 1 });
    expect(s.inv.some((slot) => slot?.id === "water_drum")).toBe(true);
    clickOutput(s, pump.id, "water", "left");
    expect(pump.outs.water).toBe(2);
  });

  it("pours a drum into a tank and gives the empty drum back", () => {
    const { s, boiler } = pumped();
    s.cursor = { id: "water_drum", n: 1 };
    clickInput(s, boiler.id, "water", "left");
    expect(boiler.ins.water).toEqual({ id: "water", n: DRUM.liters });
    expect(s.cursor).toEqual({ id: "iron_drum", n: 1 });
  });

  it("won't pour without room for the whole drum", () => {
    const { s, boiler } = pumped();
    boiler.ins.water = { id: "water", n: TANK_CAP - DRUM.liters + 1 };
    s.cursor = { id: "water_drum", n: 1 };
    clickInput(s, boiler.id, "water", "left");
    expect(boiler.ins.water!.n).toBe(TANK_CAP - DRUM.liters + 1);
    expect(s.cursor).toEqual({ id: "water_drum", n: 1 });
  });

  it("fills a drum by hand at a riverbank, from the hand first, and only with an empty drum", () => {
    const { s } = pumped();
    const bank = s.sites.find((site) => site.ore === "water")!;
    s.player = { x: bank.x, y: bank.y };
    s.path = [];
    const left = bank.left;
    expect(mine(s)).toBe(false);
    s.cursor = { id: "iron_drum", n: 1 };
    expect(mine(s)).toBe(true);
    expect(bank.left).toBe(left - DRUM.liters);
    expect(s.cursor).toBeNull();
    expect(s.inv.some((slot) => slot?.id === "water_drum")).toBe(true);
    expect(mine(s)).toBe(false);
  });

  it("flows along a line to a machine but never into a warehouse", () => {
    const { s, pump, boiler } = pumped();
    expect(routeMaterials(s, pump.id, s.nodes[0].id)).toEqual([]);
    expect(routeMaterials(s, pump.id, boiler.id)).toEqual(["main"]);
  });

  it("is lost, not banked, when its machine comes down", () => {
    const { s, pump } = pumped();
    expect(removeNode(s, pump.id)).toBe(true);
    expect(countOf(s, "water")).toBe(0);
  });
});

describe("groups", () => {
  const trio = () => {
    const s = createGame(1);
    const ids = [1, 2, 3].map(() => placeMachine(s, "brick_kiln", 0, 0)!.id);
    return { s, ids };
  };

  it("folds nodes behind one chosen port, which keeps them running", () => {
    const { s, ids } = trio();
    const kiln = nodeById(s, ids[0])!;
    kiln.ins.clay = { id: "Kn", n: 2 };
    kiln.fuel = { id: "Lg", n: 1 };
    const group = createGroup(s, ids, ids[1])!;
    expect(group.port).toBe(ids[1]);
    expect(group.code).toMatch(/^[0-9a-z]{3}$/);
    run(s, 9);
    expect(kiln.outs.brick).toBe(2);
  });

  it("needs two nodes and a port among them", () => {
    const { s, ids } = trio();
    expect(createGroup(s, [ids[0]], ids[0])).toBeNull();
    expect(createGroup(s, [ids[0], ids[1]], ids[2])).toBeNull();
  });

  it("keeps a node in one group at most", () => {
    const { s, ids } = trio();
    createGroup(s, [ids[0], ids[1]], ids[0]);
    expect(createGroup(s, [ids[1], ids[2]], ids[1])).toBeNull();
  });

  it("unfolds without touching machines or lines", () => {
    const { s, ids } = trio();
    const group = createGroup(s, ids, ids[0])!;
    removeGroup(s, group.id);
    expect(s.groups).toEqual([]);
    expect(ids.every((id) => nodeById(s, id))).toBe(true);
  });

  it("moves the port on when its node is demolished, and ends with fewer than two", () => {
    const { s, ids } = trio();
    const group = createGroup(s, ids, ids[0])!;
    removeNode(s, ids[0]);
    expect(group.port).toBe(ids[1]);
    removeNode(s, ids[1]);
    expect(s.groups).toEqual([]);
  });
});

describe("blueprints", () => {
  const line = () => {
    const s = createGame(1);
    const motor = placeMachine(s, MOTOR, 10, 10)!;
    const kiln = placeMachine(s, BELT_DRIVE, 100, 10)!;
    connect(s, motor.id, kiln.id, POWER);
    // Line materials are paid from the bag. Slot 5 keeps clear of the machines tests put in front.
    s.inv[5] = { id: "iron_rod", n: 8 };
    return { s, motor, kiln };
  };

  it("copies nodes and their lines as ghosts that do nothing", () => {
    const { s, motor, kiln } = line();
    const copies = copyToGhosts(s, [motor.id, kiln.id], 50, 60);
    expect(copies.map((g) => [g.type, g.x, g.y])).toEqual([[MOTOR, 60, 70], [BELT_DRIVE, 150, 70]]);
    expect(s.ghostLines).toEqual([{ from: copies[0].id, to: copies[1].id, material: POWER }]);
    // The warehouse and workbench every game starts with, the construction bench made in S0, and the two copied.
    expect(s.nodes).toHaveLength(5);
    run(s, 2);
    expect(s.lines).toHaveLength(1);
  });

  it("leaves out lines that reach outside the selection", () => {
    const { s, kiln } = line();
    copyToGhosts(s, [kiln.id], 0, 0);
    expect(s.ghostLines).toEqual([]);
  });

  it("needs a real machine before a ghost becomes one", () => {
    const { s, kiln } = line();
    const [ghost] = copyToGhosts(s, [kiln.id], 0, 0);
    expect(buildGhost(s, ghost.id)).toBeNull();
    expect(s.ghosts).toHaveLength(1);
    s.inv[0] = { id: BELT_DRIVE, n: 1 };
    expect(buildGhost(s, ghost.id)?.type).toBe(BELT_DRIVE);
    expect(s.ghosts).toHaveLength(0);
    expect(s.inv[0]).toBeNull();
  });

  it("makes the planned lines real once both ends exist, paying for them", () => {
    const { s, motor, kiln } = line();
    const copies = copyToGhosts(s, [motor.id, kiln.id], 0, 200);
    s.inv[0] = { id: MOTOR, n: 1 };
    s.inv[1] = { id: BELT_DRIVE, n: 1 };
    // A power line is paid in an iron rod.
    const rods = countOf(s, "iron_rod");
    const a = buildGhost(s, copies[0].id)!;
    expect(s.ghostLines).toHaveLength(1);
    const b = buildGhost(s, copies[1].id)!;
    expect(s.ghostLines).toHaveLength(0);
    expect(s.lines.some((l) => l.from === a.id && l.to === b.id && l.material === POWER)).toBe(true);
    expect(countOf(s, "iron_rod")).toBe(rods - 1);
  });

  it("keeps a planned line waiting when the parts run out", () => {
    const { s, motor, kiln } = line();
    const copies = copyToGhosts(s, [motor.id, kiln.id], 0, 200);
    s.inv[5] = null;
    s.inv[0] = { id: MOTOR, n: 1 };
    s.inv[1] = { id: BELT_DRIVE, n: 1 };
    expect(buildAllGhosts(s)).toBe(2);
    expect(s.ghostLines).toHaveLength(1);
    expect(copies).toHaveLength(2);
  });

  it("restores a machine's form", () => {
    const s = createGame(1);
    const bench = placeMachine(s, "forming_bench", 0, 0)!;
    setForm(s, bench.id, "cylinder");
    const [ghost] = copyToGhosts(s, [bench.id], 0, 0);
    s.inv[0] = { id: "forming_bench", n: 1 };
    expect(buildGhost(s, ghost.id)?.form).toBe("cylinder");
  });

  it("builds what it can and leaves the rest planned", () => {
    const { s, motor, kiln } = line();
    copyToGhosts(s, [motor.id, kiln.id], 0, 0);
    s.inv[0] = { id: BELT_DRIVE, n: 1 };
    expect(buildAllGhosts(s)).toBe(1);
    expect(s.ghosts.map((g) => g.type)).toEqual([MOTOR]);
  });

  it("drops a ghost and its lines", () => {
    const { s, motor, kiln } = line();
    const copies = copyToGhosts(s, [motor.id, kiln.id], 0, 0);
    removeGhost(s, copies[0].id);
    expect(s.ghosts).toHaveLength(1);
    expect(s.ghostLines).toEqual([]);
  });

  it("copies a pump's riverbank", () => {
    const s = createTestGame(1);
    const pump = placeMachine(s, "drainage_pump", 0, 0)!;
    tubes(s);
    const [bank] = foundRivers(s);
    linkRiver(s, pump.id, bank.id);
    const [ghost] = copyToGhosts(s, [pump.id], 0, 0);
    s.inv[0] = { id: "drainage_pump", n: 1 };
    expect(buildGhost(s, ghost.id)?.siteId).toBe(bank.id);
  });
});

describe("vein grades", () => {
  const veins = () => [...Array(3000).keys()].flatMap((seed) => withVeinsNearBase(() => generateSites(seed + 1)).filter((v) => v.rich));

  it("leaves the first vein near the base to luck", () => {
    const first = [...Array(60).keys()].map((seed) => withVeinsNearBase(() => generateSites(seed + 1))[0].rich);
    expect(first).toContain("scarce");
    expect(first).toContain("normal");
  });

  it("keeps rich veins under 1% on the surface", () => {
    expect(LAYERS[0].richness.rich).toBeLessThan(0.01);
    const all = veins();
    const share = all.filter((v) => v.rich === "rich").length / all.length;
    expect(share).toBeGreaterThan(0);
    expect(share).toBeLessThan(0.01);
  });

  it("scales size by grade", () => {
    const all = veins();
    const sizes = (grade: string) => all.filter((v) => v.rich === grade).map((v) => v.total);
    expect(Math.max(...sizes("scarce"))).toBeLessThanOrEqual(grade("scarce")[1]);
    expect(Math.min(...sizes("normal"))).toBeGreaterThanOrEqual(grade("normal")[0]);
    expect(Math.max(...sizes("normal"))).toBeLessThanOrEqual(grade("normal")[1]);
    expect(Math.min(...sizes("rich"))).toBeGreaterThanOrEqual(grade("rich")[0]);
  });

  it("makes rich veins likelier the deeper the layer", () => {
    const rich = LAYERS.map((layer) => layer.richness.rich);
    expect(rich).toEqual([...rich].sort((a, b) => a - b));
    expect(rich[0]).toBeLessThan(rich[2]);
    for (const layer of LAYERS) expect(Object.values(layer.richness).reduce((a, b) => a + b, 0)).toBeCloseTo(1);
  });

  it("leaves food ungraded", () => {
    expect(generateSites(1).filter((v) => v.ore === "Be").every((v) => !v.rich)).toBe(true);
  });

  it("grades old veins as normal", () => {
    const s = gameWithVeins(1);
    delete s.sites[0].rich;
    upgradeSave(s);
    expect(s.sites[0].rich).toBe("normal");
  });
});

describe("safe walking", () => {
  const hazards = (s: GameState) => s.path.filter((cell) => {
    const kind = terrain(cell.x, cell.y, s.seed)[1];
    return kind === "t-water" || kind === "t-hill";
  }).length;
  /** A seed and spot with known hills between the base and the target. */
  const hilly = () => {
    for (let seed = 1; seed < 200; seed += 1) {
      const s = createGame(seed);
      s.sites = [];
      const target = { x: 8, y: 0 };
      setSafeWalk(s, false);
      walkTo(s, target);
      // The target itself must be safe ground, or no route could avoid it.
      if (hazards(s) >= 1 && terrain(target.x, target.y, s.seed)[2] === 0) return { s, target };
    }
    throw new Error("no hilly start");
  };

  /** Steps until the walk ends, by arriving or by safe mode stopping it. */
  const walkOut = (s: GameState) => {
    for (let i = 0; i < 5000 && s.path.length; i += 1) step(s);
  };

  it("in safe mode, stops short of the first known hazard and says what it is", () => {
    const { s, target } = hilly();
    setSafeWalk(s, true);
    walkTo(s, target);
    const hp = s.hp;
    walkOut(s);
    expect(s.halt).toBeTruthy();
    expect(s.halt!.target).toEqual(target);
    // Water ahead, or a step up or down a hill.
    const ahead = terrain(s.halt!.x, s.halt!.y, s.seed);
    const here = terrain(s.player.x, s.player.y, s.seed);
    expect(ahead[1] === "t-water" || ahead[2] !== here[2]).toBe(true);
    expect(s.halt!.damage).toBeGreaterThan(0);
    // Stopped beside it, unhurt.
    expect(Math.max(Math.abs(s.halt!.x - s.player.x), Math.abs(s.halt!.y - s.player.y))).toBe(1);
    expect(s.hp).toBe(hp);
  });

  it("goes on into the hazard when the same walk is asked for again", () => {
    const { s, target } = hilly();
    setSafeWalk(s, true);
    walkTo(s, target);
    walkOut(s);
    const at = { x: s.halt!.x, y: s.halt!.y };
    walkTo(s, target);
    expect(s.halt).toBeNull();
    let crossed = false;
    for (let i = 0; i < 5000 && s.path.length && !crossed; i += 1) {
      step(s);
      crossed = s.player.x === at.x && s.player.y === at.y;
    }
    expect(crossed).toBe(true);
  });

  it("walks straight through everything with safe mode off", () => {
    const { s, target } = hilly();
    setSafeWalk(s, false);
    walkTo(s, target);
    expect(hazards(s)).toBeGreaterThan(0);
    for (let i = 0; i < 5000 && s.path.length; i += 1) {
      keepAlive(s);
      step(s);
    }
    expect(s.player).toEqual(target);
    expect(s.halt ?? null).toBeNull();
  });

  it("still crosses a river when there is no way around", () => {
    const s = createTestGame(1);
    const bank = s.sites.find((v) => v.ore === "water")!;
    const far = { x: bank.x + (bank.x > 0 ? 6 : -6), y: 0 };
    walkTo(s, far);
    expect(s.path.at(-1)).toEqual(far);
  });

  it("walks only one cell at a time", () => {
    const { s, target } = hilly();
    setSafeWalk(s, true);
    walkTo(s, target);
    let at = s.player;
    for (const cell of s.path) {
      expect(Math.max(Math.abs(cell.x - at.x), Math.abs(cell.y - at.y))).toBe(1);
      at = cell;
    }
  });

  it("steps around a small hazard, but crosses one that would take too long to avoid", () => {
    const from = { x: 0, y: 0 };
    const to = { x: 10, y: 0 };
    /** A wall of 3-damage cells at x = 5, reaching `half` cells up and down. */
    const wall = (half: number) => (x: number, y: number) => (x === 5 && Math.abs(y) <= half ? 3 : 0);
    const crossings = (half: number) => safePath(from, to, wall(half)).filter((c) => wall(half)(c.x, c.y)).length;
    expect(crossings(1)).toBe(0);
    expect(crossings(20)).toBe(1);
  });

  it("keeps a very long walk fast", () => {
    const s = createGame(1);
    const start = performance.now();
    walkTo(s, { x: 2000, y: 1500 });
    expect(performance.now() - start).toBeLessThan(500);
    expect(s.path.at(-1)).toEqual({ x: 2000, y: 1500 });
  });
});

describe("naming", () => {
  it("shows the player's name with the code, and falls back when blank", () => {
    const s = createGame(1);
    const kiln = placeMachine(s, "brick_kiln", 0, 0)!;
    const plain = nodeLabel(s, kiln);
    expect(rename(s, kiln.id, "  1번 가마 ")).toBe(true);
    expect(nodeLabel(s, kiln)).toBe(`1번 가마 ${kiln.code}`);
    rename(s, kiln.id, "   ");
    expect(nodeLabel(s, kiln)).toBe(plain);
  });

  it("names groups too, and cuts a long name", () => {
    const s = createGame(1);
    const ids = [1, 2].map(() => placeMachine(s, "brick_kiln", 0, 0)!.id);
    const group = createGroup(s, ids, ids[0])!;
    rename(s, group.id, "가".repeat(40));
    expect(group.name).toHaveLength(NAME_MAX);
  });

  it("survives a save", () => {
    const s = createGame(1);
    const kiln = placeMachine(s, "brick_kiln", 0, 0)!;
    rename(s, kiln.id, "벽돌");
    expect(JSON.parse(JSON.stringify(s)).nodes.at(-1).name).toBe("벽돌");
  });
});

describe("fuel", () => {
  const kilnWith = (clay: number, fuel: { id: string; n: number } | null) => {
    const s = createGame(1);
    const kiln = placeMachine(s, "brick_kiln", 0, 0)!;
    kiln.ins.clay = clay ? { id: "Kn", n: clay } : null;
    kiln.fuel = fuel;
    return { s, kiln };
  };

  it("burns only while there is a recipe it can run", () => {
    const { s, kiln } = kilnWith(0, { id: "Lg", n: 4 });
    run(s, 20);
    expect(kiln.fuel).toEqual({ id: "Lg", n: 4 });
    expect(kiln.heat).toBe(0);
  });

  it("burns its heat per second while working, a piece at a time", () => {
    const { s, kiln } = kilnWith(2, { id: "Lg", n: 4 });
    run(s, 8.1);
    // One batch is 8 seconds at 1 heat a second: exactly one lignite.
    expect(kiln.outs.brick).toBe(2);
    expect(kiln.fuel).toEqual({ id: "Lg", n: 3 });
  });

  it("keeps burning a lit piece after the work runs out, like a furnace", () => {
    const { s, kiln } = kilnWith(2, { id: "An", n: 2 });
    run(s, 10);
    // Anthracite gives 16; one batch took 8, and the fire kept going for 2 more seconds.
    expect(kiln.outs.brick).toBe(2);
    expect(kiln.fuel).toEqual({ id: "An", n: 1 });
    expect(kiln.heat).toBeCloseTo(6);
    expect(kiln.heatFull).toBe(16);
    run(s, 10);
    // Burnt out, and with no clay left the next piece stays unlit.
    expect(kiln.heat).toBe(0);
    expect(kiln.fuel).toEqual({ id: "An", n: 1 });
  });

  it("lights the next piece when work comes back", () => {
    const { s, kiln } = kilnWith(0, { id: "Lg", n: 2 });
    run(s, 3);
    expect(kiln.fuel).toEqual({ id: "Lg", n: 2 });
    kiln.ins.clay = { id: "Kn", n: 2 };
    run(s, 0.5);
    expect(kiln.fuel).toEqual({ id: "Lg", n: 1 });
    expect(kiln.heat).toBeGreaterThan(7);
  });

  it("waits with no fuel, and says so", () => {
    const { s, kiln } = kilnWith(2, null);
    run(s, 5);
    expect(kiln.outs.brick).toBe(0);
    expect(lacksFuel(kiln)).toBe(true);
    expect(status(kiln)).toBe("idle");
  });

  it("takes only fuel in the firebox, one kind at a time", () => {
    const { s, kiln } = kilnWith(0, null);
    s.cursor = { id: "Kn", n: 3 };
    clickFuel(s, kiln.id, "left");
    expect(kiln.fuel).toBeNull();
    s.cursor = { id: "Lg", n: 3 };
    clickFuel(s, kiln.id, "left");
    expect(kiln.fuel).toEqual({ id: "Lg", n: 3 });
    s.cursor = { id: "An", n: 1 };
    clickFuel(s, kiln.id, "left");
    expect(kiln.fuel).toEqual({ id: "Lg", n: 3 });
    s.cursor = null;
    clickFuel(s, kiln.id, "left");
    expect(kiln.fuel).toBeNull();
    expect(s.cursor).toEqual({ id: "Lg", n: 3 });
  });

  it("gives deeper coal more heat", () => {
    expect(fuelValue("Lg")).toBeLessThan(fuelValue("Bt"));
    expect(fuelValue("Bt")).toBeLessThan(fuelValue("An"));
    expect(fuelValue("An")).toBeLessThan(fuelValue("coke"));
    expect(fuelValue("Kn")).toBe(0);
  });
});

describe("old saves", () => {
  const old = () => {
    const s = createGame(1) as unknown as Record<string, unknown> & GameState;
    placeMachine(s, "brick_kiln", 0, 0);
    return JSON.parse(JSON.stringify(s));
  };

  it("doesn't convert saves from before fuel and power networks", () => {
    for (const version of [2, 9, OLDEST_SAVE - 1]) {
      const save = old();
      save.version = version;
      expect(loadSave(save)).toBeNull();
    }
  });

  it("keeps what the player had in a current save", () => {
    const save = old();
    save.inv[0] = { id: "Lm", n: 7 };
    save.nodes[0].store[2] = { id: "iron", n: 3 };
    const s = loadSave(save)!;
    expect(s.version).toBe(SAVE_VERSION);
    expect(s.inv[0]).toEqual({ id: "Lm", n: 7 });
    expect(s.nodes[0].store[2]).toEqual({ id: "iron", n: 3 });
    expect(s.seed).toBe(1);
    run(s, 2);
  });

  it("drops machines that no longer exist, with their lines", () => {
    const save = old();
    save.nodes.push({ ...save.nodes[1], id: 900, type: "slag_yard" });
    save.lines.push({ id: 901, from: 900, to: save.nodes[1].id, material: "main" });
    const s = loadSave(save)!;
    expect(s.nodes.some((n) => n.id === 900)).toBe(false);
    expect(s.lines).toEqual([]);
  });

  it("refuses what isn't a save, or a newer one", () => {
    expect(loadSave(null)).toBeNull();
    expect(loadSave({ hello: 1 })).toBeNull();
    const save = old();
    save.version = SAVE_VERSION + 1;
    expect(loadSave(save)).toBeNull();
  });
});

describe("S1-3", () => {
  const stage3 = () => {
    const s = createTestGame(1);
    s.nodes = s.nodes.slice(0, 1);
    s.lines = [];
    const motor = placeMachine(s, MOTOR, 0, 0)!;
    motor.energy = 100000;
    return { s, motor };
  };

  it("rolls limestone from the start: what turns up on the map doesn't wait for a stage", () => {
    expect(stageOres(0)).toContain("Ls");
    let found = false;
    for (let cx = -60; cx < 60 && !found; cx += 1) for (let cy = 4; cy < 10 && !found; cy += 1) found = chunkSites(1, cx, cy).some((v) => v.ore === "Ls");
    expect(found).toBe(true);
  });

  it("turns coal into coke, with tar that needs somewhere to go", () => {
    const { s } = stage3();
    const oven = placeMachine(s, "coke_oven", 0, 0)!;
    oven.ins.coal = { id: "Lg", n: 8 };
    run(s, 11);
    expect(oven.outs.coke).toBe(1);
    expect(oven.outs.coal_tar).toBe(1);
    expect(takeOutput(s, oven.id, "coal_tar")).toBe(false);
    expect(routeMaterials(s, oven.id, s.nodes[0].id)).toEqual(["main"]);
  });

  it("needs fans to build what blows air", () => {
    expect(machineCost("blast_furnace").iron_fan).toBe(2);
    expect(machineCost("converter").iron_fan).toBe(1);
  });

  it("forms a fan from iron on the bench", () => {
    const s = createGame(1);
    const bench = placeMachine(s, "forming_bench", 0, 0)!;
    setForm(s, bench.id, "fan");
    bench.ins.iron = { id: "iron", n: 3 };
    power(s, bench.id);
    run(s, 11);
    expect(bench.outs.iron_fan).toBe(1);
  });

  it("forms rods, rivets, gears and springs from any metal on the bench", () => {
    const parts: [string, number, number][] = [["rod", 1, 2], ["rivet", 1, 4], ["gear", 2, 1], ["spring", 2, 1]];
    for (const [form, n, out] of parts) {
      for (const metal of ["iron", "copper", "steel"]) {
        const s = createGame(1);
        const bench = placeMachine(s, "forming_bench", 0, 0)!;
        setForm(s, bench.id, form);
        bench.ins.iron = { id: metal, n };
        power(s, bench.id);
        run(s, 20);
        expect(bench.outs[`${metal}_${form}`]).toBe(out);
      }
    }
  });

  it("builds S1-4 and later from steel gears", () => {
    expect(machineCost("coil_winder").steel_gear).toBe(4);
    expect(machineCost("generator_bench").steel_gear).toBe(10);
  });

  const tarLine = () => {
    const { s, motor } = stage3();
    const oven = placeMachine(s, "coke_oven", 0, 0)!;
    const tank = placeMachine(s, "tar_tank", 0, 0)!;
    // Tar moves on a pressure pump, which the motor runs.
    const press = placeMachine(s, PRESSURE_PUMP, 0, 0)!;
    connect(s, motor.id, press.id, POWER);
    connect(s, press.id, oven.id, PRESS);
    expect(connect(s, oven.id, tank.id, "byproduct")).toBeTruthy();
    return { s, oven, tank };
  };

  it("stores tar in a tank instead of destroying it", () => {
    const { s, oven, tank } = tarLine();
    oven.outs.coal_tar = 3;
    run(s, 6);
    expect(oven.outs.coal_tar).toBe(0);
    expect(tank.ins.coal_tar).toEqual({ id: "coal_tar", n: 3 });
  });

  it("refuses more when full, by default, so the oven backs up", () => {
    const { s, oven, tank } = tarLine();
    tank.ins.coal_tar = { id: "coal_tar", n: TAR_TANK_CAP };
    oven.outs.coal_tar = 3;
    run(s, 6);
    expect(oven.outs.coal_tar).toBe(3);
    expect(tank.ins.coal_tar!.n).toBe(TAR_TANK_CAP);
  });

  it("throws away the excess when told to, so the oven keeps going", () => {
    const { s, oven, tank } = tarLine();
    expect(setOverflow(s, tank.id, "discard")).toBe(true);
    tank.ins.coal_tar = { id: "coal_tar", n: TAR_TANK_CAP };
    oven.outs.coal_tar = 3;
    run(s, 6);
    expect(oven.outs.coal_tar).toBe(0);
    expect(tank.ins.coal_tar!.n).toBe(TAR_TANK_CAP);
  });

  it("takes only tar, and can't be emptied by hand", () => {
    const { s, tank } = tarLine();
    tank.ins.coal_tar = { id: "coal_tar", n: 5 };
    expect(takeInput(s, tank.id, "coal_tar")).toBe(false);
    expect(routeMaterials(s, s.nodes[0].id, tank.id)).toEqual([]);
  });

  it("smelts ore, coke and limestone in the blast furnace, on power", () => {
    const { s, motor } = stage3();
    const furnace = placeMachine(s, "blast_furnace", 0, 0)!;
    furnace.ins.iron_ore = { id: "Lm", n: 4 };
    furnace.ins.coke = { id: "coke", n: 2 };
    furnace.ins.limestone = { id: "Ls", n: 1 };
    run(s, 2);
    expect(lacksPower(furnace)).toBe(true);
    // A spring is too weak a tier for a blast furnace; it needs steam.
    connect(s, motor.id, furnace.id, POWER);
    run(s, 2);
    expect(furnace.tierLow).toBe(true);
    s.lines = s.lines.filter((l) => l.to !== furnace.id);
    power(s, furnace.id);
    run(s, 7);
    // A blast furnace pours pig iron.
    expect(furnace.outs.pig_iron).toBe(4);
    expect(furnace.outs.slag).toBe(2);
  });

  it("finishes the stage with 100 steel, which stays with the player", () => {
    const { s } = stage3();
    const engine = placeMachine(s, "steam_engine", 0, 0)!;
    engine.ins.steam = { id: "steam", n: 40 };
    const converter = placeMachine(s, "converter", 0, 0)!;
    connect(s, engine.id, converter.id, POWER);
    converter.ins.pig_iron = { id: "pig_iron", n: 4 };
    s.made.steel = 98;
    run(s, 12);
    expect(s.announced).toBe("S1-3");
    expect(converter.outs.steel).toBe(3);
  });

  it("carries power through a manifold, and counts it in the load", () => {
    const { s } = stage3();
    const engine = placeMachine(s, "steam_engine", 0, 0)!;
    engine.ins.steam = { id: "steam", n: 40 };
    const manifold = placeMachine(s, "steam_manifold", 0, 0)!;
    const hammer = placeMachine(s, "steam_hammer", 0, 0)!;
    hammer.ins.iron = { id: "iron", n: 12 };
    expect(connect(s, engine.id, manifold.id, POWER)).toBeTruthy();
    expect(connect(s, manifold.id, hammer.id, POWER)).toBeTruthy();
    run(s, 1);
    expect(hammer.speed).toBe(1);
    expect(powerLoad(s, engine).connected).toBe(3);
    expect(hasDrive(s, hammer.id)).toBe(true);
  });

  it("takes steam only, never a spring's power", () => {
    const { s, motor } = stage3();
    const manifold = placeMachine(s, "steam_manifold", 0, 0)!;
    expect(routeMaterials(s, motor.id, manifold.id)).toEqual([]);
    expect(connect(s, motor.id, manifold.id, POWER)).toBeNull();
  });

  it("cuts a spring's line to a manifold from an old save", () => {
    const { s, motor } = stage3();
    const manifold = placeMachine(s, "steam_manifold", 0, 0)!;
    s.lines.push({ id: 999, from: motor.id, to: manifold.id, material: POWER, timer: 0, active: false, lastMoved: 0, paid: [{ id: "iron_plate", n: 1 }] });
    const plates = countOf(s, "iron_plate");
    upgradeSave(s);
    expect(s.lines.some((l) => l.id === 999)).toBe(false);
    expect(countOf(s, "iron_plate")).toBe(plates + 1);
  });

  it("won't loop power round a pair of manifolds forever", () => {
    const { s } = stage3();
    const a = placeMachine(s, "steam_manifold", 0, 0)!;
    const b = placeMachine(s, "steam_manifold", 0, 0)!;
    connect(s, a.id, b.id, POWER);
    connect(s, b.id, a.id, POWER);
    run(s, 1);
    expect(hasDrive(s, a.id)).toBe(false);
  });

  it("takes no items into a manifold", () => {
    const { s } = stage3();
    const manifold = placeMachine(s, "steam_manifold", 0, 0)!;
    expect(routeMaterials(s, s.nodes[0].id, manifold.id)).toEqual([]);
  });

  it("splits one line evenly between two machines", () => {
    const { s, motor } = stage3();
    const store = s.nodes[0];
    store.store = store.store.map(() => null);
    store.store[0] = { id: "Lg", n: 20 };
    const splitter = placeMachine(s, "item_splitter", 0, 0)!;
    const a = placeMachine(s, "brick_kiln", 0, 0)!;
    const b = placeMachine(s, "brick_kiln", 0, 0)!;
    const drive = placeMachine(s, BELT_DRIVE, 0, 0)!;
    connect(s, motor.id, drive.id, POWER);
    connect(s, drive.id, store.id, DRIVE);
    expect(connect(s, store.id, splitter.id, "all")).toBeTruthy();
    connect(s, splitter.id, a.id, "all");
    connect(s, splitter.id, b.id, "all");
    run(s, 30);
    // Each firebox tops up to the same line limit, from the one line split in two.
    expect(a.fuel?.n).toBeGreaterThan(0);
    expect(a.fuel?.n).toBe(b.fuel?.n);
  });

  it("takes no power line, and passes items on along its network's belt drive", () => {
    const { s, motor } = stage3();
    const splitter = placeMachine(s, "item_splitter", 0, 0)!;
    const kiln = placeMachine(s, "brick_kiln", 0, 0)!;
    splitter.store[0] = { id: "Lg", n: 2 };
    connect(s, splitter.id, kiln.id, "all");
    expect(routeMaterials(s, motor.id, splitter.id)).toEqual([]);
    run(s, 2);
    expect(splitter.store[0]).toEqual({ id: "Lg", n: 2 });
    motor.energy = SPRING_MAX;
    const drive = placeMachine(s, BELT_DRIVE, 0, 0)!;
    connect(s, motor.id, drive.id, POWER);
    connect(s, drive.id, kiln.id, DRIVE);
    run(s, 2);
    expect(kiln.fuel?.n).toBe(2);
    expect(splitter.store[0]).toBeNull();
  });
});

describe("site search order", () => {
  const site = (id: number, left: number) => ({ id, ore: "Lm", x: id, y: 0, total: 10, left, seed: 1 });
  const steps = (v: { x: number }) => v.x;

  it("puts empty sites last, nearest first within each", () => {
    const sites = [site(1, 0), site(2, 5), site(3, 0), site(4, 5)];
    expect(orderSites(sites, steps, false).map((v) => v.id)).toEqual([2, 4, 1, 3]);
  });

  it("leaves empty sites out when hidden", () => {
    expect(orderSites([site(1, 0), site(2, 5)], steps, true).map((v) => v.id)).toEqual([2]);
  });
});

describe("gear", () => {
  const holding = (id: string, n = 1) => {
    const s = createGame(1);
    s.cursor = { id, n };
    return s;
  };

  it("fits only the slot it belongs to", () => {
    const s = holding("iron_boots");
    clickGear(s, "back");
    expect(s.gear.back).toBeUndefined();
    expect(s.cursor).toEqual({ id: "iron_boots", n: 1 });
    clickGear(s, "feet");
    expect(s.gear.feet).toBe("iron_boots");
    expect(s.cursor).toBeNull();
  });

  it("won't take an ordinary item", () => {
    const s = holding("iron");
    clickGear(s, "hand");
    expect(s.gear.hand).toBeUndefined();
  });

  it("comes back off into the hand", () => {
    const s = holding("iron_pick");
    clickGear(s, "hand");
    clickGear(s, "hand");
    expect(s.gear.hand).toBeNull();
    expect(s.cursor).toEqual({ id: "iron_pick", n: 1 });
  });

  it("uses one from a stack and swaps nothing away", () => {
    const s = holding("iron_boots", 3);
    clickGear(s, "feet");
    expect(s.cursor).toEqual({ id: "iron_boots", n: 2 });
    clickGear(s, "feet");
    expect(s.cursor).toEqual({ id: "iron_boots", n: 1 });
    expect(s.inv.some((slot) => slot?.id === "iron_boots")).toBe(true);
  });

  it("boots shorten every step", () => {
    const s = createGame(1);
    const plain = walkTime(s);
    s.gear.feet = "iron_boots";
    expect(walkTime(s)).toBeCloseTo(plain * 0.91);
  });

  it("a pack raises the load limit", () => {
    const s = createGame(1);
    s.inv[0] = { id: "iron", n: 25 };
    expect(overloaded(s)).toBe(true);
    s.gear.back = "iron_pack";
    expect(carryLimit(s)).toBe(MAX_CARRY + 40);
    expect(overloaded(s)).toBe(false);
  });

  it("a pick doesn't change how much one strike takes: always one", () => {
    const s = gameWithVeins(1);
    s.gear.hand = "iron_pick";
    const site = s.sites.find((v) => v.ore === "Lm")!;
    s.player = { x: site.x, y: site.y };
    const left = site.left;
    expect(mine(s)).toBe(true);
    expect(site.left).toBe(left - 1);
    expect(mine(s)).toBe(true);
    expect(site.left).toBe(left - 2);
    expect(s.inv[0]).toEqual({ id: "Lm", n: 2 });
  });

  it("is made on the forming bench", () => {
    const s = createGame(1);
    const bench = placeMachine(s, "forming_bench", 0, 0)!;
    setForm(s, bench.id, "boots");
    // Boots take an ingot, plates and rivets now, not ingots alone.
    bench.ins.iron = { id: "iron", n: 1 };
    bench.ins.iron_plate = { id: "iron_plate", n: 2 };
    bench.ins.iron_rivet = { id: "iron_rivet", n: 4 };
    power(s, bench.id);
    run(s, 9);
    expect(bench.outs.iron_boots).toBe(1);
  });

  it("is kept through old saves", () => {
    const save = JSON.parse(JSON.stringify(createGame(1)));
    delete save.gear;
    expect(loadSave(save)!.gear).toEqual({});
  });
});

describe("calendar", () => {
  it("counts years from one, four seasons each", () => {
    expect(yearAt(0)).toBe(1);
    expect(yearAt(SEASON_MS * 4 - 1)).toBe(1);
    expect(yearAt(SEASON_MS * 4)).toBe(2);
    expect(yearAt(SEASON_MS * 9)).toBe(3);
  });
});

describe("expected output", () => {
  it("appears only once the inputs are enough for a batch", () => {
    const s = createGame(1);
    const furnace = placeMachine(s, "bloomery", 0, 0)!;
    expect(expectedOutput(furnace)).toEqual([]);
    furnace.ins.iron_ore = { id: "Lm", n: 1 };
    furnace.fuel = { id: "Lg", n: 1 };
    expect(expectedOutput(furnace)).toEqual([]);
    furnace.ins.iron_ore = { id: "Lm", n: 3 };
    expect(expectedOutput(furnace)).toEqual(["bloom", "slag"]);
  });

  it("follows what the input decides", () => {
    const s = createGame(1);
    const furnace = placeMachine(s, "bloomery", 0, 0)!;
    furnace.ins.iron_ore = { id: "Ml", n: 2 };
    furnace.fuel = { id: "Lg", n: 1 };
    expect(expectedOutput(furnace)).toEqual(["copper", "slag"]);
  });

  it("stays quiet while the output is blocked", () => {
    const s = createGame(1);
    const furnace = placeMachine(s, "bloomery", 0, 0)!;
    furnace.ins.iron_ore = { id: "Lm", n: 3 };
    furnace.fuel = { id: "Lg", n: 1 };
    furnace.outs.copper = 1;
    expect(expectedOutput(furnace)).toEqual([]);
  });
});

describe("stage goals", () => {
  it("moves on when the next age's key machine is made, and leaves it in place", () => {
    // S1-2 ends with a coke oven built: the first machine of S1-3.
    const s = createGame(1);
    s.stage = 2;
    addTo(s.inv, "brick", 40);
    addTo(s.inv, "steam_drum", 1);
    expect(make(s, "coke_oven")).toBe(true);
    expect(s.announced).toBe("S1-2");
    expect(s.stage).toBe(3);
    expect(countOf(s, "coke_oven")).toBe(1);
  });

  it("counts a goal only from when its stage opens, so nothing made ahead fills it", () => {
    const s = createGame(1);
    s.stage = 2;
    s.made.coke_oven = 1;
    s.made.steel = 500;
    addTo(s.inv, "brick", 40);
    addTo(s.inv, "steam_drum", 1);
    make(s, "coke_oven");
    expect(s.stage).toBe(3);
    expect(s.goalBase).toBe(500);
    expect(goalMade(s)).toBe(0);
  });

  it("shows riverbanks from the start, like everything else on the map", () => {
    const s = newGame(1);
    expect(s.stage).toBe(0);
    expect(s.sites.some((site) => site.ore === "water")).toBe(true);
  });

  it("carries an old save over without losing progress", () => {
    const s = createGame(1) as GameState & { delivered?: number; won?: boolean };
    Object.assign(s, { stage: undefined, made: undefined, announced: undefined, delivered: 1, won: true, version: 16 });
    upgradeSave(s);
    expect(s.stage).toBe(2);
    expect(s.made.steam_engine_unit).toBe(1);
    expect(s.sites.some((site) => site.ore === "water")).toBe(true);
  });
});

describe("pressure pumps", () => {
  /** A coke oven with tar waiting to go down a pipe to a tank, and a wound motor nearby. */
  const tar = () => {
    const s = createTestGame(1);
    const motor = placeMachine(s, MOTOR, 0, 0)!;
    motor.energy = SPRING_MAX;
    const oven = placeMachine(s, "coke_oven", 0, 0)!;
    const tank = placeMachine(s, "tar_tank", 0, 0)!;
    connect(s, oven.id, tank.id, "byproduct");
    oven.outs.coal_tar = 6;
    return { s, motor, oven, tank };
  };

  it("leaves tar standing in its pipe without one, and gives the oven no power line", () => {
    const { s, motor, oven } = tar();
    expect(routeMaterials(s, motor.id, oven.id)).toEqual([]);
    run(s, 3);
    expect(oven.outs.coal_tar).toBe(6);
    expect(pipeNetOf(oven.id)).toMatchObject({ drives: 0, belts: 1, rate: 0 });
  });

  it("moves a whole fluid network, joined by a link on the power layer", () => {
    const { s, motor, oven, tank } = tar();
    const press = placeMachine(s, PRESSURE_PUMP, 0, 0)!;
    expect(routeMaterials(s, press.id, oven.id)).toEqual([PRESS]);
    expect(lineLayer(s, press.id, PRESS)).toBe("power");
    expect(routeCost(s, press.id, PRESS)).toEqual({ iron_rod: 1 });
    connect(s, motor.id, press.id, POWER);
    // Any machine on the network will do: here the link goes to the tank at the far end.
    connect(s, press.id, tank.id, PRESS);
    run(s, 4);
    // One pump gives 4 L/s to its one pipe; the pipe, laid with iron, takes 2 of it.
    expect(pipeNetOf(oven.id)).toMatchObject({ drives: 1, running: 1, belts: 1, rate: 4 });
    expect(oven.outs.coal_tar).toBe(0);
    expect(tank.ins.coal_tar?.n).toBe(6);
    expect(powerLoad(s, motor)).toEqual({ now: 2, connected: 2, limit: 5 });
  });

  it("lays a pipe with the tube picked, and a copper pipe carries twice what iron does", () => {
    const flow = (tube: string) => {
      const { s, motor, oven, tank } = tar();
      s.lines = s.lines.filter((l) => !(l.from === oven.id && l.to === tank.id));
      s.inv = s.inv.map((slot) => (slot && formOf(slot.id) === "tube" ? null : slot));
      addTo(s.inv, "iron_tube", 4);
      addTo(s.inv, "copper_tube", 4);
      expect(toggleRoute(s, oven.id, tank.id, "byproduct", tube)).toBe(true);
      const line = s.lines.find((l) => l.from === oven.id && l.to === tank.id)!;
      expect(line.kind).toBe(tube);
      expect(bagCount(s, tube)).toBe(3);
      const press = placeMachine(s, PRESSURE_PUMP, 0, 0)!;
      connect(s, motor.id, press.id, POWER);
      connect(s, press.id, oven.id, PRESS);
      oven.outs.coal_tar = 16;
      run(s, 2);
      return 16 - oven.outs.coal_tar;
    };
    const iron = flow("iron_tube");
    const copper = flow("copper_tube");
    expect(iron).toBeGreaterThanOrEqual(3);
    expect(copper).toBeGreaterThanOrEqual(iron * 2 - 1);
  });

  it("leaves a riverbank pump's pipes out: the pump pushes its own water", () => {
    const s = createTestGame(1);
    const motor = placeMachine(s, MOTOR, 0, 0)!;
    motor.energy = SPRING_MAX;
    const pump = placeMachine(s, PUMP, 0, 0)!;
    const boiler = placeMachine(s, "steam_boiler", 0, 0)!;
    pump.outs.water = 10;
    connect(s, motor.id, pump.id, POWER);
    connect(s, pump.id, boiler.id, "main");
    run(s, 2);
    expect(boiler.ins.water?.n).toBeGreaterThan(0);
    expect(pipeNetOf(pump.id)).toMatchObject({ drives: 0, belts: 0 });
  });
});

describe("hand work styles", () => {
  /** A bloomery loaded with ore and lit. */
  const furnace = () => {
    const s = newGame(1);
    const node = placeMachine(s, "bloomery", 0, 0)!;
    node.ins.iron_ore = { id: "Lm", n: 6 };
    node.fuel = { id: "Lg", n: 8 };
    run(s, 0.1);
    return { s, node };
  };

  it("moves a bloomery's work only while the bellows keep the blast in the zone", () => {
    const { s, node } = furnace();
    expect(status(node)).toBe("manual");
    // Cold: nothing moves.
    run(s, 2);
    expect(node.progress).toBe(0);
    // Four pumps bring it into the zone, and it works while it stays there.
    for (let i = 0; i < 4; i += 1) workMachine(s, node.id);
    expect(node.blast).toBe(BLAST.push * 4);
    run(s, 1);
    expect(node.progress).toBeGreaterThan(0);
    // Left alone it cools out of the zone and stops.
    run(s, 4);
    const stopped = node.progress;
    run(s, 2);
    expect(node.progress).toBe(stopped);
  });

  it("burns the batch inside when the bellows blow it past the top", () => {
    const { s, node } = furnace();
    node.progress = 0.5;
    for (let i = 0; i < 9; i += 1) workMachine(s, node.id);
    expect(node.ins.iron_ore).toEqual({ id: "Lm", n: 3 });
    expect(node.progress).toBe(0);
    expect(node.blast).toBe(BLAST.after);
    expect(node.burstAt).toBe(s.time);
  });

  it("counts a rhythm strike as the work it was worth", () => {
    const s = createGame(1);
    const hammer = placeMachine(s, "plate_hammer", 0, 0)!;
    hammer.ins.iron = { id: "iron", n: 2 };
    expect(machineRhythm("plate_hammer")).toEqual([700]);
    // An exact strike is worth 1.2 s of a 4 s plate.
    workMachine(s, hammer.id, 1.2);
    expect(hammer.progress).toBeCloseTo(1.2 / 4, 5);
  });
});

describe("S0 hand work", () => {
  /** Makes a machine on a bench as a player does: picks it, loads its cost from the bag, works it and takes it. */
  const build = (s: GameState, benchId: number, type: string): boolean => {
    const bench = nodeById(s, benchId)!;
    setForm(s, benchId, type);
    fillFromBag(s, benchId, recipeOf(bench), 1);
    press(s, benchId, recipeOf(bench).time);
    return takeOutput(s, benchId, type);
  };

  it("starts on a workbench in S0, with nothing from S1-1 open yet", () => {
    const s = newGame(1);
    expect(STAGES[0].id).toBe("S0");
    expect(s.stage).toBe(0);
    expect(s.nodes.map((n) => n.type)).toEqual([WAREHOUSE, WORKBENCH]);
    expect(placeMachine(s, "brick_kiln", 0, 0)).toBeNull();
    expect(placeMachine(s, "bloomery", 0, 0)).toBeTruthy();
  });

  it("makes S0's machines on the workbench, and everything after on the construction bench", () => {
    for (const type of ["open_kiln", "bloomery", "hand_forge", CONSTRUCTION]) expect(recipesFor(type)[0].machine).toBe(WORKBENCH);
    expect(recipesFor("brick_kiln", 1)[0].machine).toBe(CONSTRUCTION);
    // The workbench can't make what isn't open yet.
    const s = newGame(1);
    const bench = s.nodes.find((n) => n.type === WORKBENCH)!;
    expect(machineForms(WORKBENCH)).not.toContain("brick_kiln");
    expect(setForm(s, bench.id, "bloomery")).toBe(true);
  });

  it("goes from clay and ore to a construction bench by hand, which finishes S0", () => {
    const s = newGame(1);
    const workbench = s.nodes.find((n) => n.type === WORKBENCH)!.id;
    s.inv[0] = { id: "Kn", n: 12 };
    expect(build(s, workbench, "open_kiln")).toBe(true);

    // Bricks for the bloomery, the forge and the bench, fired slowly in the open.
    const kiln = placeMachine(s, "open_kiln", 0, 0)!;
    for (let i = 0; i < 600 && bagCount(s, "brick") < 18; i += 1) {
      if (!kiln.ins.clay) kiln.ins.clay = { id: "Kn", n: 16 };
      if (!kiln.fuel) kiln.fuel = { id: "Lg", n: 8 };
      run(s, 1);
      takeOutput(s, kiln.id, "brick");
    }
    expect(bagCount(s, "brick")).toBeGreaterThanOrEqual(18);
    addTo(s.inv, "Kn", 10);
    expect(build(s, workbench, "bloomery")).toBe(true);

    // The bloomery burns fuel and is worked by the bellows: six blooms, two for the forge and four for iron.
    const bloomery = placeMachine(s, "bloomery", 0, 0)!;
    for (let i = 0; i < 600 && bagCount(s, "bloom") < 6; i += 1) {
      if (!bloomery.ins.iron_ore) bloomery.ins.iron_ore = { id: "Lm", n: 15 };
      if (!bloomery.fuel) bloomery.fuel = { id: "Lg", n: 8 };
      run(s, 1);
      // Pump only while the blast is low enough, so it stays in the zone without overheating.
      // Pump until the blast is in the zone, as a player does several times a second, and no further.
      for (let k = 0; k < 5 && (bloomery.blast ?? 0) < BLAST.low + 10; k += 1) press(s, bloomery.id, 1);
      takeOutput(s, bloomery.id, "bloom");
      takeOutput(s, bloomery.id, "slag");
    }
    expect(bagCount(s, "bloom")).toBeGreaterThanOrEqual(6);
    expect(build(s, workbench, "hand_forge")).toBe(true);

    // The forge hammers blooms into iron by hand.
    const forge = placeMachine(s, "hand_forge", 0, 0)!;
    forge.ins.bloom = { id: "bloom", n: 4 };
    for (let i = 0; i < 100 && bagCount(s, "iron") < 4; i += 1) {
      press(s, forge.id, 1);
      takeOutput(s, forge.id, "iron");
    }
    expect(bagCount(s, "iron")).toBe(4);

    expect(build(s, workbench, CONSTRUCTION)).toBe(true);
    run(s, 1);
    expect(s.announced).toBe("S0");
    expect(s.stage).toBe(1);
    expect(placeMachine(s, "brick_kiln", 0, 0)).toBeTruthy();
    console.log(`S0 finished at ${Math.round(s.time / 1000)}s of game time`);
  });

  it("moves an older save one stage on, and gives it a workbench", () => {
    const s = createGame(1);
    s.nodes = s.nodes.filter((n) => n.type !== WORKBENCH);
    Object.assign(s, { version: 16, stage: 0 });
    upgradeSave(s);
    expect(s.stage).toBe(1);
    expect(s.nodes.filter((n) => n.type === WORKBENCH)).toHaveLength(1);
    expect(s.nodes.filter((n) => n.type === CONSTRUCTION)).toHaveLength(1);
  });

  it("keeps the last workbench, like the last construction bench", () => {
    const s = newGame(1);
    const bench = s.nodes.find((n) => n.type === WORKBENCH)!;
    expect(removeNode(s, bench.id)).toBe(false);
  });
});

describe("S1-1 playthrough", () => {
  it("builds a steam engine from nothing but clicks and lines", () => {
    const s = createGame(2026);
    // Three ore make a bloom and a bloom forges into one iron, so iron takes more ore than it used to.
    gather(s, "iron_ore", 240);
    gather(s, "coal", 120);
    gather(s, "clay", 16);
    gather(s, "copper_ore", 16);

    const add = (type: string) => placeMachine(s, type, 0, 0)!.id;
    const store = warehouse(s).id;
    // No smelter until the blast furnace: iron comes from bloomeries worked by the bellows and blooms
    // hammered on hand forges, and copper from a bloomery of its own.
    // Two iron lines: one forge can't feed every bench that needs iron.
    const [bloomA, bloomB, cuBloom, forgeA, forgeB, kiln, hammer, cast, tube, rivet, gear, rod, boiler, engine, yard, ores] = [
      "bloomery", "bloomery", "bloomery", "hand_forge", "hand_forge", "brick_kiln", "plate_hammer",
      "forming_bench", "forming_bench", "forming_bench", "forming_bench", "forming_bench",
      "boiler_bench", "engine_bench", WAREHOUSE, WAREHOUSE,
    ].map(add);
    expect(setForm(s, cast, "cylinder")).toBe(true);
    expect(setForm(s, rivet, "rivet")).toBe(true);
    expect(setForm(s, gear, "gear")).toBe(true);
    expect(setForm(s, rod, "rod")).toBe(true);
    // No filters yet, so copper ore needs a warehouse of its own.
    const main = warehouse(s).store;
    const copperStore = nodeById(s, ores)!.store;
    main.forEach((slot, i) => {
      if (slot?.id !== "Ml") return;
      addTo(copperStore, slot.id, slot.n);
      main[i] = null;
    });
    const coal = main.find((slot) => slot?.id === "Lg")!;
    coal.n -= 16;
    addTo(copperStore, "Lg", 16);

    const wires: [number, number, string][] = [
      [store, bloomA, "all"], [store, bloomB, "all"], [ores, cuBloom, "all"],
      [bloomA, yard, "byproduct"], [bloomB, yard, "byproduct"], [cuBloom, yard, "byproduct"],
      [bloomA, forgeA, "main"], [bloomB, forgeB, "main"],
      [forgeA, hammer, "main"], [forgeA, rivet, "main"], [forgeB, cast, "main"], [forgeB, gear, "main"], [forgeB, rod, "main"], [cuBloom, tube, "main"],
      [hammer, boiler, "main"], [rivet, boiler, "main"], [tube, boiler, "main"], [kiln, boiler, "main"],
      [cast, engine, "main"], [boiler, engine, "main"], [gear, engine, "main"], [rod, engine, "main"],
    ];
    for (const [from, to, material] of wires) expect(connect(s, from, to, material)).toBeTruthy();
    for (const id of [store, ores, bloomA, bloomB, cuBloom, forgeA, forgeB, kiln, hammer, cast, tube, rivet, gear, rod, boiler]) power(s, id);
    nodeById(s, kiln)!.ins.clay = { id: "Kn", n: 16 };
    nodeById(s, kiln)!.fuel = { id: "Lg", n: 8 };

    const bench = nodeById(s, engine)!;
    const manual = s.nodes.filter((n) => machineManual(n.type));
    for (let i = 0; i < 6000 && !bench.outs.steam_engine_unit; i += 1) {
      run(s, 1);
      for (const n of manual) {
        // The bellows are pumped up into the zone, as a player does several times a second, and no further.
        if (machineManual(n.type) === "bellows") {
          for (let k = 0; k < 5 && (n.blast ?? 0) < BLAST.low + 10; k += 1) press(s, n.id, 1);
          continue;
        }
        press(s, n.id, 1);
      }
    }
    expect(bench.outs.steam_engine_unit).toBeGreaterThanOrEqual(1);

    expect(s.announced).toBe("S1-1");
    expect(s.stage).toBe(2);
    expect(takeOutput(s, engine, "steam_engine_unit")).toBe(true);
    expect(s.inv.some((slot) => slot?.id === "steam_engine_unit")).toBe(true);
    console.log(`S1-1 line finished at ${Math.round(s.time / 1000)}s of game time`);
  });
});
