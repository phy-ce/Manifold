// The underground (layer -1) and prospecting: one endless layer under the surface, entrances as stairs, walking,
// sight, finding and mining veins, creatures, notes across layers, saves.
import { describe, expect, it } from "vitest";
import { CAVE, CAVES, PUMP, SURFACE_ORES, familyOf, inLayer, layerOres, matches } from "../content";
import {
  GameState, addTo, atBase, caveDoorHere, countOf, createGame, createTestGame, enterCave, leaveCave, loadSave, mine, nearestStair,
  FISTS, attack, attackNearest, weaponOf, clearLine, onThisMap, setNote, siteHere, siteSpotHere, stairHere, startProbe, step, underSeenAt, walkStep, walkTo,
  SAVE_VERSION, actionKey, creaturesInSight,
} from "./game";
import {
  BASE, CELL_ASPECT, CHUNK, FLOOR, HABITAT, Point, ROCK, chunkOf, chunkSites, entrancesIn, nearCave, nearEntrance, safePath, terrain, biomeAt, underCell,
} from "./world";

/** Walks until there, going on past each hazard safe mode stops at. */
function arrive(s: GameState): void {
  for (let guard = 0; (s.path.length || s.halt) && guard < 20000; guard += 1) {
    if (s.halt) walkTo(s, s.halt.target);
    s.hp = 100;
    s.hunger = 100;
    step(s);
  }
}
/** Down the cave entrance near the base of a fresh game. */
function inside(seed = 3): GameState {
  const s = createGame(seed);
  const door = s.sites.find((site) => site.ore === CAVE)!;
  s.player = { x: door.x, y: door.y };
  expect(enterCave(s)).toBe(true);
  return s;
}
const probeFully = (s: GameState) => {
  expect(startProbe(s)).toBe(true);
  for (let i = 0; i < CAVES.probeMs / 100; i += 1) step(s);
};
const span = (a: Point, b: Point) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
const open = (seed: number, x: number, y: number) => underCell(x, y, seed) !== ROCK;
/** Open cells of the underground in a box round a point. */
function openAround(seed: number, at: Point, reach: number): Point[] {
  const cells: Point[] = [];
  for (let y = at.y - reach; y <= at.y + reach; y += 1) for (let x = at.x - reach; x <= at.x + reach; x += 1) if (open(seed, x, y)) cells.push({ x, y });
  return cells;
}
/** How many open cells a flood from a cell reaches through straight steps, up to `most`. */
function reach(seed: number, from: Point, most: number): number {
  const seen = new Set([`${from.x},${from.y}`]);
  const stack = [from];
  while (stack.length && seen.size < most) {
    const p = stack.pop()!;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const n = { x: p.x + dx, y: p.y + dy };
      if (seen.has(`${n.x},${n.y}`) || !open(seed, n.x, n.y)) continue;
      seen.add(`${n.x},${n.y}`);
      stack.push(n);
    }
  }
  return seen.size;
}

describe("ore layers", () => {
  it("lets each ore turn up over a range of layers, not one deep ore per layer", () => {
    expect(inLayer("Lm", 0) && inLayer("Lm", 1)).toBe(true);
    expect(inLayer("Py", 0)).toBe(false);
    expect(inLayer("Py", 1) && inLayer("Py", 2)).toBe(true);
    expect(inLayer("Mt", 1)).toBe(false);
    const layer1 = layerOres(1, 0);
    expect(layer1).toEqual(expect.arrayContaining(["Lm", "Py", "Ml", "Cc", "Lg", "Bt", "Kn"]));
    expect(layer1).not.toContain("Mt");
    expect(layer1).toContain("Ls");
  });

  it("smelts underground ores like their surface cousins, by family", () => {
    expect(matches("Py", "iron_ore")).toBe(true);
    expect(matches("Bt", "coal")).toBe(true);
    expect(matches("Cc", "copper_ore")).toBe(true);
  });

  it("weights surface ore by family on the plain: iron and coal, then copper, then clay; food apart", () => {
    const count: Record<string, number> = {};
    let ore = 0;
    let food = 0;
    for (let cx = 3; cx < 140; cx += 1) {
      for (let cy = 3; cy < 140; cy += 1) {
        for (const site of chunkSites(11, cx, cy)) {
          if (site.ore === CAVE || site.ore === "water" || biomeAt(site.x, site.y, 11) !== "plains") continue;
          if (SURFACE_ORES.includes(site.ore)) {
            ore += 1;
            count[familyOf(site.ore)!] = (count[familyOf(site.ore)!] ?? 0) + 1;
          } else food += 1;
        }
      }
    }
    expect(count.iron_ore).toBeGreaterThan(count.copper_ore * 1.3);
    expect(count.coal).toBeGreaterThan(count.copper_ore * 1.3);
    expect(count.copper_ore).toBeGreaterThan(count.clay * 1.4);
    expect(food / (ore + food)).toBeLessThan(0.85);
  }, 30_000); // thousands of chunks: slow on the CI machine
});

