// What the player sees: a small circle all round, a fan reaching further the way they last walked, less
// underground; and how much of a vein they know of.
import { describe, expect, it } from "vitest";
import { CAVE } from "../content";
import { CAVE_DARK, FAN_DEGREES, REVEAL, SIGHT_AROUND, walkStep, createGame, enterCave, isRevealed, isVisible, knownReserve, step, underSeenAt, visionAt, walkTo } from "./game";
import { ROCK, Site, terrain, underCell } from "./world";

/** A world with the player on flat open plain, facing east after one step. */
function facingEast() {
  const s = createGame(1);
  s.player = { x: 0, y: 0 };
  walkTo(s, { x: 1, y: 0 });
  for (let i = 0; i < 20 && s.path.length; i += 1) step(s);
  return s;
}

describe("sight", () => {
  it("turns the player the way a key points even when they can't step, and the fan turns with them", () => {
    const s = facingEast();
    const { x, y } = s.player;
    s.inv[0] = { id: "iron", n: 999 }; // far too heavy to move
    expect(walkStep(s, -1, 0)).toBe(false);
    expect(s.player).toEqual({ x, y });
    expect(s.facing).toEqual({ x: -1, y: 0 });
    expect(isVisible(s, x - 5, y)).toBe(true);
    expect(isVisible(s, x + 3, y)).toBe(false);
  });

  it("sees a small circle all round and a fan ahead, the way the player last walked", () => {
    const s = facingEast();
    const { x, y } = s.player;
    expect(terrain(x, y, s.seed)[2]).toBe(0);
    expect(s.facing).toEqual({ x: 1, y: 0 });
    expect(SIGHT_AROUND.surface).toBe(2);
    expect(FAN_DEGREES).toBe(90);
    expect(visionAt(s, s.player)).toBe(REVEAL);
    expect(REVEAL).toBe(5);
    // Ahead at 5: seen. Behind at 3: not. Beside at 2: seen.
    expect(isVisible(s, x + 5, y)).toBe(true);
    expect(isVisible(s, x - 3, y)).toBe(false);
    expect(isVisible(s, x - 2, y)).toBe(true);
    expect(isVisible(s, x, y + 1)).toBe(true);
    // Off to the side, past the circle, is outside the fan; past the reach ahead too.
    expect(isVisible(s, x, y + 3)).toBe(false);
    expect(isVisible(s, x + 6, y)).toBe(false);
    // Walking reveals the fan on the map as well.
    expect(isRevealed(s, x + 5, y)).toBe(true);
  });

  it("sees the fan's reach all round before the first step", () => {
    const s = createGame(1);
    s.player = { x: 0, y: 0 };
    s.facing = null;
    expect(isVisible(s, -REVEAL, 0)).toBe(true);
    expect(isVisible(s, REVEAL, 0)).toBe(true);
  });

  it("sees one cell all round and three ahead underground", () => {
    const s = createGame(3);
    const door = s.sites.find((v) => v.ore === CAVE)!;
    s.player = { x: door.x, y: door.y };
    expect(enterCave(s)).toBe(true);
    expect(visionAt(s, s.player)).toBe(REVEAL - CAVE_DARK);
    expect(visionAt(s, s.player)).toBe(3);
    expect(SIGHT_AROUND.under).toBe(1);
    // Walk a step east along open floor, if there is one, and look: 3 ahead, 1 behind.
    const { x, y } = s.player;
    s.facing = { x: 1, y: 0 };
    expect(isVisible(s, x + 3, y)).toBe(true);
    expect(isVisible(s, x + 4, y)).toBe(false);
    expect(isVisible(s, x - 1, y)).toBe(true);
    expect(isVisible(s, x - 2, y)).toBe(false);
    // The stair's chamber is remembered from the moment the player comes down.
    expect(underSeenAt(s, x, y)).toBe(true);
    expect(underCell(x, y, s.seed)).not.toBe(ROCK);
  });
});

describe("known reserve", () => {
  it("counts only the cells the player has seen, and what each began with", () => {
    const s = createGame(1);
    const site: Site = {
      id: 999, ore: "Lm", x: 2, y: 0, total: 60, left: 50, seed: 1,
      cells: [{ x: 2, y: 0, left: 10, total: 20 }, { x: 3, y: 0, left: 20, total: 20 }, { x: 900, y: 900, left: 20, total: 20 }],
    };
    // The far cell has never been seen, so the vein is known only as far as the two near ones.
    expect(isRevealed(s, 900, 900)).toBe(false);
    expect(knownReserve(s, site)).toEqual({ left: 30, total: 40 });
  });

  it("adds a vein's underground cells as prospecting finds them, never the buried ones", () => {
    const s = createGame(1);
    const site: Site = {
      id: 998, ore: "Lm", x: 2, y: 0, total: 80, left: 80, seed: 1,
      cells: [
        { x: 2, y: 0, left: 20, total: 20 },
        { x: 1, y: 1, z: -1, left: 20, total: 20, found: true },
        { x: 2, y: 1, z: -1, left: 20, total: 20, found: false },
        { x: 3, y: 1, z: -1, left: 20, total: 20, found: true, buried: true, wall: true },
      ],
    };
    expect(isRevealed(s, 2, 0)).toBe(true);
    expect(knownReserve(s, site)).toEqual({ left: 40, total: 40 });
  });
});
