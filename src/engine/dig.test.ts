// Digging takes time, shown as a bar; a better pick makes ore, stone and felling quicker, food and water not.
import { describe, expect, it } from "vitest";
import { WORKBENCH, buildablesAt, digBaseMs, formGroups, gearOf, machineForms, processOf } from "../content";
import { GameState, STEP_MS, digProgress, digTime, harvestTarget, startDig, step } from "./game";
import { gameWithVeins } from "./testWorld";

const PICKS = ["wood_pick", "stone_pick", "bone_pick", "iron_pick"];

/** A game standing on a vein with something to dig. */
function onVein(): GameState {
  const s = gameWithVeins(1);
  const site = s.sites.find((v) => v.ore !== "Be" && v.ore !== "Mu" && v.left > 0 && (v.z ?? 0) === 0)!;
  s.player = { x: site.x, y: site.y };
  s.path = [];
  s.hp = 100;
  s.hunger = 100;
  return s;
}
const bagCount = (s: GameState, id: string) => s.inv.reduce((n, slot) => n + (slot?.id === id ? slot.n : 0), 0);

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
    expect(s.dug).toBeDefined();
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

  it("goes quicker with each better pick: wood, stone, bone, iron", () => {
    const s = onVein();
    const site = harvestTarget(s)!.site;
    const times = [digTime(s, site)];
    for (const pick of PICKS) {
      s.gear.hand = pick;
      times.push(digTime(s, site));
    }
    for (let i = 1; i < times.length; i += 1) expect(times[i]).toBeLessThan(times[i - 1]);
    expect(times[0] / times.at(-1)!).toBeCloseTo(gearOf("iron_pick")!.dig!, 1);
  });

  it("picks food and fills water at the same pace whatever is held", () => {
    const s = onVein();
    const food = { id: 99, ore: "Be", x: 0, y: 0, total: 5, left: 5, seed: 1 };
    const bare = digTime(s, food);
    s.gear.hand = "iron_pick";
    expect(digTime(s, food)).toBe(bare);
  });

  it("makes the picks of the first age on the workbench, in the 신화시대 group", () => {
    for (const pick of ["wood_pick", "stone_pick", "bone_pick"]) {
      expect(buildablesAt(0)).toContain(pick);
      expect(machineForms(WORKBENCH)).toContain(pick);
      expect(processOf(WORKBENCH, pick).recipes[0].out).toEqual({ [pick]: 1 });
      expect(gearOf(pick)?.slot).toBe("hand");
    }
    expect(processOf(WORKBENCH, "wood_pick").recipes[0].in).toEqual({ wood: 3 });
    const groups = formGroups(WORKBENCH, machineForms(WORKBENCH), 0);
    expect(groups).toHaveLength(1);
    expect(groups[0][1]).toEqual(expect.arrayContaining(["wood_pick", "stone_pick", "bone_pick", "open_kiln"]));
  });
});
