// Deer of the plains and forests: where they come out, that they run but can be caught, what they leave where they fall, and
// that a deer grazing nearby doesn't take F away from the ground.
import { describe, expect, it } from "vitest";
import { DEER } from "../content";
import { GameState, Mob, actionKey, attack, butcherChances, chosenGather, corpsesHere, createGame, gathersHere, pickGather, startDig, step } from "./game";
import { BASE, Point, biomeAt, terrain } from "./world";

const SEED = 1;
const steps8 = (a: Point, b: Point) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
const deerLand = (p: Point) => DEER.biomes.includes(biomeAt(p.x, p.y, SEED));
const open = (p: Point) => !["t-water", "t-hill"].includes(terrain(p.x, p.y, SEED)[1]);

/** Open ground in deer country with more of it all round, so a deer has room to run. */
function meadow(radius: number): Point {
  for (let r = 0; r < 600; r += 4) {
    for (let a = 0; a < 48; a += 1) {
      const c = { x: Math.round(BASE.x + Math.cos((a / 48) * Math.PI * 2) * r), y: Math.round(BASE.y + Math.sin((a / 48) * Math.PI * 2) * r) };
      let all = true;
      for (let y = -radius; y <= radius && all; y += 1) for (let x = -radius; x <= radius && all; x += 1) all = deerLand({ x: c.x + x, y: c.y + y }) && open({ x: c.x + x, y: c.y + y });
      if (all) return c;
    }
  }
  throw new Error("no meadow found");
}
const MEADOW = meadow(6);

function at(p: Point): GameState {
  const s = createGame(SEED);
  s.player = { ...p };
  s.mobs = [];
  return s;
}
const deer = (p: Point, extra: Partial<Mob> = {}): Mob => ({ id: 1, kind: "deer", ...p, wait: 0, cool: 0, hp: DEER.hp, ...extra });
function run(s: GameState, n: number, each?: () => void): void {
  for (let i = 0; i < n; i += 1) {
    s.hunger = 100;
    s.hp = 100;
    step(s);
    each?.();
  }
}

