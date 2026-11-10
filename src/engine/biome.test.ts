import { describe, expect, it } from "vitest";
import { BIOMES } from "../content";
import { biomeAt, chunkSites, riverBanks, terrain } from "./world";

/** Biomes over a wide square of the map, sampled every few cells. */
function survey(seed: number, half = 1500, stepBy = 9): Record<string, number> {
  const count: Record<string, number> = {};
  for (let x = -half; x <= half; x += stepBy) {
    for (let y = -half; y <= half; y += stepBy) {
      const id = biomeAt(x, y, seed);
      count[id] = (count[id] ?? 0) + 1;
    }
  }
  return count;
}

describe("biomes", () => {
  it("gives the same biome for the same seed and cell", () => {
    for (let i = 0; i < 50; i += 1) expect(biomeAt(i * 37, i * -23, 5)).toBe(biomeAt(i * 37, i * -23, 5));
  });

  it("keeps the base on open plain, and only plain or forest for a good way out", () => {
    for (const seed of [1, 2, 3, 99]) {
      expect(biomeAt(0, 0, seed)).toBe("plains");
      for (let a = 0; a < 32; a += 1) {
        const x = Math.round(Math.cos(a) * 60);
        const y = Math.round(Math.sin(a) * 60 * 0.6);
        expect(["plains", "forest"]).toContain(biomeAt(x, y, seed));
      }
    }
  });

  it("has all six across a wide map, none crowding out the rest", () => {
    for (const seed of [1, 7]) {
      const count = survey(seed);
      const total = Object.values(count).reduce((a, b) => a + b, 0);
      for (const id of Object.keys(BIOMES)) {
        expect(count[id] ?? 0, id).toBeGreaterThan(total * 0.03);
        expect(count[id] ?? 0, id).toBeLessThan(total * 0.5);
      }
    }
  });

  it("lays biomes in whole regions, never specks: away from the base no patch is smaller than a good field", () => {
    const [x0, y0, w, h] = [200, 120, 360, 220];
    for (const seed of [1, 4, 7]) {
      const grid = Array.from({ length: h }, (_, y) => Array.from({ length: w }, (_, x) => biomeAt(x0 + x, y0 + y, seed)));
      const seen = Array.from({ length: h }, () => new Array<boolean>(w).fill(false));
      let smallest = Infinity;
      for (let y = 0; y < h; y += 1) {
        for (let x = 0; x < w; x += 1) {
          if (seen[y][x]) continue;
          // Flood one patch; a patch cut by the window's edge may be bigger than it looks, so it isn't counted.
          const id = grid[y][x];
          const todo = [[x, y]];
          seen[y][x] = true;
          let size = 0;
          let edge = false;
          while (todo.length) {
            const [cx, cy] = todo.pop()!;
            size += 1;
            if (cx === 0 || cy === 0 || cx === w - 1 || cy === h - 1) edge = true;
            for (const [nx, ny] of [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]]) {
              if (nx < 0 || ny < 0 || nx >= w || ny >= h || seen[ny][nx] || grid[ny][nx] !== id) continue;
              seen[ny][nx] = true;
              todo.push([nx, ny]);
            }
          }
          if (!edge) smallest = Math.min(smallest, size);
        }
      }
      expect(smallest, `seed ${seed}`).toBeGreaterThan(150);
    }
  });

  it("runs rivers only through plain and forest, and finds a river near the base", () => {
    const seed = 3;
    for (let x = -1200; x < 1200; x += 3) {
      for (let y = -600; y < 600; y += 17) {
        if (terrain(x, y, seed)[1] !== "t-water") continue;
        const water = BIOMES[biomeAt(x, y, seed)].water;
        expect(["river", "pond", "oasis"]).toContain(water);
      }
    }
    for (const bank of riverBanks(seed)) expect(Math.abs(bank.x)).toBeLessThan(80);
  });

  it("raises hills by biome: mountains are full of them, the rest have few, and only mountains reach M", () => {
    const cells: Record<string, number> = {};
    const hills: Record<string, number> = {};
    const tallest: Record<string, number> = {};
    for (let x = -1500; x < 1500; x += 3) {
      for (let y = -900; y < 900; y += 7) {
        const id = biomeAt(x, y, 2);
        const [, cls, height] = terrain(x, y, 2);
        if (cls === "t-water" || cls === "t-ice") continue;
        cells[id] = (cells[id] ?? 0) + 1;
        if (cls === "t-hill") hills[id] = (hills[id] ?? 0) + 1;
        tallest[id] = Math.max(tallest[id] ?? 0, height);
      }
    }
    const share = (id: string) => (hills[id] ?? 0) / (cells[id] ?? 1);
    expect(share("mountain")).toBeGreaterThan(0.35);
    for (const id of ["plains", "forest", "desert"]) {
      expect([id, share(id) < 0.12]).toEqual([id, true]);
      expect([id, tallest[id]]).toEqual([id, 1]);
    }
    expect(share("marsh")).toBe(0);
    expect(tallest.snow).toBeLessThanOrEqual(2);
    expect(tallest.mountain).toBe(3);
  });

  it("puts ice, not open water, on the snow, and it can be walked on", () => {
    let ice = 0;
    for (let x = -1500; x < 1500; x += 2) {
      for (let y = -900; y < 900; y += 11) {
        const cls = terrain(x, y, 1)[1];
        if (biomeAt(x, y, 1) === "snow") expect(cls).not.toBe("t-water");
        if (cls === "t-ice") ice += 1;
      }
    }
    expect(ice).toBeGreaterThan(0);
  });

  it("tilts the ore by biome: copper in the desert, magnetite on the snow", () => {
    const count: Record<string, Record<string, number>> = {};
    for (let cx = -90; cx < 90; cx += 1) {
      for (let cy = -90; cy < 90; cy += 2) {
        for (const site of chunkSites(1, cx, cy)) {
          const id = biomeAt(site.x, site.y, 1);
          count[id] ??= {};
          count[id][site.ore] = (count[id][site.ore] ?? 0) + 1;
        }
      }
    }
    const share = (biome: string, ore: string) => {
      const all = Object.entries(count[biome] ?? {}).filter(([id]) => id !== "water" && id !== "cave").reduce((a, [, n]) => a + n, 0);
      return (count[biome]?.[ore] ?? 0) / Math.max(1, all);
    };
    expect(share("desert", "Ml")).toBeGreaterThan(share("plains", "Ml") * 1.4);
    expect(share("snow", "Mt")).toBeGreaterThan(0);
    expect(share("plains", "Mt")).toBe(0);
    // Marshes, oases and the ice give water of their own.
    expect((count.marsh?.water ?? 0) + (count.desert?.water ?? 0) + (count.snow?.water ?? 0)).toBeGreaterThan(0);
  });
});
