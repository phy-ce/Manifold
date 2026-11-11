// Veins over several cells: strands on the surface and branching on below them, veins only underground, cell
// shares, working one cell at a time, emptied cells, prospecting cell by cell, cells buried in rock, and how many
// veins and caves there are.
import { describe, expect, it } from "vitest";
import { gameWithVeins } from "./testWorld";
import { BIOMES, CAVE, CAVES, DRUM, FORAGE, LAYERS, RICHNESS, SURFACE_ORES, VEINS, WATER, forageSeasons, inLayer, layerOres } from "../content";
import {
  GameState, createGame, harvestTarget, knownReserve, loadSave, mine, nextVeinCell, siteHere, standBeside, startProbe, step, walkTo,
} from "./game";
import {
  BASE, CELL_ASPECT, FLOOR, ROCK, Site, VeinCell, biomeAt, cellsOf, chunkSites, emptiedOn, generateSites, laterVeins, orderSites, rngFrom, rollVein, terrain, underCell, underSites,
} from "./world";

/** The cells of a vein on the surface, and those below it. */
const above = (cells: VeinCell[]) => cells.filter((c) => !c.z);
const below = (cells: VeinCell[]) => cells.filter((c) => c.z === -1);

const touching = (a: VeinCell, b: VeinCell) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)) === 1;
/** Every cell of a strand reaches every other through 8-neighbours. */
describe("search order", () => {
  it("keeps cave entrances when emptied veins are hidden: an entrance holds nothing to dig, so it is never emptied", () => {
    const site = (ore: string, left: number, x: number): Site => ({ id: x, ore, x, y: 0, total: left, left, seed: 1 });
    const sites = [site(CAVE, 0, 3), site("Lm", 0, 1), site("Lm", 40, 2)];
    const shown = orderSites(sites, (v) => v.x, true).map((v) => v.ore);
    expect(shown).toEqual(["Lm", CAVE]);
  });

  it("judges a vein emptied on one layer by that layer's cells alone", () => {
    const cell = (z: number, left: number): VeinCell => ({ x: 0, y: 0, z, left, total: 10 } as VeinCell);
    const site: Site = { id: 1, ore: "Lg", x: 0, y: 0, total: 20, left: 10, seed: 1, cells: [cell(0, 0), cell(-1, 10)] };
    expect(emptiedOn(site, 0)).toBe(true);
    expect(emptiedOn(site, -1)).toBe(false);
    expect(orderSites([site], () => 0, true, 0)).toEqual([]);
    expect(orderSites([site], () => 0, true, -1)).toEqual([site]);
  });
});

function contiguous(cells: VeinCell[]): boolean {
  const seen = new Set([0]);
  const queue = [0];
  while (queue.length) {
    const i = queue.pop()!;
    cells.forEach((c, j) => {
      if (!seen.has(j) && touching(cells[i], c)) {
        seen.add(j);
        queue.push(j);
      }
    });
  }
  return seen.size === cells.length;
}
const sum = (cells: VeinCell[]) => cells.reduce((n, c) => n + c.left, 0);
const isOre = (site: Pick<Site, "ore">) => site.ore !== CAVE && site.ore !== WATER && !FORAGE.includes(site.ore);

function checkSurfaceVein(seed: number, site: Omit<Site, "id">): void {
  // The total covers the branches below as well.
  expect(sum(site.cells!)).toBe(site.total);
  const cells = above(site.cells!);
  expect(cells.length).toBeGreaterThanOrEqual(3);
  expect(cells.length).toBeLessThanOrEqual(6);
  expect(contiguous(cells)).toBe(true);
  expect(new Set(cells.map((c) => `${c.x},${c.y}`)).size).toBe(cells.length);
  for (const c of cells) {
    expect(terrain(c.x, c.y, seed)[1]).not.toBe("t-water");
    expect(c.x === BASE.x && c.y === BASE.y).toBe(false);
  }
  expect(cells.some((c) => c.x === site.x && c.y === site.y)).toBe(true);
  expect(site.left).toBe(site.total);
}