describe("cave entrances", () => {
  it("puts one on dry ground a short walk from every base", () => {
    for (let seed = 1; seed <= 40; seed += 1) {
      const at = nearCave(seed);
      const dist = Math.hypot(at.x - BASE.x, (at.y - BASE.y) / CELL_ASPECT);
      expect(dist).toBeGreaterThanOrEqual(CAVES.near[0] - 1);
      expect(dist).toBeLessThanOrEqual(CAVES.near[1] + 1);
      expect(terrain(at.x, at.y, seed)[1]).not.toBe("t-water");
      const s = createGame(seed);
      expect(s.sites.filter((site) => site.ore === CAVE && site.x === at.x && site.y === at.y)).toHaveLength(1);
    }
  });

  it("can't be mined, and is gone down only by standing on it, to the same spot underground", () => {
    const s = createGame(3);
    expect(enterCave(s)).toBe(false);
    const door = s.sites.find((site) => site.ore === CAVE)!;
    walkTo(s, door);
    arrive(s);
    expect(caveDoorHere(s)).toBe(door);
    expect(mine(s)).toBe(false);
    expect(enterCave(s)).toBe(true);
    expect(s.z).toBe(-1);
    expect(s.player).toEqual({ x: door.x, y: door.y });
    expect(atBase(s)).toBe(false);
    expect(stairHere(s)).toBe(door);
  });

  it("are the stairs of the underground: every entrance the world rolls is one", () => {
    for (let seed = 1; seed <= 10; seed += 1) {
      const near = nearCave(seed);
      expect(entrancesIn(seed, chunkOf(near.x), chunkOf(near.y))).toContainEqual(near);
      for (let cx = -6; cx < 6; cx += 1) {
        for (let cy = -6; cy < 6; cy += 1) {
          const caves = chunkSites(seed, cx, cy).filter((v) => v.ore === CAVE).map(({ x, y }) => ({ x, y }));
          for (const cave of caves) expect(entrancesIn(seed, cx, cy)).toContainEqual(cave);
        }
      }
    }
  });
});

describe("underground layout", () => {
  it("is a pure function of the seed and the cell: the same every time, different for another seed", () => {
    const a = Array.from({ length: 400 }, (_, i) => underCell(i % 40 - 20, Math.floor(i / 40) - 5, 77));
    const b = Array.from({ length: 400 }, (_, i) => underCell(i % 40 - 20, Math.floor(i / 40) - 5, 77));
    const c = Array.from({ length: 400 }, (_, i) => underCell(i % 40 - 20, Math.floor(i / 40) - 5, 78));
    expect(b).toEqual(a);
    expect(c).not.toEqual(a);
  });

  it("is mostly rock with caverns and tunnels, and some dens", () => {
    let rock = 0;
    let dens = 0;
    const n = 200 * 120;
    for (let y = -60; y < 60; y += 1) {
      for (let x = -100; x < 100; x += 1) {
        const cell = underCell(x, y, 5);
        if (cell === ROCK) rock += 1;
        if (cell === HABITAT) dens += 1;
      }
    }
    expect(rock / n).toBeGreaterThan(0.5);
    expect(rock / n).toBeLessThan(0.85);
    expect(dens).toBeGreaterThan(0);
  });

  it("meets across chunk edges as smoothly as inside a chunk: no seams", () => {
    let edge = 0;
    let edges = 0;
    let inner = 0;
    let inners = 0;
    for (let y = -80; y < 80; y += 1) {
      for (let x = -160; x < 160; x += 1) {
        const differs = open(9, x, y) !== open(9, x + 1, y) ? 1 : 0;
        if (((x % CHUNK) + CHUNK) % CHUNK === CHUNK - 1) [edge, edges] = [edge + differs, edges + 1];
        else [inner, inners] = [inner + differs, inners + 1];
      }
    }
    expect(edge / edges).toBeLessThan((inner / inners) * 1.6 + 0.01);
  });

  it("keeps a floor chamber round every stair and joins it to the caves", () => {
    for (let seed = 1; seed <= 12; seed += 1) {
      const doors: Point[] = [nearCave(seed)];
      for (let cx = -8; cx < 8; cx += 1) for (let cy = -8; cy < 8; cy += 1) doors.push(...entrancesIn(seed, cx, cy));
      for (const door of doors) {
        expect(underCell(door.x, door.y, seed)).toBe(FLOOR);
        for (const [dx, dy] of [[1, 0], [-1, 0], [2, 0], [-2, 0], [0, 1], [0, -1]]) expect(underCell(door.x + dx, door.y + dy, seed)).toBe(FLOOR);
        // Not a pocket: the stair leads on into an open area at least the size the data asks for.
        expect(reach(seed, door, CAVES.under.joinSize)).toBeGreaterThanOrEqual(CAVES.under.joinSize);
      }
    }
  });
});

