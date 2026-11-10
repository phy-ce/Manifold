// The S0 tutorial: one thing to do at a time, each judged from the game state alone, so it works the
// same however the player gets there. Steps only move forward; a step the player has already gone
// past (they built the thing it leads to) is skipped. The words are data (data/tutorial.json, in Korean;
// English in src/i18n.ts like all other text); what each step checks is code, here.
import { GameState, atBase, countOf, revealWay } from "./game";
import { familyOf } from "../content";
import { BASE } from "./world";
import tutorialData from "../../data/tutorial.json";

export interface TutorialStep {
  id: string;
  /** The part of the tutorial it belongs to; the card shows one section at a time. In Korean. */
  section: string;
  /** A few words for the step in the section's list. In Korean. */
  title: string;
  /** What to do, in Korean; the screen translates it. */
  text: string;
  /** Where to go for it: away on the map, or home at the base. The travel button is pointed out when the player is elsewhere. */
  where?: "map" | "base";
  /** On the map, the search box is pointed out: the step says what to type in it. */
  search?: boolean;
  /** Only something to read: it moves on when the player says so (acknowledgeStep), not by anything in the game. */
  ack?: boolean;
  /** Done once when the step comes up, to help with it (the clay step lights the way to the clay). */
  onStart?: (s: GameState) => void;
  /** Done: the tutorial moves on. */
  done: (s: GameState) => boolean;
}

/** Whether the player has a machine, built and standing or still in hand. */
const has = (s: GameState, type: string): boolean => s.nodes.some((n) => n.type === type) || countOf(s, type) > 0 || s.cursor?.id === type;
const stands = (s: GameState, type: string): boolean => s.nodes.some((n) => n.type === type);
/** What counts as food for the first step: picked or cooked. */
const FOOD = ["Be", "Mu", "Bc", "Mc"];
/**
 * The clay step lights the way from the base to the nearest clay vein that still holds any (the one the world
 * promises near the base), so the search finds it at once and the line on the map shows where to walk.
 */
function lightClay(s: GameState): void {
  const far = (p: { x: number; y: number }) => Math.max(Math.abs(p.x - BASE.x), Math.abs(p.y - BASE.y));
  const clay = s.sites.filter((v) => familyOf(v.ore) === "clay" && v.left > 0 && !v.z).sort((a, b) => far(a) - far(b))[0];
  if (clay) revealWay(s, BASE, clay);
}
/** How far from the base the first step asks the player to walk, in cells. */
const WALK_AWAY = 6;

/** What each step needs and checks. Its words (section, title, text) are in data/tutorial.json, in the same order. */
type Rule = Omit<TutorialStep, "id" | "section" | "title" | "text">;
const RULES: Record<string, Rule> = {
  // What the top bar's meters mean, before anything can go wrong. Nothing to do: the card's button moves on.
  vitals: { ack: true, done: () => false },
  // Getting about first: everything after happens out on the map.
  walk: { where: "map", done: (s) => Math.max(Math.abs(s.player.x - BASE.x), Math.abs(s.player.y - BASE.y)) >= WALK_AWAY },
  // The top bar (time, saving, help) and safe mode: read once out on the map, where they matter.
  top: { ack: true, done: () => false },
  // Then food: hunger runs down from the start, and food is always laid near the base.
  food: { where: "map", search: true, done: (s) => FOOD.reduce((n, id) => n + countOf(s, id), 0) >= 4 },
  // With food in the bag, how the bag works: every slot (bag, store, machine) is handled the same way.
  bag: { ack: true, done: () => false },
  clay: { where: "map", search: true, onStart: lightClay, done: (s) => countOf(s, "clay") >= 12 },
  // Before the first craft: how windows open and close, and how to look a recipe up in the index beside them.
  index: { ack: true, done: () => false },
  kiln: { where: "base", done: (s) => has(s, "open_kiln") },
  "place-kiln": { where: "base", done: (s) => stands(s, "open_kiln") },
  fuel: { where: "map", search: true, done: (s) => countOf(s, "clay") >= 12 && countOf(s, "coal") >= 4 },
  bricks: { where: "base", done: (s) => countOf(s, "brick") >= 6 },
  bloomery: { where: "base", done: (s) => stands(s, "bloomery") },
  ore: { where: "map", search: true, done: (s) => countOf(s, "iron_ore") >= 18 },
  bloom: { where: "base", done: (s) => countOf(s, "bloom") >= 2 },
  forge: { where: "base", done: (s) => stands(s, "hand_forge") },
  iron: { where: "base", done: (s) => countOf(s, "iron") >= 4 },
  bench: { where: "base", done: (s) => has(s, "construction_bench") || s.stage > 0 },
};

