import { describe, expect, it } from "vitest";
import { MACHINE_TYPES, MAX_PORTS, inputRole, outputRole, MOTOR, POWER, SURFACE_ORES, WAREHOUSE, itemWeight, buildUses, familyMembers, indexItems, itemName, itemSource, recipesFor, usesOf, machineForms, machineManual, matches, processOf } from "../content";
import {
  GameState, addTo, createTestGame, SPRING_MAX, WIND, hasDrive, windMotor, SEASON_MS as ONE_SEASON, canAffordRoute, failWork, isRevealed, isVisible, isWeak, routeCost, takeInput, visionAt, INV_SLOTS, MAX_CARRY, MAX_VITAL, OUTPUT_CAP, WALK_MS, carried, overloaded, walkTime, clickInput, clickOutput, clickStack, nudgeFromStore, nudgeToNode, sortSlots, stowCursor, trashCursor, wheelInput, wheelStack, eat, SEASON_MS, canHarvest, routeMaterials, seasonAt, toggleRoute, nodeLabel, atBase, canAfford, cancelProject, connect, connectOptions, countOf, createGame, deliver, mine, moveToNode, nodeById,
  placeMachine, portsUsed, removeNode, setForm, siteHere, startProject, status, step, takeOutput, walkTo, workMachine, workProject,
} from "./game";
import { BASE, chunkSites, generateSites, regionId, terrain } from "./world";

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

  it("always holds enough surface ore to finish S1", () => {
    const need: Record<string, number> = { Lm: 56, Lg: 36, Ml: 8, Kn: 8 };
    for (let seed = 1; seed <= 300; seed += 1) {
      const sites = generateSites(seed);
      for (const ore of SURFACE_ORES) {
        const total = sites.filter((x) => x.ore === ore).reduce((sum, x) => sum + x.total, 0);
        expect(total).toBeGreaterThanOrEqual(need[ore]);
      }
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
      expect(total).toBeGreaterThanOrEqual(40);
      expect(total).toBeLessThanOrEqual(120);
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
  it("has a recipe for every S1 machine", () => {
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
    expect(machineForms("forming_bench")).toEqual(["tube", "cylinder"]);
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
    return s.nodes.filter((n) => n.type === WAREHOUSE).at(-1)!;
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
    expect(countOf(s, "iron")).toBe(10);
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

  it("gives every region a unique number", () => {
    const seen = new Set<number>();
    for (let cx = -30; cx <= 30; cx += 1) {
      for (let cy = -30; cy <= 30; cy += 1) seen.add(regionId(cx * 16, cy * 16));
    }
    expect(seen.size).toBe(61 * 61);
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

  it("cooks on the stove from whichever food goes in", () => {
    const s = createGame(1);
    const stove = placeMachine(s, "stove", 0, 0)!;
    stove.ins.Be = { id: "Mu", n: 1 };
    stove.ins.coal = { id: "Lg", n: 1 };
    run(s, 6);
    expect(stove.outs.Mc).toBe(1);
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

  it("pays on start and only creates the node when the work is done", () => {
    const s = withClay(12);
    expect(startProject(s, "brick_kiln")).toBe(true);
    expect(s.inv[0]).toEqual({ id: "Kn", n: 2 });
    for (let i = 0; i < 19; i += 1) workProject(s);
    expect(s.nodes.some((n) => n.type === "brick_kiln")).toBe(false);
    workProject(s);
    expect(s.nodes.some((n) => n.type === "brick_kiln")).toBe(true);
    expect(s.project).toBeNull();
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

  it("refunds a cancelled project and a removed machine in full", () => {
    const s = withClay(10);
    startProject(s, "brick_kiln");
    cancelProject(s);
    expect(countOf(s, "clay")).toBe(10);
    startProject(s, "brick_kiln");
    for (let i = 0; i < 20; i += 1) workProject(s);
    expect(countOf(s, "clay")).toBe(0);
    removeNode(s, s.nodes.find((n) => n.type === "brick_kiln")!.id);
    expect(countOf(s, "clay")).toBe(10);
  });

  it("spends from the warehouse too", () => {
    const s = withClay(4);
    warehouse(s).store[0] = { id: "Kn", n: 6 };
    expect(startProject(s, "brick_kiln")).toBe(true);
    expect(countOf(s, "clay")).toBe(0);
  });
});

describe("S1 playthrough", () => {
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

    expect(takeOutput(s, engine, "steam_engine_unit")).toBe(true);
    expect(deliver(s)).toBe(true);
    expect(s.won).toBe(true);
    console.log(`S1 line finished at ${Math.round(s.time / 1000)}s of game time`);
  });
});