describe("surface strands", () => {
  it("lays starter, later and chunk veins as strands of 3 to 6 joined cells on dry ground, shares summing to the total", () => {
    for (let seed = 1; seed <= 40; seed += 1) {
      for (const site of generateSites(seed).filter(isOre)) checkSurfaceVein(seed, site);
      for (const ore of SURFACE_ORES) for (const site of laterVeins(seed, ore)) checkSurfaceVein(seed, site);
      for (let cx = 2; cx < 8; cx += 1) {
        for (const site of chunkSites(seed, cx, -cx).filter(isOre)) checkSurfaceVein(seed, site);
      }
    }
  });

  it("keeps food and water to one cell, and no two sites of a chunk on one cell", () => {
    for (let cx = 2; cx < 40; cx += 1) {
      const sites = chunkSites(3, cx, 4);
      for (const site of sites.filter((v) => !isOre(v))) expect(site.cells).toBeUndefined();
      const cells = sites.flatMap((v) => cellsOf(v as Site).map((c) => `${c.z ?? 0},${c.x},${c.y}`));
      expect(new Set(cells).size).toBe(cells.length);
    }
  });

  it("puts the most ore in the middle of a strand and the least at its ends", () => {
    for (const site of generateSites(5).filter(isOre)) {
      const cells = above(site.cells!);
      const middle = cells[Math.floor((cells.length - 1) / 2)].left;
      expect(middle).toBeGreaterThan(cells[0].left);
      expect(middle).toBeGreaterThan(cells[cells.length - 1].left);
    }
  });

  it("makes rich veins longer than scarce ones", () => {
    expect(VEINS.surfaceCells.rich[0]).toBeGreaterThan(VEINS.surfaceCells.scarce[1]);
    expect(VEINS.caveCells.rich[0]).toBeGreaterThan(VEINS.caveCells.scarce[1]);
  });
});

describe("how many veins", () => {
  it("gives a chunk about a quarter as many ore veins as before, each four times as big", () => {
    let chunks = 0;
    let veins = 0;
    const totals: number[] = [];
    for (let cx = 4; cx < 44; cx += 1) {
      for (let cy = 4; cy < 44; cy += 1) {
        chunks += 1;
        const ore = chunkSites(21, cx, cy).filter(isOre);
        veins += ore.length;
        totals.push(...ore.map((v) => v.total));
      }
    }
    // It was one vein half the time and two a fifth, 0.9 a chunk; now the odds in data, less those that fell on water.
    const perChunk = veins / chunks;
    const [one, two] = VEINS.perChunk;
    expect(perChunk).toBeGreaterThan((one + two * 2) * 0.75);
    expect(perChunk).toBeLessThan(one + two * 2 + 0.02);
    // Sizes, against the grades' own sizes with surface odds; biomes that favour rich veins raise it a little.
    const odds = LAYERS[0].richness as Record<string, number>;
    const before = RICHNESS.reduce((n, r) => n + odds[r.id] * ((r.size[0] + r.size[1]) / 2), 0);
    const mean = totals.reduce((a, b) => a + b, 0) / totals.length;
    expect(VEINS.sizeScale).toBe(4);
    expect(mean).toBeGreaterThan(before * 4 * 0.85);
    expect(mean).toBeLessThan(before * 4 * 1.3);
    const rng = rngFrom(9);
    for (let i = 0; i < 200; i += 1) {
      const { total, rich } = rollVein(rng, "Lm");
      const [low, high] = RICHNESS.find((r) => r.id === rich)!.size;
      expect(total).toBeGreaterThanOrEqual(low * 4);
      expect(total).toBeLessThanOrEqual(high * 4);
    }
  });

  it("opens cave entrances in about 2% of chunks, three times that in the mountains", () => {
    expect(CAVES.chunkChance).toBe(0.02);
    expect(BIOMES.mountain.caves).toBe(3);
    let plain = 0;
    let caves = 0;
    for (let cx = 4; cx < 104; cx += 1) {
      for (let cy = 4; cy < 64; cy += 1) {
        const centre = biomeAt(cx * 16 + 8, cy * 16 + 8, 2);
        if ((BIOMES[centre].caves ?? 1) !== 1) continue;
        plain += 1;
        caves += chunkSites(2, cx, cy).filter((v) => v.ore === CAVE).length;
      }
    }
    expect(caves / plain).toBeGreaterThan(0.01);
    expect(caves / plain).toBeLessThan(0.03);
  });
});

