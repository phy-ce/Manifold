// Digging takes time, shown as a bar. Tools are a kind and a material: the kind says which jobs it speeds
// (pick: ore and stone; axe: felling and picking food; shovel: nothing yet), the material how fast, how hard it
// hits and how long it lasts. Two hands hold tools; weapons are tools. Tools wear out and break.
import { describe, expect, it } from "vitest";
import { CONSTRUCTION, WORKBENCH, digBaseMs, fitsSlot, formGroups, gearOf, isGeneral, isTool, machineForms, processOf, toolStats, toolsAt } from "../content";
import { GameState, STEP_MS, startEat, Stack, addTo, attack, clickGear, clickStack, createGame, digProgress, digTime, harvestTarget, sortSlots, startDig, step, usesLeft, weaponOf } from "./game";
import { gameWithVeins } from "./testWorld";

const TOOL_BENCH = "tool_bench";
/** Every recipe a machine has, whatever form it is set to. */
const recipesOf = (type: string) => processOf(type, "").recipes;

/** A game standing on a vein with something to dig. */
function onVein(): GameState {
  const s = gameWithVeins(1);
  const site = s.sites.find((v) => !["Be", "Mu", "water", "cave"].includes(v.ore) && v.left > 0 && (v.z ?? 0) === 0)!;
  s.player = { x: site.x, y: site.y };
  s.path = [];
  s.hp = 100;
  s.hunger = 100;
  return s;
}
const bagCount = (s: GameState, id: string) => s.inv.reduce((n, slot) => n + (slot?.id === id ? slot.n : 0), 0);
const hold = (id: string, wear = 0): Stack => ({ id, n: 1, ...(wear ? { wear } : {}) });
/** Runs one dig to the end. */
function digOnce(s: GameState): void {
  expect(startDig(s)).toBe(true);
  for (let i = 0; i < 1000 && s.dig; i += 1) step(s);
}

describe("digging", () => {
  it("takes its time: nothing comes up until the bar is full, then one", () => {
    const s = onVein();
    const ore = harvestTarget(s)!.site.ore;
    expect(startDig(s)).toBe(true);
    expect(startDig(s)).toBe(false); // one at a time
    const ms = s.dig!.ms;
    expect(ms).toBe(digBaseMs("ore"));
    for (let t = STEP_MS; t < ms; t += STEP_MS) {
      step(s);
      expect(bagCount(s, ore)).toBe(0);
      expect(digProgress(s)).toBeGreaterThan(0);
    }
    step(s);
    expect(bagCount(s, ore)).toBe(1);
    expect(s.dig).toBeNull();
  });

  it("won't start with the bag full or too heavy a load, and says which", () => {
    const s = onVein();
    s.inv = s.inv.map(() => ({ id: "stick", n: 1 }));
    expect(startDig(s)).toBe(false);
    expect(s.blocked?.why).toBe("full");
    const t = onVein();
    t.inv = t.inv.map(() => null);
    t.inv[0] = { id: "iron", n: 999 };
    expect(startDig(t)).toBe(false);
    expect(t.blocked?.why).toBe("heavy");
  });

  it("eats over time: the food is used up and helps only when the bar is full, and walking off stops it", () => {
    const s = createGame(1);
    s.inv = s.inv.map(() => null);
    s.inv[0] = { id: "Be", n: 2 };
    s.hunger = 50;
    expect(startEat(s, 0)).toBe(true);
    expect(startEat(s, 0)).toBe(false); // one at a time
    step(s);
    expect([s.inv[0]?.n, s.hunger <= 50]).toEqual([2, true]);
    for (let i = 0; i < 100 && s.eating; i += 1) step(s);
    expect(s.inv[0]?.n).toBe(1);
    expect(s.hunger).toBeGreaterThan(49);
    startEat(s, 0);
    s.path = [{ x: s.player.x + 1, y: s.player.y }];
    step(s);
    expect(s.eating).toBeNull();
    expect(s.inv[0]?.n).toBe(1);
  });

  it("stops when the player walks off, and gives nothing", () => {
    const s = onVein();
    const ore = harvestTarget(s)!.site.ore;
    startDig(s);
    step(s);
    s.path = [{ x: s.player.x + 1, y: s.player.y }];
    step(s);
    expect(s.dig).toBeNull();
    expect(bagCount(s, ore)).toBe(0);
  });
});

