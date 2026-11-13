// The shapes of a game and the plain numbers its rules run on. Everything else in the engine builds on this,
// so it imports nothing from the other engine modules: its constants can be used anywhere, even at load.
import { tr } from "../i18n";
import type { TutorialState } from "./tutorial";
import { isTool, isMachine } from "../content";
import { Point, Site } from "./world";

/** Version 19 put the caves into one underground layer under the surface. */
export const SAVE_VERSION = 19;
/** Saves older than this are not converted: the boiler took the fire out of the steam engine (version 18). */
export const OLDEST_SAVE = 18;
/** Most a spring can hold, and how much one wind adds. Moving one item uses 1. */
export const SPRING_MAX = 200;
export const WIND = 5;
/** A wound spring slowly runs down by itself, losing 1 force this often. */
export const SPRING_LEAK_MS = 2_000;
/** Steam can't really be stored: a boiler holds about three seconds of full output. */
export const STEAM_MAX = 30;
/** How many of an item go in one slot, in the bag, a warehouse or a machine alike. */
export const STACK = 32;
/** Built machines are bulky: a few to a slot. */
export const MACHINE_STACK = 4;
/** How many of an item fit in one slot: a tool keeps its own wear, so tools go one to a slot; machines a few. */
export const stackSize = (id: string): number => (isTool(id) ? 1 : isMachine(id) ? MACHINE_STACK : STACK);
export const INV_SLOTS = 8;
/** The most the player can carry and still walk. */
export const MAX_CARRY = 80;
export const WARE_SLOTS = 12;
export const STEP_MS = 100;
export const WALK_MS = 150;
export const LINE_MS = 500;
/** A machine's output slot holds a slot's worth, as the bag does. */
export const OUTPUT_CAP = STACK;
/** Longest name that still fits on a node. */
export const NAME_MAX = 12;
/** What a machine's tank holds, in litres. */
export const TANK_CAP = 200;
/** What a tar tank stores, in litres. */
export const TAR_TANK_CAP = 1000;
/**
 * Sight. The player sees a small circle all round (`SIGHT_AROUND`, less underground) and, the way they last
 * walked, a fan `FAN_DEGREES` wide reaching `visionAt`: REVEAL on flat open ground, further from a hill, less
 * in a forest, CAVE_DARK less underground. Before the first step there is no way ahead, so the reach is all round.
 */
export const REVEAL = 5;
export const SIGHT_AROUND = { surface: 2, under: 1 };
export const FAN_DEGREES = 90;
/** How much less the fan reaches underground than on open ground. */
export const CAVE_DARK = 2;
export const BASE_REVEAL = 9;

export const SEASON_NAMES = [tr("봄"), tr("여름"), tr("가을"), tr("겨울")];
export const SEASON_MS = 240000;

export const MAX_VITAL = 100;
/** Collapsing weakens the player for one season. */
export const WEAK_WORK = 0.5;
export const WEAK_WALK = 1.25;

export interface Stack {
  id: string;
  n: number;
  /** Uses a tool has had. Tools never stack, so each keeps its own. */
  wear?: number;
}
export type Slots = (Stack | null)[];

export type Overflow = "refuse" | "discard";