describe("underground", () => {
  it("lies right under the surface: going down and coming up keep the same x and y", () => {
    const s = inside();
    const door = s.sites.find((v) => v.ore === CAVE && v.x === s.player.x && v.y === s.player.y)!;
    expect(leaveCave(s)).toBe(true);
    expect(s.z).toBe(0);
    expect(s.player).toEqual({ x: door.x, y: door.y });
  });

  it("goes up from any stair, onto that entrance on the surface", () => {
    const s = createTestGame(2);
    const caves = s.sites.filter((v) => v.ore === CAVE);
    expect(caves.length).toBeGreaterThan(1);
    const [first, other] = caves;
    s.player = { x: first.x, y: first.y };
    expect(enterCave(s)).toBe(true);
    // Not on a stair: no way up.
    const off = openAround(s.seed, s.player, 3).find((p) => !caves.some((v) => v.x === p.x && v.y === p.y))!;
    s.player = off;
    expect(stairHere(s)).toBeUndefined();
    expect(leaveCave(s)).toBe(false);
    // On another entrance's stair: up there.
    s.player = { x: other.x, y: other.y };
    expect(stairHere(s)).toBe(other);
    expect(leaveCave(s)).toBe(true);
    expect(s.z).toBe(0);
    expect(s.player).toEqual({ x: other.x, y: other.y });
  });

  it("heads home by the nearest stair the player has seen", () => {
    const s = inside();
    const door = nearestStair(s)!;
    expect(door).toBeDefined();
    expect(underSeenAt(s, door.x, door.y)).toBe(true);
  });

  it("never walks through rock or cuts a corner between two rocks, and goes nowhere into solid rock", () => {
    const s = inside();
    const cells = openAround(s.seed, s.player, 30);
    const far = cells.filter((c) => reach(s.seed, c, 400) >= 400).sort((a, b) => span(b, s.player) - span(a, s.player))
      .find((c) => safePath(s.player, c, () => 0, (x, y) => !open(s.seed, x, y)).length > 0)!;
    walkTo(s, far);
    expect(s.path.length).toBeGreaterThan(0);
    let at = { ...s.player };
    for (const cell of s.path) {
      expect(open(s.seed, cell.x, cell.y)).toBe(true);
      if (cell.x !== at.x && cell.y !== at.y) {
        expect(open(s.seed, cell.x, at.y)).toBe(true);
        expect(open(s.seed, at.x, cell.y)).toBe(true);
      }
      at = cell;
    }
    const rock = { x: s.player.x, y: s.player.y + 40 };
    for (; open(s.seed, rock.x, rock.y); rock.x += 1);
    walkTo(s, rock);
    expect(s.path).toEqual([]);
  });

  it("stops a key step at rock", () => {
    const s = inside();
    // From a few spots round the stair, some of which have rock beside them.
    for (const at of openAround(s.seed, s.player, 4)) {
      s.player = at;
      for (const [dx, dy] of [[0, -1], [1, 0], [-1, 0], [0, 1]]) {
        expect(walkStep(s, dx, dy)).toBe(open(s.seed, at.x + dx, at.y + dy));
        s.path = [];
      }
    }
  });

  it("remembers what it has seen of the underground apart from the surface", () => {
    const s = inside();
    expect(underSeenAt(s, s.player.x, s.player.y)).toBe(true);
    expect(Object.keys(s.underSeen).length).toBeGreaterThan(0);
    // The surface's memory is its own.
    expect(underSeenAt(s, BASE.x, BASE.y)).toBe(false);
  });

  it("takes its full time to prospect, and walking off calls it off; never on the surface", () => {
    const s = inside();
    expect(startProbe(s)).toBe(true);
    expect(startProbe(s)).toBe(false);
    for (let i = 0; i < CAVES.probeMs / 100 - 1; i += 1) step(s);
    expect(s.probe).not.toBeNull();
    const way = [[1, 0], [-1, 0], [0, 1], [0, -1]].find(([dx, dy]) => open(s.seed, s.player.x + dx, s.player.y + dy))!;
    walkStep(s, way[0], way[1]);
    step(s);
    expect(s.probe).toBeNull();
    expect(startProbe(createGame(3))).toBe(false);
  });
});

