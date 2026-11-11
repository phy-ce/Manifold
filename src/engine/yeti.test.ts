// The snowfield's yeti: where it comes out, how it hunts, that no early weapon beats it, and that it fades with the age.
import { describe, expect, it } from "vitest";
import era from "../../data/steam-era.json";
import { STAGES, YETI } from "../content";
import { GameState, Mob, attack, canStrike, createGame, loadSave, mobVisible, step, walkTo } from "./game";
import { BASE, Point, biomeAt } from "./world";

const SEED = 1;
const steps8 = (a: Point, b: Point) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
const snowy = (p: Point) => biomeAt(p.x, p.y, SEED) === YETI.biome;

/** A snow cell with snow all round it for `radius` cells, so nothing but snow is in play. */
function deepSnow(radius: number): Point {
  for (let r = 80; r < 900; r += 8) {
    for (let a = 0; a < 64; a += 1) {
      const c = { x: Math.round(BASE.x + Math.cos((a / 64) * Math.PI * 2) * r), y: Math.round(BASE.y + Math.sin((a / 64) * Math.PI * 2) * r) };
      if (!snowy(c)) continue;
      let all = true;
      for (let y = -radius; y <= radius && all; y += 2) for (let x = -radius; x <= radius && all; x += 2) all = snowy({ x: c.x + x, y: c.y + y });
      if (all) return c;
    }
  }
  throw new Error("no snowfield found");
}
const CENTRE = deepSnow(22);
/** Going east from the snowfield's middle: the last snow cell and the first cell past it. */
const EDGE = (() => {
  let x = CENTRE.x;
  while (snowy({ x: x + 1, y: CENTRE.y })) x += 1;
  return { snow: { x, y: CENTRE.y }, out: { x: x + 1, y: CENTRE.y } };
})();

function at(p: Point): GameState {
  const s = createGame(SEED);
  s.player = { ...p };
  return s;
}
const yeti = (p: Point, extra: Partial<Mob> = {}): Mob => ({ id: 0, kind: "yeti", ...p, wait: 0, cool: 0, hp: YETI.hp, ...extra });
/** Steps the world, keeping the player fed so only the yeti matters; `heal` keeps them healthy too. */
function run(s: GameState, n: number, heal: boolean, each?: () => void): void {
  for (let i = 0; i < n; i += 1) {
    s.hunger = 100;
    if (heal) s.hp = 100;
    step(s);
    each?.();
  }
}
const collapsed = (s: GameState) => s.weakUntil > 0;

describe("the snowfield's yeti", () => {
  it("is data: an early-age belief, resolved by stage id", () => {
    expect(STAGES.findIndex((m) => m.id === YETI.lastStage)).toBeGreaterThan(0);
    expect(YETI.biome).toBe("snow");
    expect(YETI.away[0]).toBeGreaterThan(YETI.sight);
  });

  it("never comes out with the player outside the snow", () => {
    const s = createGame(SEED);
    run(s, 6000, true, () => expect(s.mobs.filter((m) => m.kind === "yeti")).toEqual([]));
    const edge = at(EDGE.out);
    run(edge, 6000, true, () => expect(edge.mobs.filter((m) => m.kind === "yeti")).toEqual([]));
  });

  it("comes out in the snow while the player is in it: on snow, out of sight, a fair way off, one at a time", () => {
    const s = at(CENTRE);
    let first: Mob | null = null;
    run(s, 12000, true, () => {
      expect(s.mobs.length).toBeLessThanOrEqual(1);
      if (!first && s.mobs.length) first = { ...s.mobs[0] };
      for (const m of s.mobs) expect(snowy(m)).toBe(true);
    });
    expect(first).not.toBeNull();
    const d = steps8(first!, CENTRE);
    expect(d).toBeGreaterThan(YETI.sight);
    expect(d).toBeLessThanOrEqual(YETI.away[1]);
  });

  it("hunts a player it notices, and closes in", () => {
    const s = at(CENTRE);
    s.mobs = [yeti({ x: CENTRE.x + YETI.sight, y: CENTRE.y }, { cool: 99999 })];
    run(s, 40, true);
    expect(s.mobs[0].hunting).toBe(true);
    expect(steps8(s.mobs[0], s.player)).toBeLessThan(YETI.sight);
  });

  it("chases only as far as the snow reaches, then gives up and goes once the player stays out", () => {
    const s = at(EDGE.out);
    s.mobs = [yeti({ x: EDGE.snow.x - 6, y: EDGE.snow.y }, { hunting: true })];
    let gone = -1;
    run(s, Math.ceil(YETI.giveUpMs / 100) + 20, false, () => {
      for (const m of s.mobs) expect(snowy(m)).toBe(true);
      if (gone < 0 && !s.mobs.length) gone = s.time;
    });
    expect(gone).toBeGreaterThan(0);
    expect(s.hp).toBe(100);
  });

  it("cannot be killed by any weapon there is, and a player who stands and fights collapses", () => {
    const weapons = Object.entries(era.gear).filter(([, g]) => "damage" in g).map(([id]) => id);
    expect(weapons.length).toBeGreaterThan(0);
    for (const weapon of weapons) {
      const s = at(CENTRE);
      s.gear.weapon = weapon;
      s.mobs = [yeti({ x: CENTRE.x + 1, y: CENTRE.y }, { cool: YETI.attackMs })];
      let blows = 0;
      for (let i = 0; i < 2000 && !collapsed(s); i += 1) {
        const m = s.mobs[0];
        if (m && canStrike(s) && mobVisible(s, m) && attack(s, m.id)) blows += 1;
        if (s.mobs.length) expect(s.mobs[0].hp).toBe(YETI.hp);
        run(s, 1, false);
      }
      expect(blows).toBeGreaterThan(0);
      expect(collapsed(s)).toBe(true);
    }
  });

  it("is escaped by leaving the snow", () => {
    const s = at(EDGE.snow);
    s.safeWalk = false;
    s.mobs = [yeti({ x: EDGE.snow.x - 1, y: EDGE.snow.y }, { hunting: true, cool: YETI.attackMs })];
    walkTo(s, { x: EDGE.out.x + 6, y: EDGE.out.y });
    run(s, Math.ceil(YETI.giveUpMs / 100) + 80, false, () => {
      for (const m of s.mobs) expect(snowy(m)).toBe(true);
    });
    expect(collapsed(s)).toBe(false);
    expect(s.mobs).toEqual([]);
  });

  it("is no longer seen once the age moves past S1", () => {
    const s = at(CENTRE);
    s.stage = STAGES.findIndex((m) => m.id === YETI.lastStage) + 1;
    s.mobs = [yeti({ x: CENTRE.x + 5, y: CENTRE.y })];
    run(s, 1, true);
    expect(s.mobs).toEqual([]);
    run(s, 12000, true, () => expect(s.mobs).toEqual([]));
  });

  it("is not kept across a save, and loading still works", () => {
    const s = at(CENTRE);
    s.mobs = [yeti({ x: CENTRE.x + 5, y: CENTRE.y })];
    const back = loadSave(JSON.parse(JSON.stringify(s)))!;
    expect(back).not.toBeNull();
    expect(back.mobs).toEqual([]);
    expect(back.player).toEqual(CENTRE);
  });
});
