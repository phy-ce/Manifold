// Natural caves (Layer 1) and prospecting: generation, movement, finding and mining veins, hazards, saves.
import { describe, expect, it } from "vitest";
import { CAVE, CAVES, LAYERS, SURFACE_ORES, familyOf, inLayer, layerOres, matches } from "../content";
import {
  GameState, addTo, atBase, atCaveExit, caveDoorHere, createGame, currentCave, enterCave, leaveCave, loadSave, mine,
  clearLine, siteHere, startProbe, step, walkStep, walkTo,
} from "./game";
import { BASE, CELL_ASPECT, FLOOR, HABITAT, ROCK, caveCell, caveMap, caveSites, chunkSites, nearCave, safePath, terrain } from "./world";

/** Steps until the walk is over, keeping the player fed and healthy so nothing else interferes. */
function arrive(s: GameState): void {
  for (let guard = 0; s.path.length && guard < 20000; guard += 1) {
    s.hp = 100;
    s.hunger = 100;
    step(s);
  }
}
/** Into the cave near the base of a fresh game. */
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

describe("ore layers", () => {
  it("lets each ore turn up over a range of layers, not one deep ore per layer", () => {
    expect(inLayer("Lm", 0) && inLayer("Lm", 1)).toBe(true);
    expect(inLayer("Hm", 0)).toBe(false);
    expect(inLayer("Hm", 1) && inLayer("Hm", 2)).toBe(true);
    expect(inLayer("Mt", 1)).toBe(false);
    const layer1 = layerOres(1, 0);
    expect(layer1).toEqual(expect.arrayContaining(["Lm", "Hm", "Ml", "Cc", "Lg", "Bt", "Kn"]));
    expect(layer1).not.toContain("Mt");
    // Limestone opens with its stage, in caves as on the surface.
    expect(layer1).not.toContain("Ls");
    expect(layerOres(1, 3)).toContain("Ls");
  });

  it("smelts cave ores like their surface cousins, by family", () => {
    expect(matches("Hm", "iron_ore")).toBe(true);
    expect(matches("Bt", "coal")).toBe(true);
    expect(matches("Cc", "copper_ore")).toBe(true);
  });

  it("weights surface ore by family: iron and coal, then copper, then clay; food apart", () => {
    const count: Record<string, number> = {};
    let ore = 0;
    let food = 0;
    for (let cx = 3; cx < 60; cx += 1) {
      for (let cy = 3; cy < 60; cy += 1) {
        for (const site of chunkSites(11, cx, cy)) {
          if (site.ore === CAVE) continue;
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
    expect(food / (ore + food)).toBeLessThan(0.3);
  });
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

  it("can't be mined, and is entered only by standing on it", () => {
    const s = createGame(3);
    expect(enterCave(s)).toBe(false);
    const door = s.sites.find((site) => site.ore === CAVE)!;
    walkTo(s, door);
    arrive(s);
    expect(caveDoorHere(s)).toBe(door);
    expect(mine(s)).toBe(false);
    expect(enterCave(s)).toBe(true);
    expect(s.cave).toBe(door.id);
    expect(atBase(s)).toBe(false);
  });
});

describe("cave layout", () => {
  it("is the same every time for the same entrance", () => {
    const a = caveMap(12345);
    const b = caveMap(12345);
    expect(b).toBe(a);
    expect(caveMap(999).cells).not.toEqual(a.cells);
  });

  it("can reach every open cell from the entrance, which is open and safe", () => {
    for (const seed of [1, 77, 4242, 90001]) {
      const map = caveMap(seed);
      expect(caveCell(map, map.entry.x, map.entry.y)).toBe(FLOOR);
      const open = [...map.cells.keys()].filter((i) => map.cells[i] !== ROCK);
      const seen = new Set([map.entry.y * map.width + map.entry.x]);
      const queue = [...seen];
      while (queue.length) {
        const c = queue.pop()!;
        const x = c % map.width;
        const y = Math.floor(c / map.width);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const n = (y + dy) * map.width + x + dx;
          if (caveCell(map, x + dx, y + dy) !== ROCK && !seen.has(n)) {
            seen.add(n);
            queue.push(n);
          }
        }
      }
      expect(seen.size).toBe(open.length);
      expect(open.length).toBeGreaterThan(map.width * map.height * 0.2);
      expect([...map.cells].some((c) => c === HABITAT)).toBe(true);
    }
  });

  it("lays out a few hidden Layer 1 veins on open floor, away from the entrance", () => {
    for (const seed of [5, 61, 700]) {
      const map = caveMap(seed);
      const veins = caveSites(seed, 9, layerOres(1, 0));
      expect(veins.length).toBeGreaterThanOrEqual(CAVES.sites[0]);
      expect(veins.length).toBeLessThanOrEqual(CAVES.sites[1]);
      expect(new Set(veins.map((v) => `${v.x},${v.y}`)).size).toBe(veins.length);
      for (const v of veins) {
        expect(caveCell(map, v.x, v.y)).toBe(FLOOR);
        expect(Math.hypot(v.x - map.entry.x, v.y - map.entry.y)).toBeGreaterThanOrEqual(6);
        expect(inLayer(v.ore, 1)).toBe(true);
        expect(v.found).toBe(false);
        expect(v.cave).toBe(9);
      }
    }
  });

  it("sizes cave veins with Layer 1 odds: a little more than the surface, nothing like a mountain", () => {
    const sizes: number[] = [];
    let rich = 0;
    for (let seed = 1; seed <= 1500; seed += 1) {
      for (const v of caveSites(seed * 13, 0, ["Lm", "Hm", "Lg", "Bt", "Ml", "Cc", "Kn"])) {
        sizes.push(v.total);
        if (v.rich === "rich") rich += 1;
      }
    }
    const mean = sizes.reduce((a, b) => a + b, 0) / sizes.length;
    // Expected: 24 x 30% + 80 x 67% + 240 x 3% = about 68, against 58 on the surface.
    expect(mean).toBeGreaterThan(60);
    expect(mean).toBeLessThan(76);
    expect(rich / sizes.length).toBeGreaterThan(LAYERS[1].richness.rich * 0.5);
    expect(rich / sizes.length).toBeLessThan(LAYERS[1].richness.rich * 1.6);
    expect(Math.max(...sizes)).toBeLessThanOrEqual(360);
  });
});

describe("in a cave", () => {
  it("lays out its veins once, however often the cave is entered", () => {
    const s = inside();
    const count = s.sites.filter((v) => v.cave === s.cave).length;
    expect(count).toBeGreaterThanOrEqual(CAVES.sites[0]);
    expect(leaveCave(s)).toBe(true);
    expect(enterCave(s)).toBe(true);
    expect(s.sites.filter((v) => v.cave === s.cave)).toHaveLength(count);
  });

  it("never walks through rock or cuts a corner between two rocks", () => {
    const s = inside();
    const { map } = currentCave(s)!;
    const far = [...map.cells.keys()].filter((i) => map.cells[i] === FLOOR).at(-1)!;
    walkTo(s, { x: far % map.width, y: Math.floor(far / map.width) });
    expect(s.path.length).toBeGreaterThan(0);
    let at = { ...s.player };
    for (const cell of s.path) {
      expect(caveCell(map, cell.x, cell.y)).not.toBe(ROCK);
      if (cell.x !== at.x && cell.y !== at.y) {
        expect(caveCell(map, cell.x, at.y)).not.toBe(ROCK);
        expect(caveCell(map, at.x, cell.y)).not.toBe(ROCK);
      }
      at = cell;
    }
    // A walk into solid rock goes nowhere, rather than straight through.
    const rock = [...map.cells.keys()].find((i) => map.cells[i] === ROCK)!;
    walkTo(s, { x: rock % map.width, y: Math.floor(rock / map.width) });
    expect(s.path).toEqual([]);
  });

  it("stops a key step at rock", () => {
    const s = inside();
    const { map } = currentCave(s)!;
    const { x, y } = s.player;
    for (const [dx, dy] of [[0, -1], [1, 0], [-1, 0], [0, 1]]) {
      expect(walkStep(s, dx, dy)).toBe(caveCell(map, x + dx, y + dy) !== ROCK);
      s.path = [];
    }
  });

  it("hides veins until prospecting finds the ones in reach", () => {
    const s = inside();
    const vein = s.sites.find((v) => v.cave === s.cave)!;
    s.player = { x: vein.x, y: vein.y };
    expect(siteHere(s)).toBeUndefined();
    expect(mine(s)).toBe(false);
    probeFully(s);
    expect(vein.found).toBe(true);
    expect(siteHere(s)).toBe(vein);
    // Mining a found cave vein works like any other: one per strike, and it runs down.
    const left = vein.left;
    expect(mine(s)).toBe(true);
    expect(vein.left).toBe(left - 1);
    // Veins out of reach stay hidden.
    for (const other of s.sites.filter((v) => v.cave === s.cave && v !== vein)) {
      const dist = Math.hypot(other.x - vein.x, (other.y - vein.y) / CELL_ASPECT);
      if (dist > CAVES.probeRadius) expect(other.found).toBe(false);
    }
  });

  it("takes its full time to prospect, and walking off calls it off", () => {
    const s = inside();
    expect(startProbe(s)).toBe(true);
    expect(startProbe(s)).toBe(false);
    for (let i = 0; i < CAVES.probeMs / 100 - 1; i += 1) step(s);
    expect(s.probe).not.toBeNull();
    const { map } = currentCave(s)!;
    const way = [[1, 0], [-1, 0], [0, 1], [0, -1]].find(([dx, dy]) => caveCell(map, s.player.x + dx, s.player.y + dy) !== ROCK)!;
    walkStep(s, way[0], way[1]);
    step(s);
    expect(s.probe).toBeNull();
  });

  it("can't prospect on the surface", () => {
    expect(startProbe(createGame(3))).toBe(false);
  });


  it("goes out only from the way out, back onto the entrance", () => {
    const s = inside();
    const { door, map } = currentCave(s)!;
    expect(atCaveExit(s)).toBe(true);
    const way = [[1, 0], [-1, 0], [0, 1], [0, -1]].find(([dx, dy]) => caveCell(map, map.entry.x + dx, map.entry.y + dy) !== ROCK)!;
    walkStep(s, way[0], way[1]);
    while (s.path.length) step(s);
    expect(leaveCave(s)).toBe(false);
    walkTo(s, map.entry);
    arrive(s);
    expect(leaveCave(s)).toBe(true);
    expect(s.cave).toBeNull();
    expect(s.player).toEqual({ x: door.x, y: door.y });
  });

});

describe("cave creatures", () => {
  const W = CAVES.creatures;
  const span = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
  /** A spot for the player deep in the cave, and one for a creature `near` cells away with open cave between. */
  function setup(near: number[]) {
    const s = inside();
    const { map } = currentCave(s)!;
    const open = [...map.cells.keys()].filter((i) => map.cells[i] !== ROCK).map((i) => ({ x: i % map.width, y: Math.floor(i / map.width) }));
    for (const p of open.filter((c) => span(c, map.entry) > 12)) {
      const m = open.find((c) => span(c, p) >= near[0] && span(c, p) <= near[1] && span(c, map.entry) > W.safeRadius && clearLine(map, c, p));
      if (m) {
        s.player = p;
        s.mobs = [];
        s.shots = [];
        return { s, map, p, m };
      }
    }
    throw new Error("no spot");
  }
  const keepFed = (s: GameState) => { s.hunger = 100; };

  it("come out of their dens each visit, never near the way out", () => {
    const s = inside();
    const { map } = currentCave(s)!;
    expect(s.mobs.length).toBeGreaterThan(0);
    expect(s.mobs.length).toBeLessThanOrEqual(W.count[1]);
    for (const mob of s.mobs) {
      expect(caveCell(map, mob.x, mob.y)).not.toBe(ROCK);
      expect(span(mob, map.entry)).toBeGreaterThan(W.safeRadius);
    }
    expect(s.mobs.some((m) => m.kind === "melee") || s.mobs.some((m) => m.kind === "ranged")).toBe(true);
  });

  it("a wolf bites when beside the player, then waits before biting again", () => {
    const { s, m } = setup([1, 1]);
    s.mobs = [{ id: 0, kind: "melee", ...m, wait: 0, cool: 0 }];
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
    s.mobs = [{ id: 0, kind: "melee", ...m, wait: 0, cool: 5000 }];
    const before = span(m, p);
    for (let i = 0; i < (W.melee.moveMs / 100) * 2; i += 1) { keepFed(s); step(s); }
    expect(span(s.mobs[0], s.player)).toBeLessThan(before);
  });

  it("a wolf tracks the player round rock within hunting range, without seeing it", () => {
    const s = inside();
    const { map } = currentCave(s)!;
    const open = [...map.cells.keys()].filter((i) => map.cells[i] !== ROCK).map((i) => ({ x: i % map.width, y: Math.floor(i / map.width) }));
    let pair: { p: { x: number; y: number }; m: { x: number; y: number } } | undefined;
    for (const p of open.filter((c) => span(c, map.entry) > 12)) {
      const m = open.find((c) => span(c, p) >= 8 && span(c, p) <= W.hunt && span(c, map.entry) > W.safeRadius && !clearLine(map, c, p));
      if (m) { pair = { p, m }; break; }
    }
    expect(pair).toBeDefined();
    s.player = pair!.p;
    s.shots = [];
    s.mobs = [{ id: 0, kind: "melee", ...pair!.m, wait: 0, cool: 5000 }];
    const path = (a: { x: number; y: number }) => safePath(a, s.player, () => 0, (x, y) => caveCell(map, x, y) === ROCK).length;
    const before = path(pair!.m);
    for (let i = 0; i < (W.melee.moveMs / 100) * 4; i += 1) { keepFed(s); step(s); }
    expect(path(s.mobs[0])).toBeLessThan(before);
  });

  it("a salamander shoots a spine that flies across and hurts", () => {
    const { s, m } = setup([3, 5]);
    s.mobs = [{ id: 0, kind: "ranged", ...m, wait: 99999, cool: 0 }];
    const hp = s.hp;
    step(s);
    expect(s.shots).toHaveLength(1);
    expect(s.hp).toBe(hp);
    for (let i = 0; i < 30 && s.hp === hp; i += 1) { keepFed(s); step(s); }
    expect(s.hp).toBe(hp - W.ranged.damage);
    expect(s.shots).toHaveLength(0);
  });

  it("a spine stops at rock", () => {
    const { s, map, p } = setup([3, 5]);
    // Aim a spine straight at the nearest rock to the right, away from the player.
    const start = [...map.cells.keys()].map((i) => ({ x: i % map.width, y: Math.floor(i / map.width) }))
      .find((c) => caveCell(map, c.x, c.y) !== ROCK && caveCell(map, c.x + 1, c.y) === ROCK && span(c, p) > 8)!;
    s.shots = [{ x: start.x, y: start.y, vx: W.ranged.shotSpeed, vy: 0, life: 30 }];
    const hp = s.hp;
    for (let i = 0; i < 4; i += 1) step(s);
    expect(s.shots).toHaveLength(0);
    expect(s.hp).toBe(hp);
  });

  it("blocks the way: the player can't walk through one", () => {
    const { s, m, p } = setup([1, 1]);
    s.mobs = [{ id: 0, kind: "melee", ...m, wait: 99999, cool: 99999 }];
    walkStep(s, m.x - p.x, m.y - p.y);
    for (let i = 0; i < 4; i += 1) step(s);
    expect(s.player).toEqual(p);
  });

  it("knocks the player out back to the base on the surface, losing more the further in", () => {
    const { s, m } = setup([1, 1]);
    addTo(s.inv, "iron", 10);
    s.mobs = [{ id: 0, kind: "melee", ...m, wait: 0, cool: 0 }];
    s.hp = 1;
    step(s);
    expect(s.cave).toBeNull();
    expect(s.player).toEqual(BASE);
    expect(atBase(s)).toBe(true);
    expect(s.mobs).toEqual([]);
    expect(s.lost?.find((l) => l.id === "iron")?.n).toBeGreaterThan(0);
  });

  it("are gone on the way out, and back on the next visit", () => {
    const s = inside();
    const { map } = currentCave(s)!;
    walkTo(s, map.entry);
    arrive(s);
    leaveCave(s);
    expect(s.mobs).toEqual([]);
    expect(enterCave(s)).toBe(true);
    expect(s.mobs.length).toBeGreaterThan(0);
  });
});

describe("cave saves", () => {
  it("keeps the cave, what was found and what was mined, but not prospecting under way", () => {
    const s = inside();
    const vein = s.sites.find((v) => v.cave === s.cave)!;
    s.player = { x: vein.x, y: vein.y };
    probeFully(s);
    mine(s);
    startProbe(s);
    const back = loadSave(JSON.parse(JSON.stringify(s)))!;
    expect(back.cave).toBe(s.cave);
    expect(back.player).toEqual(s.player);
    const again = back.sites.find((v) => v.id === vein.id)!;
    expect(again.found).toBe(true);
    expect(again.left).toBe(vein.left);
    expect(back.probe).toBeNull();
    expect(siteHere(back)?.id).toBe(vein.id);
  });

  it("starts a new world with its cave entrance on the surface, and keeps it through a save", () => {
    const back = loadSave(JSON.parse(JSON.stringify(createGame(8))))!;
    expect(back.cave).toBeNull();
    expect(back.sites.filter((site) => site.ore === CAVE)).toHaveLength(1);
    expect(back.sites.every((site, i) => site.id === i)).toBe(true);
  });
});
