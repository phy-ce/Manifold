// For tests: worlds with veins laid near the base, as tests about mining and grades need something to dig
// right away. The real game promises no vein there (VEINS.starter.families is empty); this borrows that same
// data switch for the one call, so the veins are laid by the game's own rules.
import { VEINS } from "../content";
import { GameState, createGame } from "./game";

/** The families laid near the base for tests. */
const NEAR_BASE = ["clay", "iron_ore", "coal", "copper_ore"];

export function withVeinsNearBase<T>(make: () => T): T {
  const kept = [...VEINS.starter.families];
  VEINS.starter.families.splice(0, kept.length, ...NEAR_BASE);
  try {
    return make();
  } finally {
    VEINS.starter.families.splice(0, VEINS.starter.families.length, ...kept);
  }
}

export function gameWithVeins(seed: number): GameState {
  return withVeinsNearBase(() => createGame(seed));
}