describe("tools", () => {
  it("speed only their own jobs: a pick ore, an axe food and felling, a shovel nothing yet", () => {
    const s = onVein();
    const ore = harvestTarget(s)!.site;
    const food = { id: 99, ore: "Be", x: 0, y: 0, total: 5, left: 5, seed: 1 };
    const tree = { id: 98, ore: "wood", x: 0, y: 0, total: 5, left: 5, seed: 1 };
    const bare = [digTime(s, ore), digTime(s, food), digTime(s, tree)];
    s.gear.right = hold("stone_pick");
    expect(digTime(s, ore)).toBe(Math.round(bare[0] / 2));
    expect(digTime(s, food)).toBe(bare[1]);
    s.gear.right = hold("stone_axe");
    expect(digTime(s, ore)).toBe(bare[0]);
    expect(digTime(s, food)).toBe(Math.round(bare[1] / 2));
    expect(digTime(s, tree)).toBe(Math.round(bare[2] / 2));
    s.gear.right = hold("stone_shovel");
    expect([digTime(s, ore), digTime(s, food), digTime(s, tree)]).toEqual(bare);
  });

  it("go quicker by material: wood, stone, bone, iron", () => {
    const s = onVein();
    const site = harvestTarget(s)!.site;
    const times = [digTime(s, site)];
    for (const material of ["wood", "stone", "bone", "iron"]) {
      s.gear.left = hold(`${material}_pick`);
      times.push(digTime(s, site));
    }
    for (let i = 1; i < times.length; i += 1) expect(times[i]).toBeLessThan(times[i - 1]);
  });

  it("use the quicker of two picks, one in each hand", () => {
    const s = onVein();
    const site = harvestTarget(s)!.site;
    s.gear.left = hold("wood_pick");
    s.gear.right = hold("iron_pick");
    expect(digTime(s, site)).toBe(Math.round(digBaseMs("ore") / toolStats("iron_pick")!.speed));
  });

  it("fight too: the hardest-hitting tool in hand strikes, and a spear reaches two cells", () => {
    const s = createGame(1);
    expect(weaponOf(s).damage).toBe(1); // fists
    s.gear.left = hold("stone_pick");
    s.gear.right = hold("stone_spear");
    expect(weaponOf(s)).toMatchObject({ range: 2, hand: "right" });
    s.gear.right = hold("iron_blade");
    expect(weaponOf(s)).toMatchObject({ damage: 4, hand: "right" });
  });

  it("go in either hand, and nothing else does", () => {
    for (const hand of ["left", "right"]) {
      expect(fitsSlot("bone_axe", hand)).toBe(true);
      expect(fitsSlot("iron_boots", hand)).toBe(false);
    }
    expect(fitsSlot("bone_axe", "feet")).toBe(false);
    expect(gearOf("bone_axe")?.slot).toBe("hand");
  });

  it("wear one use per dig and break at none left, emptying the hand", () => {
    const s = onVein();
    const durability = toolStats("wood_pick")!.durability;
    s.gear.right = hold("wood_pick", durability - 2);
    digOnce(s);
    expect(s.gear.right && usesLeft(s.gear.right)).toBe(1);
    digOnce(s);
    expect(s.gear.right).toBeNull();
    expect(s.broke?.id).toBe("wood_pick");
  });

  it("wear one use per blow", () => {
    const s = createGame(1);
    s.mobs = [{ id: 1, kind: "deer", x: s.player.x + 1, y: s.player.y, wait: 99999, cool: 0, hp: 99 }];
    s.gear.left = hold("stone_blade");
    expect(attack(s, 1)).toBe(true);
    expect(s.gear.left?.wear).toBe(1);
  });

  it("never stack, and keep their wear when moved, equipped or sorted", () => {
    const s = createGame(1);
    s.inv = s.inv.map(() => null);
    expect(addTo(s.inv, "stone_axe", 2)).toBe(2);
    expect(s.inv.filter((slot) => slot?.id === "stone_axe")).toHaveLength(2);
    s.inv[0]!.wear = 7;
    clickStack(s, s.inv, 0, "left");
    expect(s.cursor).toEqual({ id: "stone_axe", n: 1, wear: 7 });
    clickGear(s, "left");
    expect(s.gear.left).toEqual({ id: "stone_axe", n: 1, wear: 7 });
    clickGear(s, "left");
    clickStack(s, s.inv, 5, "left");
    expect(s.inv[5]).toEqual({ id: "stone_axe", n: 1, wear: 7 });
    sortSlots(s.inv);
    expect(s.inv.filter(Boolean).map((slot) => slot!.wear ?? 0).sort()).toEqual([0, 7]);
  });
});