export interface GameNode {
  id: number;
  type: string;
  /** Three characters that name this one machine, like K01. */
  code: string;
  /** The player's own name for it, shown instead of the machine's. */
  name?: string;
  form: string;
  x: number;
  y: number;
  ins: Record<string, Stack | null>;
  outs: Record<string, number>;
  progress: number;
  store: Slots;
  paid: Stack[];
  /** Mistakes made on this machine, for difficulty penalties. */
  fails: number;
  /** Stored force: a spring's wind or an engine's steam. */
  energy: number;
  /** 1 when power drives it this step, 0 when none reaches it or it was cut off. */
  speed?: number;
  /** Whether power reaches its outgoing lines this step, so they can carry. */
  carry?: boolean;
  /** Its place in its power network's queue, counting from 1: later ones stop first when power runs short. */
  order?: number;
  /** Connected to power of too weak a tier to drive it, such as a spring for a hammer. */
  tierLow?: boolean;
  /** The fuel waiting in the firebox, heat left in the piece burning now, and the heat that piece started with. */
  fuel?: Stack | null;
  heat?: number;
  heatFull?: number;
  /** How hot the bellows have blown a hand furnace, 0 to BLAST.max. */
  blast?: number;
  /** When the bellows last overheated it and burnt a batch, in game time. */
  burstAt?: number;
  /** The riverbank a pump draws from. */
  siteId?: number;
  /** The tubes laid from the base to that riverbank, given back when the pump lets go of it. */
  riverPaid?: Stack[];
  /** A steam module is fitted, so this machine can take steam power. */
  module?: boolean;
  /** What a full tar tank does with more: refuse it, or take it and throw it away. */
  overflow?: Overflow;
}

/** A planned machine: shown faded on the board, doing nothing until a real one takes its place. */
export interface Ghost {
  id: number;
  type: string;
  form: string;
  /** The riverbank a planned pump will draw from. */
  siteId?: number;
  x: number;
  y: number;
}

/** Nodes folded into one card. They keep running; `port` is the one that faces the outside. */
export interface Group {
  id: number;
  code: string;
  name?: string;
  nodes: number[];
  port: number;
  x: number;
  y: number;
  open: boolean;
}

/** A planned line. Either end can be a real node or a ghost. */
export interface GhostLine {
  from: number;
  to: number;
  material: string;
}

export interface Line {
  id: number;
  from: number;
  to: number;
  material: string;
  timer: number;
  active: boolean;
  lastMoved: number;
  /** The belt or tube a line is laid with, which sets how much it can carry. Power lines have none. */
  kind?: string;
  /** What this line cost to build, returned when it is removed. */
  paid: Stack[];
}

