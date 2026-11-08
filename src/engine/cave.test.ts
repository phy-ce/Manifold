// Natural caves (Layer 1) and prospecting: generation, movement, finding and mining veins, hazards, saves.
import { describe, expect, it } from "vitest";
import { CAVE, CAVES, LAYERS, SURFACE_ORES, familyOf, inLayer, layerOres, matches } from "../content";
import {
  GameState, addTo, atBase, atCaveExit, caveDoorHere, createGame, currentCave, enterCave, leaveCave, loadSave, mine,
  siteHere, startProbe, step, walkStep, walkTo,
} from "./game";
import { BASE, CELL_ASPECT, FLOOR, HABITAT, ROCK, caveCell, caveMap, caveSites, chunkSites, nearCave, terrain } from "./world";

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
    expect(layerOres(1, 2)).toContain("Ls");
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

  it("hurts on creature habitat", () => {
    const s = inside();
    const { map } = currentCave(s)!;
    const den = [...map.cells.keys()].find((i) => map.cells[i] === HABITAT)!;
    const x = den % map.width;
    const y = Math.floor(den / map.width);
    const from = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => ({ x: x + dx, y: y + dy })).find((p) => caveCell(map, p.x, p.y) === FLOOR)!;
    s.player = from;
    walkStep(s, x - from.x, y - from.y);
    const hp = s.hp;
    while (s.path.length) step(s);
    expect(s.player).toEqual({ x, y });
    expect(s.hp).toBe(hp - CAVES.damage);
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

  it("collapses back to the base on the surface, losing more the further in", () => {
    const s = inside();
    const { map } = currentCave(s)!;
    addTo(s.inv, "iron", 10);
    const den = [...map.cells.keys()].find((i) => map.cells[i] === HABITAT)!;
    const x = den % map.width;
    const y = Math.floor(den / map.width);
    const from = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => ({ x: x + dx, y: y + dy })).find((p) => caveCell(map, p.x, p.y) === FLOOR)!;
    s.player = from;
    s.hp = 1;
    walkStep(s, x - from.x, y - from.y);
    while (s.path.length) step(s);
    expect(s.cave).toBeNull();
    expect(s.player).toEqual(BASE);
    expect(atBase(s)).toBe(true);
    expect(s.lost?.find((l) => l.id === "iron")?.n).toBeGreaterThan(0);
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

  it("gives an old save its cave entrance, standing on the surface", () => {
    const s = createGame(8);
    const old = JSON.parse(JSON.stringify(s));
    old.version = 14;
    // Before caves there was no entrance, and site ids ran on with no gap.
    old.sites = old.sites.filter((site: { ore: string }) => site.ore !== CAVE).map((site: { id: number }, i: number) => ({ ...site, id: i }));
    delete old.cave;
    delete old.caveSeen;
    delete old.probe;
    const back = loadSave(old)!;
    expect(back.cave).toBeNull();
    expect(back.sites.filter((site) => site.ore === CAVE)).toHaveLength(1);
    expect(back.sites.every((site, i) => site.id === i)).toBe(true);
  });
});
