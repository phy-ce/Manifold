// The S0 tutorial: one thing to do at a time, each judged from the game state alone, so it works the
// same however the player gets there. Steps only move forward; a step the player has already gone
// past (they built the thing it leads to) is skipped.
import { GameState, atBase, countOf } from "./game";

export interface TutorialStep {
  id: string;
  /** What to do, in Korean; the screen translates it. */
  text: string;
  /** Where to go for it: away on the map, or home at the base. The travel button is pointed out when the player is elsewhere. */
  where?: "map" | "base";
  /** On the map, the search box is pointed out: the step says what to type in it. */
  search?: boolean;
  /** Done: the tutorial moves on. */
  done: (s: GameState) => boolean;
}

/** Whether the player has a machine, built and standing or still in hand. */
const has = (s: GameState, type: string): boolean => s.nodes.some((n) => n.type === type) || countOf(s, type) > 0 || s.cursor?.id === type;
const stands = (s: GameState, type: string): boolean => s.nodes.some((n) => n.type === type);

export const TUTORIAL: TutorialStep[] = [
  { id: "clay", where: "map", search: true, text: "지도로 나가 오른쪽 찾기 칸에 \"점토\"를 검색하고, 가까운 광맥을 눌러 걸어간 뒤 F(또는 광맥 그림)를 눌러 점토 12개를 캐세요", done: (s) => countOf(s, "clay") >= 12 },
  { id: "kiln", where: "base", text: "기지로 돌아와 작업대를 열고 노천 가마를 고른 뒤, 박자에 맞춰 Space를 눌러 만드세요", done: (s) => has(s, "open_kiln") },
  { id: "place-kiln", where: "base", text: "인벤토리의 노천 가마를 집어 보드 빈 곳을 눌러 설치하세요", done: (s) => stands(s, "open_kiln") },
  { id: "fuel", where: "map", search: true, text: "찾기 칸에 \"석탄\"이나 \"갈탄\"을 검색해 연료 4개를 캐고, 벽돌을 구울 점토도 12개 캐 오세요", done: (s) => countOf(s, "clay") >= 12 && countOf(s, "coal") >= 4 },
  { id: "bricks", where: "base", text: "노천 가마에 점토와 연료를 넣어 벽돌 6개를 구우세요", done: (s) => countOf(s, "brick") >= 6 },
  { id: "bloomery", where: "base", text: "작업대에서 괴철로를 만들어 설치하세요 (점토 10, 벽돌 6)", done: (s) => stands(s, "bloomery") },
  { id: "ore", where: "map", search: true, text: "찾기 칸에 \"철광석\"이나 \"갈철석\"을 검색해 철광석 18개를 캐고, 연료도 넉넉히 캐 오세요", done: (s) => countOf(s, "iron_ore") >= 18 },
  { id: "bloom", where: "base", text: "괴철로에 철광석과 연료를 넣고 그림이나 Space로 풀무질해 철 덩이 2개를 만드세요. 게이지를 초록 칸까지 올려야 불이 붙고, 초록 칸에 두어야 작업이 진행되며, 넘치면 재료가 타 버립니다", done: (s) => countOf(s, "bloom") >= 2 },
  { id: "forge", where: "base", text: "벽돌 4개를 더 굽고, 작업대에서 손 단조대를 만들어 설치하세요 (벽돌 4, 철 덩이 2)", done: (s) => stands(s, "hand_forge") },
  { id: "iron", where: "base", text: "철 덩이를 더 만들어 손 단조대에서 박자에 맞춰 두드려 철 주괴 4개를 만드세요", done: (s) => countOf(s, "iron") >= 4 },
  { id: "bench", where: "base", text: "벽돌 8개를 더 굽고, 작업대에서 건설대를 만드세요 (철 4, 벽돌 8). 그러면 S0이 끝납니다", done: (s) => has(s, "construction_bench") || s.stage > 0 },
];

/** Steps a later step makes pointless: once the player has the thing a step leads to, it and everything before go. */
const PAST: Record<string, (s: GameState) => boolean> = {
  clay: (s) => has(s, "open_kiln"),
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
}

/** The step to show now, or null when the tutorial is off or over. */
export function currentStep(s: GameState): TutorialStep | null {
  const t = s.tutorial;
  return !t || t.off || t.step >= TUTORIAL.length ? null : TUTORIAL[t.step];
}

/** Whether the player is somewhere other than where the step needs them. */
export const elsewhere = (s: GameState, step: TutorialStep, onBaseScreen: boolean): boolean =>
  step.where === "map" ? atBase(s) && onBaseScreen : step.where === "base" ? !(atBase(s) && onBaseScreen) : false;
