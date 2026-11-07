import { describe, expect, it } from "vitest";
import { LAYERS, kindOf, machineCost, MACHINE_TYPES, MAX_PORTS, inputRole, outputRole, MOTOR, POWER, SURFACE_ORES, WAREHOUSE, itemWeight, buildUses, familyMembers, indexItems, itemName, itemSource, recipesFor, usesOf, machineForms, machineManual, matches, processOf } from "../content";
import {
  GameState, NAME_MAX, SAVE_VERSION, STEAM_MAX, TANK_CAP, TAR_TANK_CAP, addTo, setOverflow, loadSave, rename, setSafeWalk, yearAt, createGroup, removeGroup, buildAllGhosts, buildGhost, copyToGhosts, installHeld, installMachine, removeGhost, foundRivers, linkRiver, powerLoad, bagHolds, expectedOutput, fillFromBag, lacksPower, riverOf, runsRecipe, createTestGame, upgradeSave, SPRING_LEAK_MS, SPRING_MAX, WIND, hasDrive, windMotor, SEASON_MS as ONE_SEASON, canAffordRoute, failWork, isRevealed, isVisible, isWeak, routeCost, takeInput, visionAt, INV_SLOTS, MAX_CARRY, MAX_VITAL, OUTPUT_CAP, WALK_MS, carried, overloaded, walkTime, clickInput, clickOutput, clickStack, nudgeFromStore, nudgeToNode, sortSlots, stowCursor, trashCursor, wheelInput, wheelStack, eat, SEASON_MS, canHarvest, routeMaterials, seasonAt, toggleRoute, nodeLabel, atBase, canAfford, cancelProject, connect, connectOptions, countOf, createGame, mine, moveToNode, nodeById,
  placeMachine, portsUsed, removeNode, setForm, siteHere, startProject, status, step, takeOutput, walkTo, workMachine, workProject,
} from "./game";
import { BASE, chunkSites, generateSites, orderSites, safePath, terrain } from "./world";

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
const arrive = (s: GameState) => {
  while (s.path.length) {
    keepAlive(s);
    step(s);
  }
};
const age = (s: GameState, seconds: number) => {
  for (let i = 0; i < seconds * 10; i += 1) step(s);
};
const warehouse = (s: GameState) => s.nodes.find((n) => n.type === WAREHOUSE)!;
/** Gives a node a fully wound motor, for tests that aren't about power. */
const power = (s: GameState, id: number) => {
  if (s.lines.some((l) => l.to === id && l.material === POWER)) return;
  const motor = placeMachine(s, MOTOR, 0, 0)!;
  motor.energy = 100000;
  connect(s, motor.id, id, POWER);
};
const carrying = (s: GameState) => s.lines.filter((l) => l.material !== POWER);
/** Routes cost parts; tests about routing itself just pay for them. */
const route = (s: GameState, from: number, to: number, material: string) => {
  s.inv[6] = { id: "iron_plate", n: 64 };
  s.inv[7] = { id: "copper_tube", n: 64 };
  power(s, from);
  return toggleRoute(s, from, to, material);
};
const press = (s: GameState, id: number, times: number) => {
  for (let i = 0; i < times; i += 1) workMachine(s, id);
};