/** The steps in order: the words from the data, the rules from above. A step without a rule is a mistake. */
export const TUTORIAL: TutorialStep[] = tutorialData.steps.map((words) => {
  const rule = RULES[words.id];
  if (!rule) throw new Error(`Tutorial step "${words.id}" in data/tutorial.json has no rule in tutorial.ts`);
  return { ...words, ...rule };
});


/** Steps a later step makes pointless: once the player has the thing a step leads to, it and everything before go. */
const PAST: Record<string, (s: GameState) => boolean> = {
  vitals: (s) => has(s, "open_kiln") || FOOD.some((id) => countOf(s, id) > 0),
  walk: (s) => has(s, "open_kiln") || FOOD.some((id) => countOf(s, id) > 0),
  top: (s) => has(s, "open_kiln") || FOOD.some((id) => countOf(s, id) > 0),
  food: (s) => has(s, "open_kiln"),
  bag: (s) => has(s, "open_kiln") || countOf(s, "clay") >= 12,
  clay: (s) => has(s, "open_kiln"),
  index: (s) => has(s, "open_kiln"),
  kiln: (s) => has(s, "open_kiln"),
  "place-kiln": (s) => stands(s, "open_kiln"),
  fuel: (s) => has(s, "bloomery"),
  bricks: (s) => has(s, "bloomery"),
  bloomery: (s) => stands(s, "bloomery"),
  ore: (s) => has(s, "hand_forge"),
  bloom: (s) => has(s, "hand_forge"),
  forge: (s) => stands(s, "hand_forge"),
};

export interface TutorialState {
  step: number;
  off: boolean;
  /** The last step whose start was acted on (onStart), so it happens once. */
  started?: number;
}

export const newTutorial = (): TutorialState => ({ step: 0, off: false });

/** Moves the tutorial on past whatever is done or already passed. Ends after S0. */
export function advanceTutorial(s: GameState): void {
  const t = s.tutorial;
  if (!t || t.off) return;
  if (s.stage > 0) {
    t.step = TUTORIAL.length;
    return;
  }
  TUTORIAL.forEach((step, i) => {
    if (PAST[step.id]?.(s)) t.step = Math.max(t.step, i + 1);
  });
  while (t.step < TUTORIAL.length && TUTORIAL[t.step].done(s)) t.step += 1;
  const now = TUTORIAL[t.step];
  if (now?.onStart && t.started !== t.step) {
    t.started = t.step;
    now.onStart(s);
  }
}

/** The sections in order, each with the indexes of its steps. */
export const SECTIONS: { name: string; steps: number[] }[] = TUTORIAL.reduce((list, step, i) => {
  const last = list[list.length - 1];
  if (last?.name === step.section) last.steps.push(i);
  else list.push({ name: step.section, steps: [i] });
  return list;
}, [] as { name: string; steps: number[] }[]);

/** The player has read a step that is only for reading: on to the next. */
export function acknowledgeStep(s: GameState): void {
  const t = s.tutorial;
  if (!t || t.off || !TUTORIAL[t.step]?.ack) return;
  t.step += 1;
  advanceTutorial(s);
}

/** The step to show now, or null when the tutorial is off or over. */
export function currentStep(s: GameState): TutorialStep | null {
  const t = s.tutorial;
  return !t || t.off || t.step >= TUTORIAL.length ? null : TUTORIAL[t.step];
}

/** Whether the player is somewhere other than where the step needs them. */
export const elsewhere = (s: GameState, step: TutorialStep, onBaseScreen: boolean): boolean =>
  step.where === "map" ? atBase(s) && onBaseScreen : step.where === "base" ? !(atBase(s) && onBaseScreen) : false;