describe("notes across layers", () => {
  it("are the player's own: a note written on an outcrop is found on either layer, and walked to only where known", () => {
    for (let seed = 1; seed < 200; seed += 1) {
      const s = createGame(seed);
      const site = s.sites.find((v) => v.cells?.some((c) => c.z === -1 && !c.buried && !c.wall));
      if (!site) continue;
      expect(setNote(s, site.id, "south outcrop")).toBe(true);
      s.player = { x: site.x, y: site.y };
      expect(siteSpotHere(s, site)).toEqual({ x: site.x, y: site.y });
      // Underground the note is still the site's, but nothing of the vein is known there until prospecting finds it.
      s.z = -1;
      expect(site.note).toBe("south outcrop");
      expect(onThisMap(s, site)).toBe(false);
      expect(siteSpotHere(s, site)).toBeUndefined();
      const cell = site.cells!.find((c) => c.z === -1 && !c.buried && !c.wall)!;
      s.player = { x: cell.x, y: cell.y };
      probeFully(s);
      expect(onThisMap(s, site)).toBe(true);
      expect(siteSpotHere(s, site)).toMatchObject({ x: cell.x, y: cell.y });
      expect(siteHere(s)).toBe(site);
      return;
    }
    throw new Error("no vein running on underground");
  });
});