describe("working a strand", () => {
  /** A fresh game standing on a surface vein's anchor. */
  function onVein(): { s: GameState; site: Site } {
    const s = gameWithVeins(4);
    const site = s.sites.find((v) => isOre(v) && v.cells)!;
    s.player = { x: site.x, y: site.y };
    return { s, site };
  }

  it("takes one per action from the cell underfoot only, pick or no pick", () => {
    const { s, site } = onVein();
    s.gear.hand = "iron_pick";
    const before = site.cells!.map((c) => c.left);
    const here = site.cells!.findIndex((c) => c.x === site.x && c.y === site.y);
    expect(mine(s)).toBe(true);
    expect(site.cells!.map((c) => c.left)).toEqual(before.map((n, i) => (i === here ? n - 1 : n)));
    expect(site.left).toBe(site.total - 1);
    expect(s.inv[0]).toEqual({ id: site.ore, n: 1 });
  });

  it("makes the player move once their cell is empty, and points at the nearest cell still holding ore", () => {
    const { s, site } = onVein();
    const here = site.cells!.find((c) => c.x === site.x && c.y === site.y)!;
    site.left -= here.left - 1;
    here.left = 1;
    expect(mine(s)).toBe(true);
    expect(here.left).toBe(0);
    expect(mine(s)).toBe(false);
    expect(site.left).toBeGreaterThan(0);
    // The panel still knows the vein, though nothing here can be dug.
    expect(siteHere(s)).toBe(site);
    expect(harvestTarget(s)).toBeUndefined();
    const next = nextVeinCell(s, site)!;
    const d = (c: VeinCell) => Math.hypot(c.x - s.player.x, (c.y - s.player.y) / CELL_ASPECT);
    // On the layer the player is on: cells below wait until they go down.
    expect(next.z).toBeUndefined();
    for (const c of above(site.cells!)) if (c.left > 0) expect(d(next)).toBeLessThanOrEqual(d(c));
    s.player = { x: next.x, y: next.y };
    expect(mine(s)).toBe(true);
  });

  it("keeps a vein without cells, as an older save has, working as one cell", () => {
    const s = gameWithVeins(4);
    const site = s.sites.find((v) => isOre(v) && v.cells)!;
    delete site.cells;
    site.left = 2;
    const back = loadSave(JSON.parse(JSON.stringify(s)))!;
    const old = back.sites.find((v) => v.id === site.id)!;
    back.player = { x: old.x, y: old.y };
    expect([mine(back), mine(back), mine(back)]).toEqual([true, true, false]);
    expect(old.left).toBe(0);
  });

  it("picks food only in its season and fills water only into an empty drum, through the same action", () => {
    const s = createGame(1);
    const berry = s.sites.find((v) => v.ore === "Be")!;
    s.player = { x: berry.x, y: berry.y };
    const inSeason = forageSeasons("Be")!.includes(s.season);
    expect(mine(s)).toBe(inSeason);
    const bank = { x: berry.x + 200, y: berry.y };
    s.sites.push({ id: s.sites.length, ore: WATER, ...bank, total: 300, left: 300, seed: 1 });
    s.player = { ...bank };
    expect(mine(s)).toBe(false);
    s.cursor = { id: DRUM.empty, n: 1 };
    expect(mine(s)).toBe(true);
    expect(s.sites.at(-1)!.left).toBe(300 - DRUM.liters);
  });
});

/** Checks each underground cell lies as its kind says: ore on the floor, in a wall beside open floor, or buried in rock. */
function checkUnderCells(seed: number, cells: VeinCell[]): { walls: number; buried: number } {
  let walls = 0;
  let buried = 0;
  for (const c of cells) {
    expect(c.found).toBe(false);
    const open = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => underCell(c.x + dx, c.y + dy, seed) !== ROCK);
    if (c.wall) {
      expect(underCell(c.x, c.y, seed)).toBe(ROCK);
      expect(!!c.buried).toBe(!open);
      if (c.buried) buried += 1;
      else walls += 1;
    } else expect(underCell(c.x, c.y, seed)).toBe(FLOOR);
  }
  return { walls, buried };
}

