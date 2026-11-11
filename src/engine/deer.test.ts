// Deer of the plains and forests: where they come out, that they run but can be caught, what they leave, and
// that a deer grazing nearby doesn't take F away from the ground.
import { describe, expect, it } from "vitest";
import { DEER } from "../content";
import { GameState, Mob, actionKey, attack, createGame, mobVisible, step } from "./game";
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

  it("leave meat, hide and antler in the bag when killed, and say so", () => {
    const s = at(MEADOW);
    s.mobs = [deer({ x: MEADOW.x + 1, y: MEADOW.y }, { hp: 1, wait: 99999 })];
    expect(mobVisible(s, s.mobs[0])).toBe(true);
    expect(attack(s, 1)).toBe(true);
    expect(s.mobs).toEqual([]);
    for (const [id, n] of Object.entries(DEER.drops)) {
      expect(s.inv.filter((slot) => slot?.id === id).reduce((sum, slot) => sum + slot!.n, 0)).toBe(n);
    }
    expect(s.drop?.got).toEqual(DEER.drops);
  });

  it("leave F to the ground while grazing out of reach, and give it to the fight within a blow", () => {
    const s = at(MEADOW);
    s.mobs = [deer({ x: MEADOW.x + 4, y: MEADOW.y }, { wait: 99999 })];
    expect(actionKey(s)).not.toBe("fight");
    s.mobs[0].x = MEADOW.x + 1;
    expect(actionKey(s)).toBe("fight");
  });
});