describe("deer", () => {
  it("come out in the plains and forests, out of sight, a few at most, and only there", () => {
    const s = at(MEADOW);
    let seen = 0;
    run(s, 3000, () => {
      const herd = s.mobs.filter((m) => m.kind === "deer");
      expect(herd.length).toBeLessThanOrEqual(DEER.cap);
      for (const m of herd) {
        expect(deerLand(m)).toBe(true);
        expect(open(m)).toBe(true);
      }
      seen = Math.max(seen, herd.length);
    });
    expect(seen).toBeGreaterThan(0);
  });

  it("run from a player who comes near, and stand when cornered rather than run at them", () => {
    const s = at(MEADOW);
    s.mobs = [deer({ x: MEADOW.x + 2, y: MEADOW.y })];
    const before = steps8(s.mobs[0], s.player);
    run(s, 10);
    expect(steps8(s.mobs[0], s.player)).toBeGreaterThan(before);
  });

  it("are slower running than the player walks, so they can be run down", () => {
    expect(DEER.fleeMs).toBeGreaterThan(150);
  });

  const bag = (s: GameState, id: string) => s.inv.filter((slot) => slot?.id === id).reduce((sum, slot) => sum + slot!.n, 0);

  const cuts = Object.keys(DEER.butcher.chance);
  const cutCount = (s: GameState) => cuts.reduce((n, id) => n + bag(s, id), 0);
  /** Cuts once at the carcass picked, to the end of the bar. */
  const cutOnce = (s: GameState) => {
    expect(startDig(s)).toBe(true);
    for (let i = 0; i < 100 && s.dig; i += 1) step(s);
  };
  /** Kills deer on a cell beside the meadow's middle, one after another. */
  const killAt = (s: GameState, spot: { x: number; y: number }, n: number) => {
    for (let id = 1; id <= n; id += 1) {
      s.mobs = [deer(spot, { id, hp: 1, wait: 99999 })];
      expect(attack(s, id)).toBe(true);
      s.strikeReady = 0;
    }
  };

  it("fall where they die, and are cut up one piece at a time, by chance, standing on them with F", () => {
    const s = at(MEADOW);
    const spot = { x: MEADOW.x + 1, y: MEADOW.y };
    killAt(s, spot, 1);
    expect(s.mobs).toEqual([]);
    expect(s.corpses).toEqual([expect.objectContaining({ kind: "deer", ...spot, z: 0, left: DEER.butcher.cuts })]);
    expect(cutCount(s)).toBe(0);
    expect(gathersHere(s)).toHaveLength(0);
    s.player = { ...spot };
    expect(chosenGather(s)?.corpse).toBeTruthy();
    expect(actionKey(s)).toBe("work");
    cutOnce(s);
    expect(cutCount(s)).toBe(1);
    expect(Object.keys(s.drop!.got)).toHaveLength(1);
    expect(corpsesHere(s)[0].left).toBe(DEER.butcher.cuts - 1);
    for (let i = 1; i < DEER.butcher.cuts; i += 1) cutOnce(s);
    expect(cutCount(s)).toBe(DEER.butcher.cuts);
    expect(s.corpses).toEqual([]);
  });

  it("give meat most, then bone, and antler seldom", () => {
    const odds = Object.fromEntries(butcherChances());
    expect(odds.meat).toBeGreaterThan(odds.bone);
    expect(odds.bone).toBeGreaterThan(odds.antler * 2);
  });

  it("cut quicker with a blade in hand", () => {
    const s = at(MEADOW);
    const spot = { x: MEADOW.x + 1, y: MEADOW.y };
    killAt(s, spot, 1);
    s.player = { ...spot };
    startDig(s);
    const bare = s.dig!.ms;
    s.dig = null;
    s.gear.right = { id: "stone_blade", n: 1 };
    startDig(s);
    expect(s.dig!.ms).toBeLessThan(bare);
  });

  it("can lie two or more on one cell: the window lists them, and only the one picked is cut", () => {
    const s = at(MEADOW);
    const spot = { x: MEADOW.x + 1, y: MEADOW.y };
    killAt(s, spot, 3);
    s.player = { ...spot };
    expect(gathersHere(s)).toHaveLength(3);
    expect(new Set(gathersHere(s).map((g) => g.key)).size).toBe(3);
    expect(chosenGather(s)).toBeUndefined();
    expect(actionKey(s)).toBe("none");
    expect(startDig(s)).toBe(false);
    const second = gathersHere(s)[1];
    pickGather(s, second.key);
    cutOnce(s);
    expect(second.corpse!.left).toBe(DEER.butcher.cuts - 1);
    expect(gathersHere(s).filter((g) => g.key !== second.key).every((g) => g.corpse!.left === DEER.butcher.cuts)).toBe(true);
    // Back to the list, and walking off forgets the pick.
    pickGather(s, null);
    expect(chosenGather(s)).toBeUndefined();
    pickGather(s, second.key);
    s.path = [{ x: spot.x + 1, y: spot.y }];
    run(s, 3);
    s.path = [{ ...spot }];
    run(s, 3);
    expect(s.picked ?? null).toBeNull();
  });

  it("keep their cuts when the bag can't take what comes off, and say so", () => {
    const s = at(MEADOW);
    const spot = { x: MEADOW.x + 1, y: MEADOW.y };
    killAt(s, spot, 1);
    s.player = { ...spot };
    s.inv = s.inv.map(() => ({ id: "stick", n: 1 }));
    expect(startDig(s)).toBe(false);
    expect(s.blocked?.why).toBe("full");
    expect(corpsesHere(s)[0].left).toBe(DEER.butcher.cuts);
  });

  it("leave F to the ground while grazing out of reach, and give it to the fight within a blow", () => {
    const s = at(MEADOW);
    s.mobs = [deer({ x: MEADOW.x + 4, y: MEADOW.y }, { wait: 99999 })];
    expect(actionKey(s)).not.toBe("fight");
    s.mobs[0].x = MEADOW.x + 1;
    expect(actionKey(s)).toBe("fight");
  });
});