describe("underground creatures", () => {
  const W = CAVES.creatures;
  /** A game underground whose stair has dens around it, so creatures come out. */
  function denned(): GameState {
    for (let seed = 1; seed < 80; seed += 1) {
      const s = inside(seed);
      if (s.mobs.length) return s;
    }
    throw new Error("no dens near any stair");
  }
  /** A spot for the player away from the stairs, and one for a creature `near` cells away with open ground between. */
  function setup(near: number[]) {
    const s = inside();
    const cells = openAround(s.seed, s.player, 40);
    for (const p of cells.filter((c) => !nearEntrance(s.seed, c.x, c.y, 12))) {
      const m = cells.find((c) => span(c, p) >= near[0] && span(c, p) <= near[1] && !nearEntrance(s.seed, c.x, c.y, W.safeRadius) && clearLine(s.seed, c, p));
      if (m) {
        s.player = p;
        s.mobs = [];
        s.shots = [];
        return { s, p, m };
      }
    }
    throw new Error("no spot");
  }
  const keepFed = (s: GameState) => { s.hunger = 100; };

  it("come out of the dens around the player on the way down, out of sight and never by a stair", () => {
    const s = denned();
    expect(s.mobs.length).toBeLessThanOrEqual(W.count[1]);
    for (const mob of s.mobs) {
      expect(underCell(mob.x, mob.y, s.seed)).toBe(HABITAT);
      expect(Math.abs(chunkOf(mob.x) - chunkOf(s.player.x))).toBeLessThanOrEqual(1);
      expect(Math.abs(chunkOf(mob.y) - chunkOf(s.player.y))).toBeLessThanOrEqual(1);
      expect(nearEntrance(s.seed, mob.x, mob.y, W.safeRadius + 4)).toBe(false);
      expect(span(mob, s.player) <= W.sight && clearLine(s.seed, mob, s.player)).toBe(false);
    }
  });

  it("only act in the chunks around the player", () => {
    const { s, p } = setup([1, 1]);
    const far = openAround(s.seed, p, 44).find((c) => Math.abs(chunkOf(c.x) - chunkOf(p.x)) >= 2 && span(c, p) <= W.spawn.forgetAway - 2)!;
    expect(far).toBeDefined();
    s.mobs = [{ id: 0, kind: "melee", ...far, wait: 0, cool: 0, hp: 10 }];
    for (let i = 0; i < 40; i += 1) { keepFed(s); step(s); }
    expect(s.mobs[0]).toMatchObject(far);
  });

  it("gives F to the fight while a creature is in sight, and back to the ground once it is gone", () => {
    const { s, m } = setup([1, 1]);
    const before = actionKey(s);
    s.mobs = [{ id: 0, kind: "melee", ...m, wait: 0, cool: 99999, hp: 2 }];
    expect(creaturesInSight(s).map((x) => x.id)).toEqual([0]);
    expect(actionKey(s)).toBe("fight");
    s.mobs = [];
    expect(actionKey(s)).toBe(before);
    expect(before).not.toBe("fight");
  });

  it("is struck with bare hands in reach, only once the blow is ready, and dies at no health", () => {
    const { s, m } = setup([1, 1]);
    s.mobs = [{ id: 0, kind: "melee", ...m, wait: 0, cool: 99999, hp: 2 }];
    expect(weaponOf(s)).toEqual(FISTS);
    expect(attack(s, 0)).toBe(true);
    expect(s.mobs[0].hp).toBe(1);
    expect(attack(s, 0)).toBe(false);
    s.time += FISTS.cooldown;
    expect(attackNearest(s)).toBe(true);
    expect(s.mobs).toHaveLength(0);
  });

  it("reaches farther with a spear and hits harder with a blade, and only half as hard while weak", () => {
    const { s, m } = setup([2, 2]);
    s.mobs = [{ id: 0, kind: "melee", ...m, wait: 0, cool: 99999, hp: 50 }];
    expect(attack(s, 0)).toBe(false);
    s.gear.weapon = "iron_spear";
    expect(attack(s, 0)).toBe(true);
    expect(s.mobs[0].hp).toBe(50 - 3);
    s.gear.weapon = "iron_blade";
    s.time += 2000;
    expect(attack(s, 0)).toBe(false);
    const beside = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => ({ x: s.player.x + dx, y: s.player.y + dy })).find((c) => open(s.seed, c.x, c.y))!;
    Object.assign(s.mobs[0], beside);
    s.weakUntil = s.time + 10000;
    expect(attack(s, 0)).toBe(true);
    expect(s.mobs[0].hp).toBe(50 - 3 - 2);
  });

  it("keep coming out while the player stays, out of sight and well away, never more than the cap", () => {
    const s = denned();
    s.mobs = [];
    const seen = new Set<number>();
    let came = 0;
    for (let i = 0; i < 6000; i += 1) {
      s.hp = 100;
      s.hunger = 100;
      step(s);
      expect(s.mobs.length).toBeLessThanOrEqual(W.spawn.cap);
      for (const m of s.mobs) {
        if (seen.has(m.id)) continue;
        seen.add(m.id);
        came += 1;
        expect(underCell(m.x, m.y, s.seed)).toBe(HABITAT);
        expect(span(m, s.player)).toBeGreaterThanOrEqual(W.spawn.minAway);
        expect(span(m, s.player) <= W.sight && clearLine(s.seed, m, s.player)).toBe(false);
      }
      if (i % 1000 === 999) s.mobs = [];
    }
    expect(came).toBeGreaterThan(2);
  });

  it("come out nearer a noise, and likelier just after one", () => {
    const s = denned();
    s.mobs = [];
    probeFully(s);
    const noise = s.noise!;
    expect(noise).toMatchObject({ x: s.player.x, y: s.player.y });
    for (let i = 0; i < 4000 && !s.mobs.length; i += 1) {
      s.hp = 100;
      if (s.time - noise.at > W.spawn.noiseMs) startProbe(s);
      step(s);
    }
    expect(s.mobs.length).toBe(1);
    const m = s.mobs[0];
    const dens: Point[] = [];
    const [cx, cy] = [chunkOf(s.player.x), chunkOf(s.player.y)];
    for (let y = (cy - 1) * CHUNK; y < (cy + 2) * CHUNK; y += 1) {
      for (let x = (cx - 1) * CHUNK; x < (cx + 2) * CHUNK; x += 1) {
        const at = { x, y };
        if (underCell(x, y, s.seed) === HABITAT && span(at, s.player) >= W.spawn.minAway && !nearEntrance(s.seed, x, y, W.safeRadius + 4) &&
          !(span(at, s.player) <= W.sight && clearLine(s.seed, at, s.player))) dens.push(at);
      }
    }
    const nearest = Math.min(...dens.map((d) => span(d, s.noise!)));
    expect(span(m, s.noise!)).toBe(nearest);
  });

  it("a wolf bites when beside the player, then waits before biting again", () => {
    const { s, m } = setup([1, 1]);
    s.mobs = [{ id: 0, kind: "melee", ...m, wait: 0, cool: 0, hp: 10 }];
    const hp = s.hp;
    step(s);
    expect(s.hp).toBe(hp - W.melee.damage);
    step(s);
    expect(s.hp).toBe(hp - W.melee.damage);
    for (let i = 0; i < W.melee.attackMs / 100; i += 1) { keepFed(s); step(s); }
    expect(s.hp).toBe(hp - W.melee.damage * 2);
  });

  it("a wolf that sees the player runs it down", () => {
    const { s, m, p } = setup([4, 6]);
    s.mobs = [{ id: 0, kind: "melee", ...m, wait: 0, cool: 5000, hp: 10 }];
    const before = span(m, p);
    for (let i = 0; i < (W.melee.moveMs / 100) * 2; i += 1) { keepFed(s); step(s); }
    expect(span(s.mobs[0], s.player)).toBeLessThan(before);
  });

  it("a wolf tracks the player round rock within hunting range, without seeing it", () => {
    const s = inside();
    const cells = openAround(s.seed, s.player, 40);
    const route = (a: Point, b: Point) => safePath(a, b, () => 0, (x, y) => !open(s.seed, x, y)).length;
    let pair: { p: Point; m: Point } | undefined;
    for (const p of cells.filter((c) => !nearEntrance(s.seed, c.x, c.y, 12))) {
      const m = cells.find((c) => span(c, p) >= 8 && span(c, p) <= W.hunt && !nearEntrance(s.seed, c.x, c.y, W.safeRadius) && !clearLine(s.seed, c, p) && route(c, p) > 0 && route(c, p) < 30);
      if (m) { pair = { p, m }; break; }
    }
    expect(pair).toBeDefined();
    s.player = pair!.p;
    s.shots = [];
    s.mobs = [{ id: 0, kind: "melee", ...pair!.m, wait: 0, cool: 5000, hp: 10 }];
    const before = route(pair!.m, s.player);
    for (let i = 0; i < (W.melee.moveMs / 100) * 4; i += 1) { keepFed(s); step(s); }
    expect(route(s.mobs[0], s.player)).toBeLessThan(before);
  });

  it("a salamander shoots a spine that flies across and hurts", () => {
    const { s, m } = setup([3, 5]);
    s.mobs = [{ id: 0, kind: "ranged", ...m, wait: 99999, cool: 0, hp: 10 }];
    const hp = s.hp;
    step(s);
    expect(s.shots).toHaveLength(1);
    expect(s.hp).toBe(hp);
    for (let i = 0; i < 30 && s.hp === hp; i += 1) { keepFed(s); step(s); }
    expect(s.hp).toBe(hp - W.ranged.damage);
    expect(s.shots).toHaveLength(0);
  });

  it("a spine stops at rock", () => {
    const { s, p } = setup([3, 5]);
    const start = openAround(s.seed, p, 30).find((c) => !open(s.seed, c.x + 1, c.y) && span(c, p) > 8)!;
    s.shots = [{ x: start.x, y: start.y, vx: W.ranged.shotSpeed, vy: 0, life: 30 }];
    const hp = s.hp;
    for (let i = 0; i < 4; i += 1) step(s);
    expect(s.shots).toHaveLength(0);
    expect(s.hp).toBe(hp);
  });

  it("blocks the way: the player can't walk through one", () => {
    const { s, m, p } = setup([1, 1]);
    s.mobs = [{ id: 0, kind: "melee", ...m, wait: 99999, cool: 99999, hp: 10 }];
    walkStep(s, m.x - p.x, m.y - p.y);
    for (let i = 0; i < 4; i += 1) step(s);
    expect(s.player).toEqual(p);
  });

  it("knocks the player out back to the base on the surface, losing more the further in", () => {
    const { s, m } = setup([1, 1]);
    addTo(s.inv, "iron", 10);
    s.mobs = [{ id: 0, kind: "melee", ...m, wait: 0, cool: 0, hp: 10 }];
    s.hp = 1;
    step(s);
    expect(s.z).toBe(0);
    expect(s.player).toEqual(BASE);
    expect(atBase(s)).toBe(true);
    expect(s.mobs).toEqual([]);
    expect(s.lost?.find((l) => l.id === "iron")?.n).toBeGreaterThan(0);
  });

  it("are gone on the way up, and come out again on the way down", () => {
    const s = denned();
    expect(leaveCave(s)).toBe(true);
    expect(s.mobs).toEqual([]);
    expect(enterCave(s)).toBe(true);
    expect(s.mobs.length).toBeGreaterThan(0);
  });
});