export interface GameState {
  version: number;
  seed: number;
  time: number;
  player: Point;
  path: Point[];
  walkTimer: number;
  /** Route around known hazards instead of walking straight. */
  /** Safe mode: walks stop short of known hazards. */
  safeWalk: boolean;
  /** The hazard safe mode last stopped the player at, until the next walk. */
  halt?: (Hazard & { target: Point }) | null;
  /** The cell the last walk stopped in front of because it was too steep to step onto (tooSteep). */
  steep?: Point | null;
  inv: Slots;
  /** The stack the player has picked up and is moving with the pointer. */
  cursor: Stack | null;
  /** What is equipped, by slot. */
  gear: Record<string, Stack | null>;
  sites: Site[];
  /** Explored cells by chunk. A chunk's veins are generated when it first appears here. */
  revealed: Record<string, number[]>;
  /**
   * The layer the player is on: 0 the surface, -1 the underground right below it. `player` is the same x and y
   * on either: going down a cave entrance keeps the player over the same spot.
   */
  z: number;
  /** Explored underground cells by chunk, as `revealed` is for the surface. */
  underSeen: Record<string, number[]>;
  /** The way the player last stepped, one cell in each axis: the fan of sight opens that way. */
  facing?: Point | null;
  /** When prospecting began, if it is under way. */
  probe: number | null;
  /** Game time when the player's next blow is ready. */
  strikeReady?: number;
  /** When the player last went underground. Creatures come out more the longer they stay. */
  caveSince?: number;
  /** The last loud thing done underground, prospecting or mining: where and when. It draws creatures. */
  noise?: { x: number; y: number; at: number } | null;
  /** Creatures around the player, underground or a yeti on the surface, and spines in flight. */
  mobs: Mob[];
  shots: Shot[];
  nodes: GameNode[];
  lines: Line[];
  ghosts: Ghost[];
  ghostLines: GhostLine[];
  groups: Group[];
  nextId: number;
  /** How many of each machine have ever been built. Codes are never reused. */
  built: Record<string, number>;
  hp: number;
  hunger: number;
  hungerTimer: number;
  vitalTimer: number;
  season: number;
  /** Time until which the player is weakened by a collapse. */
  weakUntil: number;
  /** What the last collapse cost, until the screen has shown it. */
  lost: Stack[] | null;
  /** What last took health, so the screen can say why along with how much. */
  hurtBy?: HurtCause;
  /** A tool that just broke from use, and when, for the screen to show. */
  broke?: { id: string; at: number };
  /** What the last carcass gave up into the bag, and when, for the screen to show. */
  drop?: { got: Record<string, number>; at: number };
  /** The last time carrying stopped a dig, pick or butchering, and why, for the screen to say. */
  blocked?: { why: "heavy" | "full"; at: number };
  /** Beasts killed lie where they fell until the player stands on them and takes what they have. */
  corpses?: Corpse[];
  /** A dig, pick or fill under way at a cell: how long it has gone and how long it takes, in ms. */
  dig?: { x: number; y: number; z: number; done: number; ms: number; corpse?: number } | null;
  /** Which of several things underfoot the player picked to gather (see gathersHere), until they move. */
  picked?: string | null;
  /** Food being eaten: which, how long it has gone and how long it takes, in ms. */
  eating?: { id: string; done: number; ms: number } | null;
  /** Where and when the last dig came up, for the screen to flash the cell. */
  dug?: { x: number; y: number; at: number };
  /** The last vein dug out, and when, for the screen to say it is spent. */
  depleted?: { ore: string; at: number; what: "cell" | "vein" };
  /** Index into STAGES of the stage being played. */
  stage: number;
  /** How many of each item have ever been made. Goals check this, so nothing is handed in. */
  made: Record<string, number>;
  /** How many of the current goal's item had been made when its stage opened. */
  goalBase?: number;
  /** A stage just finished, until the screen has shown it. */
  announced: string | null;
  /** How far the S0 tutorial has got, and whether the player turned it off. */
  tutorial?: TutorialState;
}

/** "manual" means loaded and waiting for the player to work it. */
export type Status = "run" | "idle" | "blocked" | "manual";

export const emptySlots = (n: number): Slots => Array.from({ length: n }, () => null);

// ---- Creatures, what hurts the player, and the carcasses beasts leave

/** A wolf runs the player down and bites; a spine salamander keeps its distance and shoots. */
/** A cell that hurts to step on: where it is, how much, and what it is. */
/** What can take the player's health: a creature by kind, the ground (water, a climb or drop), or hunger. */
export type HurtCause = "melee" | "ranged" | "yeti" | "water" | "hill" | "hunger";

export interface Hazard {
  x: number;
  y: number;
  damage: number;
  kind: "water" | "hill";
  height: number;
}

export interface Mob {
  id: number;
  /** Cave creatures bite or shoot; a yeti lives on the surface, in its own biome. */
  kind: "melee" | "ranged" | "yeti" | "deer";
  x: number;
  y: number;
  /** Time until it may move again, and until it may bite or shoot again. */
  wait: number;
  cool: number;
  /** Health left; at zero it dies. */
  hp: number;
  /** A yeti that has noticed the player and is after them. */
  hunting?: boolean;
  /** How long a yeti has been without the player in its biome and near; it gives up at YETI.giveUpMs. */
  lost?: number;
}
/** A spine in flight. It moves a fraction of a cell each step, so it can be dodged. */
export interface Shot {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
}

/** A beast lying where it fell, with how many cuts are left in it. */
export interface Corpse {
  id: number;
  kind: Mob["kind"];
  x: number;
  y: number;
  z: number;
  /** Cuts left: each F on it, done, takes one item drawn by chance. */
  left: number;
}

// ---- Moving items by hand: which mouse button was pressed

export type Button = "left" | "right";