describe("veins running on underground", () => {
  it("carry on below about 70% of surface veins, branching out from right under the outcrop", () => {
    let veins = 0;
    let going = 0;
    let outcrops = 0;
    let branches = 0;
    let walls = 0;
    let buried = 0;
    for (let cx = 3; cx < 60; cx += 1) {
      for (let cy = 3; cy < 30; cy += 1) {
        for (const site of chunkSites(13, cx, cy).filter(isOre)) {
          veins += 1;
          const down = below(site.cells!);
          if (!down.length) continue;
          going += 1;
          const up = above(site.cells!);
          outcrops += up.length;
          branches += down.length;
          // Branches start right under outcrop cells, and every cell of the vein is its own.
          expect(down.some((c) => up.some((u) => u.x === c.x && u.y === c.y))).toBe(true);
          expect(new Set(down.map((c) => `${c.x},${c.y}`)).size).toBe(down.length);
          expect(sum(site.cells!)).toBe(site.total);
          for (const c of site.cells!) expect(c.left).toBeGreaterThanOrEqual(1);
          const kinds = checkUnderCells(13, down);
          walls += kinds.walls;
          buried += kinds.buried;
        }
      }
    }
    expect(veins).toBeGreaterThan(50);
    expect(going / veins).toBeGreaterThan(VEINS.below.chance - 0.15);
    expect(going / veins).toBeLessThan(VEINS.below.chance + 0.15);
    // There is more of a vein below than shows above.
    expect(branches).toBeGreaterThan(outcrops);
    expect(walls).toBeGreaterThan(0);
    expect(buried).toBeGreaterThan(0);
  });

  it("lay veins of their own underground, never seen from above, of Layer 1 ores", () => {
    let chunks = 0;
    const found: Omit<Site, "id">[] = [];
    for (let cx = -20; cx < 20; cx += 1) {
      for (let cy = -12; cy < 12; cy += 1) {
        chunks += 1;
        found.push(...underSites(21, cx, cy, layerOres(1, 0)));
      }
    }
    expect(found.length / chunks).toBeGreaterThan(VEINS.underChunk * 0.5);
    expect(found.length / chunks).toBeLessThan(VEINS.underChunk * 1.3);
    let walls = 0;
    for (const site of found) {
      expect(site.z).toBe(-1);
      expect(site.found).toBe(false);
      expect(inLayer(site.ore, 1)).toBe(true);
      expect(site.cells!.every((c) => c.z === -1)).toBe(true);
      expect(contiguous(site.cells!)).toBe(true);
      expect(sum(site.cells!)).toBe(site.total);
      expect(site.cells!.length).toBeGreaterThanOrEqual(VEINS.caveCells.scarce[0]);
      expect(site.cells!.length).toBeLessThanOrEqual(VEINS.caveCells.rich[1]);
      expect(underCell(site.x, site.y, 21)).toBe(FLOOR);
      walls += checkUnderCells(21, site.cells!).walls;
    }
    expect(walls).toBeGreaterThan(0);
  });

  it("sizes underground-only veins with Layer 1 odds", () => {
    const sizes: number[] = [];
    for (let cx = -40; cx < 40; cx += 1) for (let cy = -30; cy < 30; cy += 1) sizes.push(...underSites(5, cx, cy, layerOres(1, 0)).map((v) => v.total));
    const odds = LAYERS[1].richness as Record<string, number>;
    const expected = RICHNESS.reduce((n, r) => n + odds[r.id] * ((r.size[0] + r.size[1]) / 2), 0) * VEINS.sizeScale;
    const mean = sizes.reduce((a, b) => a + b, 0) / sizes.length;
    expect(mean).toBeGreaterThan(expected * 0.75);
    expect(mean).toBeLessThan(expected * 1.35);
  });

  /** A game underground under a vein running on below, chosen by `pick`, with every underground cell of it found. */
  function under(pick: (cells: VeinCell[]) => boolean): { s: GameState; site: Site } {
    for (let seed = 1; seed < 400; seed += 1) {
      const s = createGame(seed);
      const site = s.sites.find((v) => v.cells && pick(below(v.cells)));
      if (!site) continue;
      s.z = -1;
      for (const c of below(site.cells!)) c.found = true;
      site.found = true;
      return { s, site };
    }
    throw new Error("no such vein");
  }

  it("works a wall cell from the floor beside it, and leaves plain rock behind when it runs out", () => {
    const { s, site } = under((cells) => cells.some((c) => c.wall && !c.buried));
    const wall = below(site.cells!).find((c) => c.wall && !c.buried)!;
    // Other cells below are emptied first, so only the wall is left to work from where the player stands.
    for (const c of below(site.cells!)) if (c !== wall) {
      site.left -= c.left;
      c.left = 0;
    }
    s.player = standBeside(s, wall.x, wall.y)!;
    expect(underCell(s.player.x, s.player.y, s.seed)).not.toBe(ROCK);
    expect(harvestTarget(s)?.cell).toBe(wall);
    const left = wall.left;
    expect(mine(s)).toBe(true);
    expect(wall.left).toBe(left - 1);
    site.left -= wall.left;
    wall.left = 0;
    expect(mine(s)).toBe(false);
    // Still rock: no walking into it.
    expect(underCell(wall.x, wall.y, s.seed)).toBe(ROCK);
    walkTo(s, wall);
    expect(s.path).toEqual([]);
  });

  it("leaves walkable stone floor where a floor cell runs out", () => {
    const { s, site } = under((cells) => cells.some((c) => !c.wall));
    const floor = below(site.cells!).find((c) => !c.wall)!;
    s.player = { x: floor.x, y: floor.y };
    site.left -= floor.left - 1;
    floor.left = 1;
    expect(mine(s)).toBe(true);
    expect(floor.left).toBe(0);
    expect(underCell(floor.x, floor.y, s.seed)).toBe(FLOOR);
    expect(siteHere(s)).toBe(site);
  });

  it("finds by prospecting only the underground cells within its radius, and adds them to what the player knows", () => {
    const { s, site } = under((cells) => cells.some((c) => !c.wall));
    for (const c of site.cells!) delete c.found;
    site.found = false;
    const known = knownReserve(s, site).total;
    const floor = below(site.cells!).find((c) => !c.wall)!;
    s.player = { x: floor.x, y: floor.y };
    expect(siteHere(s)).toBeUndefined();
    expect(startProbe(s)).toBe(true);
    for (let i = 0; i < CAVES.probeMs / 100; i += 1) step(s);
    for (const other of s.sites) {
      for (const c of below(other.cells ?? [])) {
        const inReach = Math.hypot(c.x - s.player.x, (c.y - s.player.y) / CELL_ASPECT) <= CAVES.probeRadius;
        expect(!!c.found).toBe(inReach);
      }
    }
    // The surface cells were never prospecting's to find.
    expect(above(site.cells!).every((c) => c.found === undefined)).toBe(true);
    expect(site.found).toBe(true);
    expect(siteHere(s)).toBe(site);
    expect(knownReserve(s, site).total).toBeGreaterThan(known);
  });

  it("never digs a buried cell in S1, so the vein never runs dry while only buried cells are left", () => {
    const { s, site } = under((cells) => cells.some((c) => c.buried));
    // Dig every cell that can be dug, on either layer, standing on it or beside it.
    for (const c of site.cells!.filter((c) => !c.buried)) {
      s.z = c.z ?? 0;
      s.player = c.wall ? standBeside(s, c.x, c.y)! : { x: c.x, y: c.y };
      for (let guard = 0; c.left > 0 && guard < 10000; guard += 1) {
        s.inv.fill(null);
        expect(mine(s)).toBe(true);
      }
    }
    s.z = -1;
    const buried = site.cells!.filter((c) => c.buried);
    expect(site.left).toBe(sum(buried));
    expect(site.left).toBeGreaterThan(0);
    for (const c of buried) expect(c.left).toBeGreaterThan(0);
    // Beside a buried cell, nothing is there to dig.
    for (const c of buried) {
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        if (underCell(c.x + dx, c.y + dy, s.seed) === ROCK) continue;
        s.player = { x: c.x + dx, y: c.y + dy };
        s.inv.fill(null);
        expect(harvestTarget(s)?.cell.buried).not.toBe(true);
      }
    }
  });
});