/** Walks out, mines by hand, walks home and banks the ore. */
function gather(s: GameState, family: string, amount: number) {
  let left = amount;
  for (const site of s.sites.filter((x) => matches(x.ore, family))) {
    while (left > 0 && site.left > 0) {
      walkTo(s, site);
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

  it("puts every surface ore near the base, whatever its size", () => {
    for (let seed = 1; seed <= 300; seed += 1) {
      const sites = generateSites(seed);
      for (const ore of SURFACE_ORES) expect(sites.filter((x) => x.ore === ore).length).toBe(3);
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
      expect(total).toBeGreaterThanOrEqual(12);
      expect(total).toBeLessThanOrEqual(360);
    }
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
    const cells = s.sites.map((v) => `${v.x},${v.y}`);
    expect(new Set(cells).size).toBe(cells.length);
  });
});

describe("rules", () => {
  it("has a recipe for every S1-1 machine", () => {
    for (const type of MACHINE_TYPES.filter((t) => t !== WAREHOUSE && t !== MOTOR)) {
      expect(processOf(type, machineForms(type)[0] ?? "").recipes.length).toBeGreaterThan(0);
    }
  });

  it("limits mining to the vein", () => {
    const s = createGame(1);
    const site = s.sites[0];
    site.left = 2;
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
    expect(placeMachine(s, "smelter", 0, 0)).toBeNull();
  });

  it("keeps machines running while the player is away", () => {
    const s = createGame(1);
    const kiln = placeMachine(s, "brick_kiln", 0, 0)!;
    kiln.ins.clay = { id: "Kn", n: 8 };
    kiln.ins.coal = { id: "Lg", n: 4 };
    walkTo(s, s.sites[0]);
    run(s, 9);
    expect(kiln.outs.brick).toBe(2);
  });

  it("stops a machine when an unconnected by-product fills up", () => {
    const s = createGame(1);
    const furnace = placeMachine(s, "smelter", 0, 0)!;
    furnace.ins.iron_ore = { id: "Lm", n: 16 };
    furnace.ins.coal = { id: "Lg", n: 16 };
    furnace.outs.slag = OUTPUT_CAP;
    expect(status(furnace)).toBe("blocked");
    run(s, 12);
    expect(furnace.ins.iron_ore!.n).toBe(16);
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
    const furnace = placeMachine(s, "smelter", 0, 0)!;
    const hammer = placeMachine(s, "plate_hammer", 0, 0)!;
    expect(connectOptions(s, furnace.id, hammer.id)).toEqual(["main"]);
    expect(connectOptions(s, hammer.id, furnace.id)).toEqual([]);
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
    placeMachine(s, "smelter", 5, 5);
    run(s, 1);
    expect(JSON.parse(JSON.stringify(s))).toEqual(s);
  });
});

describe("materials", () => {
  const smelt = (ore: string) => {
    const s = createGame(1);
    const furnace = placeMachine(s, "smelter", 0, 0)!;
    furnace.ins.iron_ore = { id: ore, n: 2 };
    furnace.ins.coal = { id: "Lg", n: 1 };
    run(s, 7);
    return furnace;
  };

  it("names parts from metal and form", () => {
    expect(itemName("iron_plate")).toBe("철판");
    expect(itemName("copper_plate")).toBe("구리판");
    expect(itemName("copper_tube")).toBe("구리관");
    expect(itemName("iron_cylinder")).toBe("철 실린더");
  });

  it("lets the ore decide what the smelter makes", () => {
    expect(smelt("Lm").outs.iron).toBe(1);
    expect(smelt("Ml").outs.copper).toBe(1);
    expect(machineForms("smelter")).toEqual([]);
  });

  it("lets the metal decide the plate, with no form choice on the hammer", () => {
    const s = createGame(1);
    const hammer = placeMachine(s, "plate_hammer", 0, 0)!;
    expect(machineForms("plate_hammer")).toEqual(["plate"]);
    hammer.ins.iron = { id: "copper", n: 2 };
    press(s, hammer.id, 3);
    expect(hammer.outs.copper_plate).toBe(1);
  });

  it("gives the smelter one metal slot and two by-product slots", () => {
    expect(processOf("smelter", "").outSlots).toEqual([["iron", "copper"], ["slag"], []]);
    expect(processOf("forming_bench", "tube").outSlots).toEqual([["iron_tube", "copper_tube"]]);
  });

  it("stops when the metal slot still holds another metal", () => {
    const s = createGame(1);
    const furnace = placeMachine(s, "smelter", 0, 0)!;
    furnace.outs.iron = 3;
    furnace.ins.iron_ore = { id: "Ml", n: 2 };
    furnace.ins.coal = { id: "Lg", n: 1 };
    expect(status(furnace)).toBe("blocked");
    furnace.outs.iron = 0;
    expect(status(furnace)).toBe("run");
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
    expect(machineForms("forming_bench")).toEqual(["tube", "cylinder", "drum", "fan"]);
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
    const furnace = placeMachine(s, "smelter", 0, 0)!;
    bench.ins.iron = { id: "iron", n: 3 };
    connect(s, furnace.id, bench.id, "main");
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
    expect(machineManual("smelter")).toBeUndefined();
    expect(machineManual("brick_kiln")).toBeUndefined();
    expect(machineManual("plate_hammer")).toBe("click");
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
    const furnace = placeMachine(s, "smelter", 0, 0)!;
    expect(routeMaterials(s, warehouse(s).id, furnace.id)).toEqual(["all"]);
  });

  it("gives a machine main and by-product channels", () => {
    const s = createGame(1);
    const furnace = placeMachine(s, "smelter", 0, 0)!;
    expect(routeMaterials(s, furnace.id, warehouse(s).id)).toEqual(["main", "byproduct"]);
    const hammer = placeMachine(s, "plate_hammer", 0, 0)!;
    expect(routeMaterials(s, hammer.id, warehouse(s).id)).toEqual(["main"]);
  });

  it("fills from the first slot, then moves on to what the target still needs", () => {
    const s = createGame(1);
    const furnace = placeMachine(s, "smelter", 0, 0)!;
    const store = warehouse(s);
    store.store[0] = { id: "Lm", n: 2 };
    store.store[1] = { id: "Kn", n: 5 };
    store.store[2] = { id: "Lg", n: 1 };
    route(s, store.id, furnace.id, "all");
    run(s, 2);
    expect(furnace.ins.iron_ore).toEqual({ id: "Lm", n: 2 });
    expect(furnace.ins.coal).toEqual({ id: "Lg", n: 1 });
    expect(store.store[1]).toEqual({ id: "Kn", n: 5 });
  });

  it("runs a furnace from one warehouse on a single line", () => {
    const s = createGame(1);
    const furnace = placeMachine(s, "smelter", 0, 0)!;
    const store = warehouse(s);
    store.store[0] = { id: "Lm", n: 20 };
    store.store[1] = { id: "Lg", n: 10 };
    route(s, store.id, furnace.id, "all");
    run(s, 40);
    expect(furnace.outs.iron).toBeGreaterThan(3);
  });

  it("has no filter: two ores in one warehouse both go in", () => {
    const s = createGame(1);
    const furnace = placeMachine(s, "smelter", 0, 0)!;
    const store = warehouse(s);
    store.store[0] = { id: "Ml", n: 1 };
    store.store[1] = { id: "Lm", n: 1 };
    route(s, store.id, furnace.id, "all");
    run(s, 1);
    expect(furnace.ins.iron_ore).toEqual({ id: "Ml", n: 1 });
  });

  it("keeps by-products off the main channel", () => {
    const s = createGame(1);
    const furnace = placeMachine(s, "smelter", 0, 0)!;
    furnace.outs.iron = 1;
    furnace.outs.slag = 1;
    route(s, furnace.id, warehouse(s).id, "main");
    run(s, 2);
    expect(furnace.outs.slag).toBe(1);
    expect(furnace.outs.iron).toBe(0);
  });

  it("switches a channel back off", () => {
    const s = createGame(1);
    const furnace = placeMachine(s, "smelter", 0, 0)!;
    route(s, warehouse(s).id, furnace.id, "all");
    route(s, warehouse(s).id, furnace.id, "all");
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
  const withIron = (n: number) => {
    const s = createGame(1);
    s.inv[0] = { id: "iron", n };
    return s;
  };
  const buildWarehouse = (s: GameState) => {
    expect(startProject(s, WAREHOUSE)).toBe(true);
    for (let i = 0; i < 25; i += 1) workProject(s);
    return installMachine(s, WAREHOUSE, 0, 0)!;
  };

  it("costs metal to build", () => {
    expect(startProject(withIron(9), WAREHOUSE)).toBe(false);
    const s = withIron(10);
    buildWarehouse(s);
    expect(s.inv[0]).toBeNull();
  });

  it("counts and spends what every warehouse holds", () => {
    const s = withIron(10);
    const extra = buildWarehouse(s);
    extra.store[0] = { id: "Kn", n: 6 };
    warehouse(s).store[0] = { id: "Kn", n: 4 };
    expect(countOf(s, "clay")).toBe(10);
    expect(startProject(s, "brick_kiln")).toBe(true);
    expect(countOf(s, "clay")).toBe(0);
  });

  it("overflows into the next warehouse", () => {
    const s = withIron(10);
    const extra = buildWarehouse(s);
    warehouse(s).store.fill({ id: "Lm", n: 64 });
    const kiln = placeMachine(s, "brick_kiln", 0, 0)!;
    kiln.ins.clay = { id: "Kn", n: 5 };
    removeNode(s, kiln.id);
    expect(extra.store.some((slot) => slot?.id === "Kn")).toBe(true);
  });

  it("keeps the first warehouse and needs a built one emptied before demolition", () => {
    const s = withIron(10);
    const extra = buildWarehouse(s);
    expect(removeNode(s, warehouse(s).id)).toBe(false);
    extra.store[0] = { id: "Kn", n: 1 };
    expect(removeNode(s, extra.id)).toBe(false);
    extra.store[0] = null;
    expect(removeNode(s, extra.id)).toBe(true);
    expect(countOf(s, WAREHOUSE)).toBe(1);
  });

  it("moves goods between lines into a built warehouse", () => {
    const s = withIron(10);
    const extra = buildWarehouse(s);
    const yard = placeMachine(s, "smelter", 0, 0)!;
    yard.outs.iron = 2;
    connect(s, yard.id, extra.id, "main");
    power(s, yard.id);
    run(s, 2);
    expect(extra.store[0]).toEqual({ id: "iron", n: 2 });
  });
});

describe("slot roles", () => {
  it("names slots by what they are for, not by the material", () => {
    expect(processOf("brick_kiln", "").slots.map((slot) => inputRole(slot.key))).toEqual(["재료", "연료"]);
    expect(processOf("smelter", "").slots.map((slot) => inputRole(slot.key))).toEqual(["재료", "연료"]);
    expect([0, 1, 2].map(outputRole)).toEqual(["결과", "부산물", "부산물"]);
  });
});

describe("item index", () => {
  const ids = (list: { id: string }[]) => list.map((r) => r.id);

  it("lists current items and hides later tiers", () => {
    const items = indexItems();
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
    expect(ids(recipesFor("iron"))).toEqual(["iron_bloom"]);
    expect(ids(recipesFor("copper_tube"))).toEqual(["tube_copper"]);
  });

  it("shows what an item is used for, through its ore family too", () => {
    expect(ids(usesOf("iron"))).toEqual(expect.arrayContaining(["plate_iron", "tube_iron", "cylinder_iron"]));
    expect(ids(usesOf("Lg"))).toEqual(expect.arrayContaining(["brick", "iron_bloom", "cook_berry"]));
    expect(usesOf("slag")).toEqual([]);
  });

  it("shows which buildings need an item", () => {
    expect(buildUses("iron").map(([type]) => type)).toContain("warehouse");
    expect(buildUses("Kn").map(([type]) => type)).toContain("brick_kiln");
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
    const furnace = placeMachine(s, "smelter", 0, 0)!;
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
    const furnace = placeMachine(s, "smelter", 0, 0)!;
    clickStack(s, s.inv, 0, "left");
    clickInput(s, furnace.id, "iron_ore", "left");
    expect(furnace.ins.iron_ore).toBeNull();
    expect(s.cursor).toEqual({ id: "Kn", n: 4 });
  });

  it("takes machine output onto the cursor", () => {
    const s = createGame(1);
    const furnace = placeMachine(s, "smelter", 0, 0)!;
    furnace.outs.iron = 5;
    clickOutput(s, furnace.id, "iron", "right");
    expect(s.cursor).toEqual({ id: "iron", n: 3 });
    expect(furnace.outs.iron).toBe(2);
  });

  it("nudges single items with empty hands", () => {
    const s = bag(["Lm", 2]);
    const furnace = placeMachine(s, "smelter", 0, 0)!;
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
    const order = ["Lm", "Ml", "Lg", "Kn", "Be", "iron", "copper", "iron_plate", "copper_plate", "iron_tube", "copper_tube", "brick", "boiler", "steam_engine_unit"];
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
    const s = createGame(1);
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
    expect(walkTime(s)).toBe(WALK_MS * 2);
  });

  it("stops mining at the limit", () => {
    const s = createGame(1);
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
    s.inv[0] = { id: "boiler", n: 3 };
    expect(overloaded(s)).toBe(true);
    expect(walkTo(s, { x: 5, y: 0 })).toBe(false);
    expect(s.path).toEqual([]);
    expect(s.inv[0]!.n).toBe(3);
  });
});

describe("spring power", () => {
  const setup = () => {
    const s = createGame(1);
    const furnace = placeMachine(s, "smelter", 0, 0)!;
    const store = warehouse(s);
    store.store[0] = { id: "Lg", n: 10 };
    connect(s, store.id, furnace.id, "all");
    return { s, furnace, store };
  };

  it("moves nothing along a line without power", () => {
    const { s, furnace } = setup();
    run(s, 5);
    expect(furnace.ins.coal).toBeNull();
  });

  it("needs a wound motor, not just a connected one", () => {
    const { s, furnace, store } = setup();
    const motor = placeMachine(s, MOTOR, 0, 0)!;
    expect(connect(s, motor.id, store.id, POWER)).toBeTruthy();
    expect(hasDrive(s, store.id)).toBe(false);
    run(s, 5);
    expect(furnace.ins.coal).toBeNull();
  });

  it("spends one unit of force per item and stops when it runs out", () => {
    const { s, furnace, store } = setup();
    const motor = placeMachine(s, MOTOR, 0, 0)!;
    connect(s, motor.id, store.id, POWER);
    motor.energy = 1;
    run(s, 5);
    expect(furnace.ins.coal).toEqual({ id: "Lg", n: 1 });
    expect(motor.energy).toBe(0);
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

  it("has an output limit like an engine, however wound it is", () => {
    const s = createGame(1);
    s.stage = 1;
    const motor = placeMachine(s, MOTOR, 0, 0)!;
    motor.energy = SPRING_MAX;
    const hammers = [1, 2].map(() => placeMachine(s, "steam_hammer", 0, 0)!);
    for (const hammer of hammers) {
      connect(s, motor.id, hammer.id, POWER);
      hammer.ins.iron = { id: "iron", n: 12 };
    }
    run(s, 1);
    expect(hammers[0].speed).toBeCloseTo(5 / 6);
    expect(hammers[1].speed).toBeCloseTo(5 / 6);
    expect(powerLoad(s, motor)).toEqual({ now: 5, connected: 6, limit: 5 });
  });

  it("gives its lines first, leaving less for machines", () => {
    const { s, furnace, store } = setup();
    s.stage = 1;
    const motor = placeMachine(s, MOTOR, 0, 0)!;
    motor.energy = SPRING_MAX;
    const hammers = [1, 2].map(() => placeMachine(s, "steam_hammer", 0, 0)!);
    connect(s, motor.id, store.id, POWER);
    for (const hammer of hammers) {
      connect(s, motor.id, hammer.id, POWER);
      hammer.ins.iron = { id: "iron", n: 12 };
    }
    run(s, 0.3);
    expect(hammers[0].speed).toBeCloseTo(5 / 6);
    run(s, 0.4);
    expect(s.lines.some((l) => l.active)).toBe(true);
    expect(furnace.ins.coal).toBeTruthy();
    expect(hammers[0].speed).toBeCloseTo(3 / 6);
  });

  it("winds by hand up to a limit", () => {
    const s = createGame(1);
    const motor = placeMachine(s, MOTOR, 0, 0)!;
    expect(windMotor(s, motor.id)).toBe(true);
    expect(motor.energy).toBe(WIND);
    motor.energy = SPRING_MAX;
    expect(windMotor(s, motor.id)).toBe(false);
  });

  it("uses a port for the power line", () => {
    const { s, store } = setup();
    const motor = placeMachine(s, MOTOR, 0, 0)!;
    connect(s, motor.id, store.id, POWER);
    expect(portsUsed(s, store.id)).toBe(2);
  });

  it("only sends power, and only from a motor", () => {
    const { s, store, furnace } = setup();
    const motor = placeMachine(s, MOTOR, 0, 0)!;
    expect(routeMaterials(s, motor.id, furnace.id)).toEqual([POWER]);
    expect(routeMaterials(s, store.id, motor.id)).toEqual([]);
  });

  it("keeps its power line when a machine changes form", () => {
    const s = createGame(1);
    const bench = placeMachine(s, "forming_bench", 0, 0)!;
    power(s, bench.id);
    setForm(s, bench.id, "cylinder");
    expect(s.lines.some((l) => l.to === bench.id && l.material === POWER)).toBe(true);
  });
});

describe("test preset", () => {
  it("starts with a motor driving a smelter that actually runs", () => {
    const s = createTestGame(1);
    const smelter = s.nodes.find((n) => n.type === "smelter")!;
    const motor = s.nodes.find((n) => n.type === MOTOR)!;
    expect(motor.energy).toBe(SPRING_MAX);
    run(s, 12);
    expect(warehouse(s).store.some((slot) => slot?.id === "iron")).toBe(true);
    expect(motor.energy).toBeLessThan(SPRING_MAX);
    expect(smelter.progress + (warehouse(s).store.find((x) => x?.id === "slag")?.n ?? 0)).toBeGreaterThan(0);
  });
});

describe("costly routes", () => {
  it("needs parts to connect anything", () => {
    const s = createGame(1);
    const furnace = placeMachine(s, "smelter", 0, 0)!;
    expect(canAffordRoute(s, warehouse(s).id, furnace.id)).toBe(false);
    expect(toggleRoute(s, warehouse(s).id, furnace.id, "all")).toBe(false);
    expect(s.lines).toEqual([]);
  });

  it("charges the same parts for each line", () => {
    const s = createGame(1);
    const furnace = placeMachine(s, "smelter", 0, 0)!;
    const store = warehouse(s).id;
    expect(routeCost(s, store, furnace.id)).toEqual({ iron_plate: 1, copper_tube: 1 });
    s.inv[0] = { id: "iron_plate", n: 1 };
    s.inv[1] = { id: "copper_tube", n: 1 };
    expect(toggleRoute(s, store, furnace.id, "all")).toBe(true);
    expect(s.inv[0]).toBeNull();
    expect(s.inv[1]).toBeNull();
  });

  it("gives the parts back when a route or machine goes", () => {
    const s = createGame(1);
    const furnace = placeMachine(s, "smelter", 0, 0)!;
    s.inv[0] = { id: "iron_plate", n: 1 };
    s.inv[1] = { id: "copper_tube", n: 1 };
    toggleRoute(s, warehouse(s).id, furnace.id, "all");
    toggleRoute(s, warehouse(s).id, furnace.id, "all");
    expect(countOf(s, "iron_plate")).toBe(1);
    toggleRoute(s, warehouse(s).id, furnace.id, "all");
    removeNode(s, furnace.id);
    expect(countOf(s, "copper_tube")).toBe(1);
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
    expect(visionAt(s, peak)).toBe(visionAt(s, { x: 1000, y: 1000 }) + 6);
  });

});

describe("scale", () => {
  it("keeps a large factory well inside the step budget", () => {
    const s = createGame(1);
    const nodes = Array.from({ length: 400 }, () => placeMachine(s, "plate_hammer", 0, 0)!);
    const furnaces = Array.from({ length: 200 }, () => {
      const f = placeMachine(s, "smelter", 0, 0)!;
      f.ins.iron_ore = { id: "Lm", n: 16 };
      f.ins.coal = { id: "Lg", n: 16 };
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

  it("hurts on hills and water, and is safe on open ground", () => {
    const s = createGame(1);
    const find = (cls: string) => {
      for (let x = 1; x < 400; x += 1) {
        for (let y = -40; y < 40; y += 1) {
          if (terrain(x, y, s.seed)[1] === cls && !s.sites.some((v) => v.x === x && v.y === y)) return { x, y };
        }
      }
      throw new Error("no " + cls);
    };
    for (const [cls, damage] of [["t-hill", 2], ["t-water", 3]] as const) {
      const target = find(cls);
      s.player = { x: target.x, y: target.y - 1 };
      s.hp = MAX_VITAL;
      s.path = [target];
      s.walkTimer = 0;
      while (s.path.length) step(s);
      const height = terrain(target.x, target.y, s.seed)[2];
      expect(s.hp).toBe(MAX_VITAL - (cls === "t-hill" ? 1 + height : damage));
    }
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
    kiln.ins.coal = { id: "Lg", n: 1 };
    run(s, 6);
    expect(kiln.outs.Mc).toBe(1);
  });

  it("still fires bricks after food shares the kiln", () => {
    const s = createGame(1);
    const kiln = placeMachine(s, "brick_kiln", 0, 0)!;
    kiln.ins.clay = { id: "Kn", n: 2 };
    kiln.ins.coal = { id: "Lg", n: 1 };
    run(s, 9);
    expect(kiln.outs.brick).toBe(2);
  });

  it("turns a saved stove into a brick kiln and keeps its contents", () => {
    const s = createGame(1);
    const kiln = placeMachine(s, "brick_kiln", 0, 0)!;
    Object.assign(kiln, { type: "stove", ins: { Be: { id: "Mu", n: 3 }, coal: { id: "Lg", n: 2 } }, outs: { Bc: 0, Mc: 1 } });
    s.project = { type: "stove", done: 2, paid: [] };
    upgradeSave(s);
    expect(kiln.type).toBe("brick_kiln");
    expect(kiln.ins).toEqual({ clay: { id: "Mu", n: 3 }, coal: { id: "Lg", n: 2 } });
    expect(kiln.outs).toEqual({ brick: 0, Bc: 0, Mc: 1 });
    expect(s.project.type).toBe("brick_kiln");
    run(s, 6);
    expect(kiln.outs.Mc).toBe(2);
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

  it("refuses to start without the materials", () => {
    const s = withClay(9);
    expect(canAfford(s, "brick_kiln")).toBe(false);
    expect(startProject(s, "brick_kiln")).toBe(false);
    expect(s.inv[0]).toEqual({ id: "Kn", n: 9 });
  });

  it("pays on start and gives a machine item when the work is done", () => {
    const s = withClay(12);
    expect(startProject(s, "brick_kiln")).toBe(true);
    expect(s.inv[0]).toEqual({ id: "Kn", n: 2 });
    for (let i = 0; i < 19; i += 1) workProject(s);
    expect(countOf(s, "brick_kiln")).toBe(0);
    workProject(s);
    expect(countOf(s, "brick_kiln")).toBe(1);
    expect(s.nodes.some((n) => n.type === "brick_kiln")).toBe(false);
    expect(s.project).toBeNull();
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
    const s = withClay(10);
    startProject(s, "brick_kiln");
    for (let i = 0; i < 20; i += 1) workProject(s);
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

  it("runs one project at a time", () => {
    const s = withClay(30);
    expect(startProject(s, "brick_kiln")).toBe(true);
    expect(startProject(s, "brick_kiln")).toBe(false);
  });

  it("needs the player at the base to work", () => {
    const s = withClay(10);
    startProject(s, "brick_kiln");
    walkTo(s, s.sites[0]);
    arrive(s);
    expect(workProject(s)).toBe(false);
  });

  it("refunds a cancelled project, and a removed machine comes back as an item", () => {
    const s = withClay(10);
    startProject(s, "brick_kiln");
    cancelProject(s);
    expect(countOf(s, "clay")).toBe(10);
    startProject(s, "brick_kiln");
    for (let i = 0; i < 20; i += 1) workProject(s);
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

  it("spends from the warehouse too", () => {
    const s = withClay(4);
    warehouse(s).store[0] = { id: "Kn", n: 6 };
    expect(startProject(s, "brick_kiln")).toBe(true);
    expect(countOf(s, "clay")).toBe(0);
  });
});

describe("steam power", () => {
  const steamStage = () => {
    const s = createTestGame(1);
    s.nodes = s.nodes.slice(0, 1);
    s.lines = [];
    return s;
  };
  /** A running engine with plenty of fuel, as though the pump were already feeding it. */
  const engineAt = (s: GameState) => {
    const engine = placeMachine(s, "steam_engine", 0, 0)!;
    engine.ins.coal = { id: "Lg", n: 16 };
    engine.ins.water = { id: "water", n: 16 };
    return engine;
  };
  const stock = (node: { ins: Record<string, { id: string; n: number } | null> }) => {
    node.ins.coal!.n = 16;
    node.ins.water!.n = 16;
  };

  it("opens new machines only at the steam stage", () => {
    const s = createGame(1);
    expect(placeMachine(s, "steam_hammer", 0, 0)).toBeNull();
    s.stage = 1;
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

  it("uses little fuel when nothing draws on it", () => {
    const s = steamStage();
    const engine = engineAt(s);
    run(s, 60);
    expect(engine.ins.coal!.n).toBeGreaterThanOrEqual(14);
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

  it("slows every machine together past the engine's limit", () => {
    const s = steamStage();
    const engine = engineAt(s);
    const hammers = [1, 2, 3, 4].map(() => placeMachine(s, "steam_hammer", 0, 0)!);
    for (const hammer of hammers) {
      connect(s, engine.id, hammer.id, POWER);
      hammer.ins.iron = { id: "iron", n: 12 };
    }
    for (let i = 0; i < 12; i += 1) {
      stock(engine);
      for (const hammer of hammers) {
        hammer.ins.iron = { id: "iron", n: 12 };
        hammer.outs.iron_plate = 0;
      }
      run(s, 1);
    }
    const speeds = hammers.map((h) => h.speed!);
    expect(speeds[0]).toBeGreaterThan(0.6);
    expect(speeds[0]).toBeLessThan(1);
    expect(new Set(speeds).size).toBe(1);
  });

  it("works a bench by itself once powered, and by hand without", () => {
    const s = steamStage();
    const hammer = placeMachine(s, "plate_hammer", 0, 0)!;
    hammer.ins.iron = { id: "iron", n: 4 };
    run(s, 1);
    expect(status(hammer)).toBe("manual");
    const engine = engineAt(s);
    connect(s, engine.id, hammer.id, POWER);
    run(s, 1);
    expect(status(hammer)).toBe("run");
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

  it("carries items along lines on steam", () => {
    const s = steamStage();
    const engine = engineAt(s);
    const store = s.nodes[0];
    const kiln = placeMachine(s, "brick_kiln", 0, 0)!;
    store.store = store.store.map(() => null);
    store.store[0] = { id: "Lg", n: 4 };
    connect(s, engine.id, store.id, POWER);
    connect(s, store.id, kiln.id, "all");
    run(s, 3);
    expect(kiln.ins.coal?.n).toBeGreaterThan(0);
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

  it("stops pumping when dry", () => {
    const { s, motor, pump, river } = atRiver();
    connect(s, motor.id, pump.id, POWER);
    river.left = 0;
    pump.outs.water = 0;
    run(s, 1);
    expect(pump.speed).toBe(0);
  });

  it("feeds an engine that then keeps its own pump running", () => {
    const { s, motor, pump } = atRiver();
    const engine = placeMachine(s, "steam_engine", 0, 0)!;
    engine.ins.coal = { id: "Lg", n: 16 };
    connect(s, motor.id, pump.id, POWER);
    expect(connect(s, pump.id, engine.id, "main")).toBeTruthy();
    run(s, 12);
    expect(engine.energy).toBeGreaterThan(0);
    s.lines = s.lines.filter((l) => l.from !== motor.id);
    connect(s, engine.id, pump.id, POWER);
    motor.energy = 0;
    engine.ins.coal = { id: "Lg", n: 16 };
    engine.ins.water = null;
    run(s, 15);
    expect(engine.energy).toBeGreaterThan(0);
    expect(nodeById(s, engine.id)!.ins.water?.n).toBeGreaterThan(0);
  });
});

describe("filling a machine from the index", () => {
  const kilnRecipe = () => recipesFor("brick")[0];
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
    expect(kiln.ins.coal).toEqual({ id: "Lg", n: 1 });
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
    const tube = recipesFor("iron_tube")[0];
    const cylinder = recipesFor("iron_cylinder")[0];
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
    const engine = placeMachine(s, "steam_engine", 0, 0)!;
    pump.outs.water = 150;
    return { s, pump, engine };
  };

  it("sorts items into kinds", () => {
    expect(kindOf("water")).toBe("liquid");
    expect(kindOf("steam")).toBe("gas");
    expect(kindOf("iron")).toBe("item");
  });

  it("can't be picked up by hand from an output or a tank", () => {
    const { s, pump, engine } = pumped();
    clickOutput(s, pump.id, "water", "left");
    expect(s.cursor).toBeNull();
    expect(takeOutput(s, pump.id, "water")).toBe(false);
    engine.ins.water = { id: "water", n: 20 };
    clickInput(s, engine.id, "water", "left");
    expect(s.cursor).toBeNull();
    expect(takeInput(s, engine.id, "water")).toBe(false);
    expect(wheelInput(s, engine.id, "water", "out")).toBe(false);
    expect(engine.ins.water!.n).toBe(20);
  });

  it("fills an empty drum with exactly 100 litres", () => {
    const { s, pump } = pumped();
    s.cursor = { id: "iron_drum", n: 2 };
    clickOutput(s, pump.id, "water", "left");
    expect(pump.outs.water).toBe(50);
    expect(s.cursor).toEqual({ id: "iron_drum", n: 1 });
    expect(s.inv.some((slot) => slot?.id === "water_drum")).toBe(true);
    clickOutput(s, pump.id, "water", "left");
    expect(pump.outs.water).toBe(50);
  });

  it("pours a drum into a tank and gives the empty drum back", () => {
    const { s, engine } = pumped();
    s.cursor = { id: "water_drum", n: 1 };
    clickInput(s, engine.id, "water", "left");
    expect(engine.ins.water).toEqual({ id: "water", n: 100 });
    expect(s.cursor).toEqual({ id: "iron_drum", n: 1 });
  });

  it("won't pour without room for the whole drum", () => {
    const { s, engine } = pumped();
    engine.ins.water = { id: "water", n: TANK_CAP - 50 };
    s.cursor = { id: "water_drum", n: 1 };
    clickInput(s, engine.id, "water", "left");
    expect(engine.ins.water!.n).toBe(TANK_CAP - 50);
    expect(s.cursor).toEqual({ id: "water_drum", n: 1 });
  });

  it("flows along a line to a machine but never into a warehouse", () => {
    const { s, pump, engine } = pumped();
    expect(routeMaterials(s, pump.id, s.nodes[0].id)).toEqual([]);
    expect(routeMaterials(s, pump.id, engine.id)).toEqual(["main"]);
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
    kiln.ins.coal = { id: "Lg", n: 1 };
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
    const kiln = placeMachine(s, "brick_kiln", 100, 10)!;
    connect(s, motor.id, kiln.id, POWER);
    addTo(s.nodes[0].store, "iron_plate", 8);
    addTo(s.nodes[0].store, "copper_tube", 8);
    return { s, motor, kiln };
  };

  it("copies nodes and their lines as ghosts that do nothing", () => {
    const { s, motor, kiln } = line();
    const copies = copyToGhosts(s, [motor.id, kiln.id], 50, 60);
    expect(copies.map((g) => [g.type, g.x, g.y])).toEqual([[MOTOR, 60, 70], ["brick_kiln", 150, 70]]);
    expect(s.ghostLines).toEqual([{ from: copies[0].id, to: copies[1].id, material: POWER }]);
    expect(s.nodes).toHaveLength(3);
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
    s.inv[0] = { id: "brick_kiln", n: 1 };
    expect(buildGhost(s, ghost.id)?.type).toBe("brick_kiln");
    expect(s.ghosts).toHaveLength(0);
    expect(s.inv[0]).toBeNull();
  });

  it("makes the planned lines real once both ends exist, paying for them", () => {
    const { s, motor, kiln } = line();
    const copies = copyToGhosts(s, [motor.id, kiln.id], 0, 200);
    s.inv[0] = { id: MOTOR, n: 1 };
    s.inv[1] = { id: "brick_kiln", n: 1 };
    const plates = countOf(s, "iron_plate");
    const a = buildGhost(s, copies[0].id)!;
    expect(s.ghostLines).toHaveLength(1);
    const b = buildGhost(s, copies[1].id)!;
    expect(s.ghostLines).toHaveLength(0);
    expect(s.lines.some((l) => l.from === a.id && l.to === b.id && l.material === POWER)).toBe(true);
    expect(countOf(s, "iron_plate")).toBe(plates - 1);
  });

  it("keeps a planned line waiting when the parts run out", () => {
    const { s, motor, kiln } = line();
    const copies = copyToGhosts(s, [motor.id, kiln.id], 0, 200);
    s.nodes[0].store = s.nodes[0].store.map(() => null);
    s.inv[0] = { id: MOTOR, n: 1 };
    s.inv[1] = { id: "brick_kiln", n: 1 };
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
    s.inv[0] = { id: "brick_kiln", n: 1 };
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
    const [bank] = foundRivers(s);
    linkRiver(s, pump.id, bank.id);
    const [ghost] = copyToGhosts(s, [pump.id], 0, 0);
    s.inv[0] = { id: "drainage_pump", n: 1 };
    expect(buildGhost(s, ghost.id)?.siteId).toBe(bank.id);
  });
});

describe("vein grades", () => {
  const veins = () => [...Array(3000).keys()].flatMap((seed) => generateSites(seed + 1).filter((v) => v.rich));

  it("leaves the first vein near the base to luck", () => {
    const first = [...Array(60).keys()].map((seed) => generateSites(seed + 1)[0].rich);
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
    expect(Math.max(...sizes("scarce"))).toBeLessThanOrEqual(36);
    expect(Math.min(...sizes("normal"))).toBeGreaterThanOrEqual(40);
    expect(Math.max(...sizes("normal"))).toBeLessThanOrEqual(120);
    expect(Math.min(...sizes("rich"))).toBeGreaterThanOrEqual(120);
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
    const s = createGame(1);
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
      if (hazards(s) >= 1) return { s, target };
    }
    throw new Error("no hilly start");
  };

  it("goes around known hazards, and ignores them when told to", () => {
    const { s, target } = hilly();
    const straight = hazards(s);
    setSafeWalk(s, true);
    walkTo(s, target);
    expect(hazards(s)).toBeLessThan(straight);
    expect(s.path.at(-1)).toEqual(target);
    setSafeWalk(s, false);
    walkTo(s, target);
    expect(hazards(s)).toBe(straight);
  });

  it("re-routes a walk already under way when the mode changes", () => {
    const { s, target } = hilly();
    setSafeWalk(s, true);
    expect(s.path.at(-1)).toEqual(target);
    expect(hazards(s)).toBe(0);
  });

  it("still crosses a river when there is no way around", () => {
    const s = createTestGame(1);
    const bank = s.sites.find((v) => v.ore === "water")!;
    const far = { x: bank.x + (bank.x > 0 ? 6 : -6), y: 0 };
    walkTo(s, far);
    expect(s.path.at(-1)).toEqual(far);
  });

  it("walks only one cell at a time along a safe route", () => {
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

describe("old saves", () => {
  const old = () => {
    const s = createGame(1) as unknown as Record<string, unknown> & GameState;
    placeMachine(s, "brick_kiln", 0, 0);
    return JSON.parse(JSON.stringify(s));
  };

  it("loads an older version and fills in what it lacks", () => {
    const save = old();
    save.version = 5;
    delete save.ghosts;
    delete save.groups;
    delete save.stage;
    delete save.made;
    delete save.safeWalk;
    delete save.nodes[1].fails;
    delete save.nodes[1].energy;
    const s = loadSave(save)!;
    expect(s.version).toBe(SAVE_VERSION);
    expect(s.ghosts).toEqual([]);
    expect(s.stage).toBe(0);
    expect(s.safeWalk).toBe(true);
    expect(s.nodes[1].energy).toBe(0);
    run(s, 2);
  });

  it("keeps a finished stage from before stages existed", () => {
    const save = old();
    save.version = 8;
    save.won = true;
    save.delivered = 1;
    delete save.stage;
    delete save.made;
    const s = loadSave(save)!;
    expect(s.stage).toBe(1);
    expect(s.made.steam_engine_unit).toBe(1);
  });

  it("keeps what the player had", () => {
    const save = old();
    save.version = 9;
    save.inv[0] = { id: "Lm", n: 7 };
    save.nodes[0].store[2] = { id: "iron", n: 3 };
    const s = loadSave(save)!;
    expect(s.inv[0]).toEqual({ id: "Lm", n: 7 });
    expect(s.nodes[0].store[2]).toEqual({ id: "iron", n: 3 });
    expect(s.seed).toBe(1);
  });

  it("moves anything past the smaller bag into the warehouse", () => {
    const save = old();
    save.version = 3;
    save.inv = [...save.inv, { id: "Kn", n: 5 }, null];
    const s = loadSave(save)!;
    expect(s.inv).toHaveLength(INV_SLOTS);
    expect(countOf(s, "clay")).toBe(5);
  });

  it("drops machines that no longer exist, with their lines", () => {
    const save = old();
    save.version = 2;
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

  it("adds limestone veins when the stage opens", () => {
    const s = createGame(1);
    expect(s.sites.some((v) => v.ore === "Ls")).toBe(false);
    s.stage = 1;
    s.made.iron_plate = 119;
    const hammer = (() => {
      s.stage = 0;
      const h = placeMachine(s, "plate_hammer", 0, 0)!;
      s.stage = 1;
      return h;
    })();
    hammer.ins.iron = { id: "iron", n: 2 };
    power(s, hammer.id);
    run(s, 6);
    expect(s.stage).toBe(2);
    expect(s.sites.filter((v) => v.ore === "Ls").length).toBeGreaterThan(0);
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

  const tarLine = () => {
    const { s, motor } = stage3();
    const oven = placeMachine(s, "coke_oven", 0, 0)!;
    const tank = placeMachine(s, "tar_tank", 0, 0)!;
    connect(s, motor.id, oven.id, POWER);
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
    connect(s, motor.id, furnace.id, POWER);
    run(s, 7);
    expect(furnace.outs.iron).toBe(4);
    expect(furnace.outs.slag).toBe(2);
  });

  it("finishes the stage with 100 steel, which stays with the player", () => {
    const { s } = stage3();
    const engine = placeMachine(s, "steam_engine", 0, 0)!;
    engine.ins.coal = { id: "Lg", n: 16 };
    engine.ins.water = { id: "water", n: 40 };
    const converter = placeMachine(s, "converter", 0, 0)!;
    connect(s, engine.id, converter.id, POWER);
    converter.ins.iron = { id: "iron", n: 4 };
    s.made.steel = 98;
    run(s, 12);
    expect(s.announced).toBe("S1-3");
    expect(converter.outs.steel).toBe(3);
  });

  it("carries power through a manifold, and counts it in the load", () => {
    const { s } = stage3();
    const engine = placeMachine(s, "steam_engine", 0, 0)!;
    engine.ins.coal = { id: "Lg", n: 16 };
    engine.ins.water = { id: "water", n: 40 };
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
    connect(s, motor.id, store.id, POWER);
    expect(connect(s, store.id, splitter.id, "all")).toBeTruthy();
    connect(s, splitter.id, a.id, "all");
    connect(s, splitter.id, b.id, "all");
    run(s, 6);
    expect(a.ins.coal?.n).toBe(2);
    expect(b.ins.coal?.n).toBe(2);
  });

  it("passes items on without power of its own, and uses none", () => {
    const { s, motor } = stage3();
    const splitter = placeMachine(s, "item_splitter", 0, 0)!;
    const kiln = placeMachine(s, "brick_kiln", 0, 0)!;
    splitter.store[0] = { id: "Lg", n: 2 };
    connect(s, splitter.id, kiln.id, "all");
    motor.energy = 0;
    run(s, 2);
    expect(kiln.ins.coal?.n).toBe(2);
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
    const furnace = placeMachine(s, "smelter", 0, 0)!;
    expect(expectedOutput(furnace)).toEqual([]);
    furnace.ins.iron_ore = { id: "Lm", n: 1 };
    furnace.ins.coal = { id: "Lg", n: 1 };
    expect(expectedOutput(furnace)).toEqual([]);
    furnace.ins.iron_ore = { id: "Lm", n: 2 };
    expect(expectedOutput(furnace)).toEqual(["iron", "slag"]);
  });

  it("follows what the input decides", () => {
    const s = createGame(1);
    const furnace = placeMachine(s, "smelter", 0, 0)!;
    furnace.ins.iron_ore = { id: "Ml", n: 2 };
    furnace.ins.coal = { id: "Lg", n: 1 };
    expect(expectedOutput(furnace)).toEqual(["copper", "slag"]);
  });

  it("stays quiet while the output is blocked", () => {
    const s = createGame(1);
    const furnace = placeMachine(s, "smelter", 0, 0)!;
    furnace.ins.iron_ore = { id: "Lm", n: 2 };
    furnace.ins.coal = { id: "Lg", n: 1 };
    furnace.outs.copper = 1;
    expect(expectedOutput(furnace)).toEqual([]);
  });
});

describe("stage goals", () => {
  it("counts what is made and leaves it in place", () => {
    const s = createGame(1);
    const hammer = placeMachine(s, "plate_hammer", 0, 0)!;
    s.stage = 1;
    s.made.iron_plate = 119;
    hammer.ins.iron = { id: "iron", n: 4 };
    power(s, hammer.id);
    run(s, 10);
    expect(s.announced).toBe("S1-2");
    expect(hammer.outs.iron_plate).toBeGreaterThan(0);
  });

  it("carries an old save over without losing progress", () => {
    const s = createGame(1) as GameState & { delivered?: number; won?: boolean };
    Object.assign(s, { stage: undefined, made: undefined, announced: undefined, delivered: 1, won: true });
    upgradeSave(s);
    expect(s.stage).toBe(1);
    expect(s.made.steam_engine_unit).toBe(1);
    expect(s.sites.some((site) => site.ore === "water")).toBe(true);
  });
});

describe("S1-1 playthrough", () => {
  it("builds a steam engine from nothing but clicks and lines", () => {
    const s = createGame(2026);
    gather(s, "iron_ore", 100);
    gather(s, "coal", 80);
    gather(s, "clay", 16);
    gather(s, "copper_ore", 16);

    const add = (type: string) => placeMachine(s, type, 0, 0)!.id;
    const store = warehouse(s).id;
    const [bloom, smelter, kiln, hammer, cast, tube, boiler, engine, yard, ores] = [
      "smelter", "smelter", "brick_kiln", "plate_hammer", "forming_bench", "forming_bench", "boiler_bench", "engine_bench", WAREHOUSE, WAREHOUSE,
    ].map(add);
    expect(setForm(s, cast, "cylinder")).toBe(true);
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
      [store, bloom, "all"], [ores, smelter, "all"],
      [bloom, yard, "byproduct"], [smelter, yard, "byproduct"], [bloom, hammer, "main"], [bloom, cast, "main"], [smelter, tube, "main"],
      [hammer, boiler, "main"], [hammer, engine, "main"], [tube, boiler, "main"], [tube, engine, "main"],
      [kiln, boiler, "main"], [cast, engine, "main"], [boiler, engine, "main"],
    ];
    for (const [from, to, material] of wires) expect(connect(s, from, to, material)).toBeTruthy();
    for (const id of [store, ores, bloom, smelter, kiln, hammer, cast, tube, boiler]) power(s, id);
    nodeById(s, kiln)!.ins.clay = { id: "Kn", n: 16 };
    nodeById(s, kiln)!.ins.coal = { id: "Lg", n: 8 };

    const bench = nodeById(s, engine)!;
    const manual = s.nodes.filter((n) => machineManual(n.type));
    for (let i = 0; i < 6000 && !bench.outs.steam_engine_unit; i += 1) {
      run(s, 1);
      manual.forEach((n) => press(s, n.id, 1));
    }
    expect(bench.outs.steam_engine_unit).toBeGreaterThanOrEqual(1);

    expect(s.announced).toBe("S1-1");
    expect(s.stage).toBe(1);
    expect(takeOutput(s, engine, "steam_engine_unit")).toBe(true);
    expect(s.inv.some((slot) => slot?.id === "steam_engine_unit")).toBe(true);
    console.log(`S1-1 line finished at ${Math.round(s.time / 1000)}s of game time`);
  });
});