describe("making tools", () => {
  it("puts them together on the tool bench: the kind is the form, what goes in the material, with sticks for a handle", () => {
    expect(machineForms(TOOL_BENCH)).toEqual(expect.arrayContaining(["pick", "axe", "shovel", "spear", "blade", "stick"]));
    const picks = processOf(TOOL_BENCH, "pick").recipes.map((r) => [r.in, r.out]);
    expect(picks).toContainEqual([{ stone: 3, stick: 2 }, { stone_pick: 1 }]);
    expect(picks).toContainEqual([{ wood: 3, stick: 2 }, { wood_pick: 1 }]);
    // A metal pick takes a head shaped first.
    expect(picks).toContainEqual([{ iron_pick_head: 1, stick: 2 }, { iron_pick: 1 }]);
    expect(processOf(TOOL_BENCH, "stick").recipes[0]).toMatchObject({ in: { wood: 1 }, out: { stick: 2 } });
    for (const id of toolsAt(0)) expect(isTool(id)).toBe(true);
  });

  it("shapes iron heads on the forming bench only, never by hand on the 가공대", () => {
    for (const form of ["pick_head", "axe_head", "shovel_head", "spear_head", "blade_head"]) {
      expect(processOf("forming_bench", form).recipes[0].out).toEqual({ [`iron_${form}`]: 1 });
      expect(machineForms("craft_bench")).not.toContain(form);
    }
    expect(recipesOf("craft_bench").some((r) => Object.keys(r.out).some((id) => id.startsWith("iron_")))).toBe(false);
  });

  it("makes an iron head from pig iron too, and has no pig iron heads", () => {
    const heads = processOf("forming_bench", "pick_head").recipes;
    expect(heads.map((r) => [Object.keys(r.in)[0], Object.keys(r.out)[0]])).toEqual(expect.arrayContaining([["iron", "iron_pick_head"], ["pig_iron", "iron_pick_head"]]));
    expect(heads.some((r) => "pig_iron_pick_head" in r.out)).toBe(false);
  });

  it("lets the construction bench build the first age's machines too, inherited from the workbench", () => {
    for (const type of machineForms(WORKBENCH)) expect(machineForms(CONSTRUCTION)).toContain(type);
  });
});

describe("general and special buildings", () => {
  // Each general line, oldest first: every later machine does all its forebear does.
  const LINES = [["workbench", "construction_bench"], ["craft_bench", "forming_bench"], ["open_kiln", "brick_kiln"], ["bloomery", "blast_furnace"], ["hand_forge", "plate_hammer", "steam_hammer"]];

  it("are five lines, each machine of a later age doing everything the one before it does", () => {
    for (const line of LINES) {
      for (const type of line) expect([type, isGeneral(type)]).toEqual([type, true]);
      for (let i = 1; i < line.length; i += 1) {
        const made = (type: string) => new Set(recipesOf(type).flatMap((r) => Object.keys(r.out)));
        const heir = made(line[i]);
        for (const id of made(line[i - 1])) expect([line[i], id, heir.has(id)]).toEqual([line[i], id, true]);
      }
    }
  });

  it("keeps two recipes with the same products apart when they take different things: both copper smelts", () => {
    const furnace = recipesOf("blast_furnace").filter((r) => "copper" in r.out).map((r) => Object.keys(r.in)[0]);
    expect(furnace).toEqual(expect.arrayContaining(["copper_oxide", "copper_sulfide"]));
  });

  it("are listed on the benches as general buildings, then special ones", () => {
    const groups = formGroups(CONSTRUCTION, machineForms(CONSTRUCTION), 3);
    expect(groups.map(([label]) => label)).toEqual(["범용 건물", "특수 건물"]);
    expect(groups[0][1].every(isGeneral)).toBe(true);
    expect(groups[1][1].some(isGeneral)).toBe(false);
    expect(groups[1][1]).toContain("tool_bench");
  });
});