describe("underground saves", () => {
  it("keeps the layer, what was seen, found and mined, but not prospecting under way", () => {
    for (let seed = 1; seed < 200; seed += 1) {
      const s = createGame(seed);
      const site = s.sites.find((v) => v.cells?.some((c) => c.z === -1 && !c.wall));
      if (!site) continue;
      const cell = site.cells!.find((c) => c.z === -1 && !c.wall)!;
      s.z = -1;
      s.player = { x: cell.x, y: cell.y };
      probeFully(s);
      expect(mine(s)).toBe(true);
      startProbe(s);
      const back = loadSave(JSON.parse(JSON.stringify(s)))!;
      expect(back.version).toBe(SAVE_VERSION);
      expect(back.z).toBe(-1);
      expect(back.player).toEqual(s.player);
      expect(back.underSeen).toEqual(s.underSeen);
      const again = back.sites.find((v) => v.id === site.id)!;
      expect(again.found).toBe(true);
      expect(again.left).toBe(site.left);
      expect(back.probe).toBeNull();
      expect(siteHere(back)?.id).toBe(site.id);
      return;
    }
    throw new Error("no vein running on underground");
  });

  it("brings a player out of an old cave at its entrance, banks what its veins held, and numbers sites again", () => {
    const s = createGame(8);
    const door = s.sites.find((v) => v.ore === CAVE)!;
    const river = s.sites.find((v) => v.ore === "water")!;
    const before = countOf(s, "Lm");
    const old = JSON.parse(JSON.stringify(s));
    delete old.z;
    delete old.underSeen;
    old.version = 18;
    old.cave = door.id;
    old.caveSeen = { [door.id]: [1, 1, 0] };
    old.player = { x: 30, y: 20 };
    // An old cave vein sits early in the list, so everything after it moves down by one.
    old.sites.splice(1, 0, { id: 1, ore: "Lm", x: 30, y: 20, total: 100, left: 40, seed: 1, cave: door.id, found: true, cells: [{ x: 30, y: 20, left: 40, total: 100, found: true }] });
    old.sites.forEach((v: { id: number }, i: number) => { v.id = i; });
    old.cave = old.sites.find((v: { ore: string; x: number; y: number }) => v.ore === CAVE && v.x === door.x && v.y === door.y).id;
    const pump = { ...old.nodes[0], id: 999, type: PUMP, code: "zzz", siteId: river.id + 1 };
    old.nodes.push(pump);
    const back = loadSave(old)!;
    expect(back.z).toBe(0);
    expect(back.player).toEqual({ x: door.x, y: door.y });
    expect("cave" in back).toBe(false);
    expect("caveSeen" in back).toBe(false);
    expect(back.sites.some((v) => "cave" in v)).toBe(false);
    expect(back.sites.every((v, i) => v.id === i)).toBe(true);
    expect(countOf(back, "Lm")).toBe(before + 40);
    const newRiver = back.sites.find((v) => v.ore === "water" && v.x === river.x && v.y === river.y)!;
    expect(back.nodes.find((n) => n.id === 999)?.siteId).toBe(newRiver.id);
  });

  it("starts a new world on the surface with its cave entrance, and keeps it through a save", () => {
    const fresh = createGame(8);
    const back = loadSave(JSON.parse(JSON.stringify(fresh)))!;
    expect(back.z).toBe(0);
    const caves = fresh.sites.filter((site) => site.ore === CAVE).length;
    expect(caves).toBeGreaterThanOrEqual(1);
    expect(back.sites.filter((site) => site.ore === CAVE)).toHaveLength(caves);
    expect(back.sites.every((site, i) => site.id === i)).toBe(true);
  });
});
