// The S0 tutorial: one thing to do at a time, each judged from the game state alone, so it works the
// same however the player gets there. Steps only move forward; a step the player has already gone
// past (they built the thing it leads to) is skipped.
import { GameState, atBase, countOf, revealWay } from "./game";
import { familyOf } from "../content";
import { BASE } from "./world";

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

export const TUTORIAL: TutorialStep[] = [
  // What the top bar's meters mean, before anything can go wrong. Nothing to do: the card's button moves on.
  { id: "vitals", section: "기본 조작", title: "몸 상태 보기", ack: true, text: "위쪽 줄의 체력, 허기, 무게를 보세요. 허기는 시간이 지나며 줄고, 0이 되면 체력이 깎입니다. 허기가 절반 넘게 차 있으면 체력이 천천히 돌아옵니다. 체력이 0이 되면 쓰러져 기지로 돌아오고, 기지에서 멀수록 가진 재료를 더 잃습니다. 무게는 들고 있는 짐입니다. 무거울수록 느리게 걷고, 한도를 넘으면 걷지도 캐지도 못합니다. 짐을 덜려면 가방(I)을 열고 아이템을 클릭해 집은 뒤 버리기를 누르세요", done: () => false },
  // Getting about first: everything after happens out on the map.
  { id: "walk", section: "기본 조작", title: "걸어 보기", where: "map", text: "M을 눌러 지도로 나가, WASD로 걷거나 지도의 칸을 눌러 걸어가 보세요. 기지에서 6칸 떨어진 곳까지 가면 됩니다. M을 다시 누르면 기지로 돌아옵니다", done: (s) => Math.max(Math.abs(s.player.x - BASE.x), Math.abs(s.player.y - BASE.y)) >= WALK_AWAY },
  // Then food: hunger runs down from the start, and food is always laid near the base.
  { id: "food", section: "식량", title: "먹을 것 줍기", where: "map", search: true, text: "왼쪽 찾기 칸에 \"버섯\"이나 \"산딸기\"를 검색하고, 가까운 곳을 눌러 걸어간 뒤 F로 먹을 것 4개를 주우세요. 배가 고프면 가방(I)에서 음식에 마우스를 올리고 E로 먹습니다", done: (s) => FOOD.reduce((n, id) => n + countOf(s, id), 0) >= 4 },
  { id: "clay", section: "광맥", title: "점토 캐기", where: "map", search: true, onStart: lightClay, text: "기지에서 가까운 점토 광맥까지 길을 밝혀 두었습니다. 찾기 칸에 \"점토\"를 검색하고, 광맥을 눌러 걸어간 뒤 F(또는 광맥 그림)를 눌러 점토 12개를 캐세요", done: (s) => countOf(s, "clay") >= 12 },
  { id: "kiln", section: "가마", title: "노천 가마 만들기", where: "base", text: "기지로 돌아와 작업대를 열고 노천 가마를 고른 뒤, 박자에 맞춰 Space를 눌러 만드세요", done: (s) => has(s, "open_kiln") },
  { id: "place-kiln", section: "가마", title: "가마 설치", where: "base", text: "인벤토리의 노천 가마를 집어 보드 빈 곳을 눌러 설치하세요", done: (s) => stands(s, "open_kiln") },
  { id: "fuel", section: "연료와 벽돌", title: "연료 찾기", where: "map", search: true, text: "석탄과 갈탄은 기지 근처에 없습니다. 지도를 돌아다니며 직접 찾아야 하고, 시간이 좀 걸립니다. 한 번 본 광맥은 찾기 칸에 \"석탄\"이나 \"갈탄\"을 검색하면 나옵니다. 연료 4개를 캐고, 벽돌을 구울 점토도 12개 캐 오세요", done: (s) => countOf(s, "clay") >= 12 && countOf(s, "coal") >= 4 },
  { id: "bricks", section: "연료와 벽돌", title: "벽돌 굽기", where: "base", text: "노천 가마에 점토와 연료를 넣어 벽돌 6개를 구우세요", done: (s) => countOf(s, "brick") >= 6 },
  { id: "bloomery", section: "철", title: "괴철로 설치", where: "base", text: "작업대에서 괴철로를 만들어 설치하세요 (점토 10, 벽돌 6)", done: (s) => stands(s, "bloomery") },
  { id: "ore", section: "철", title: "철광석 찾기", where: "map", search: true, text: "철광석도 직접 찾아야 합니다. 멀리 돌아다녀야 할 수 있으니 먹을 것을 챙기세요. 한 번 본 광맥은 찾기 칸에 \"철광석\"이나 \"갈철석\"을 검색하면 나옵니다. 철광석 18개를 캐고, 연료도 넉넉히 캐 오세요", done: (s) => countOf(s, "iron_ore") >= 18 },
  { id: "bloom", section: "철", title: "철 덩이 만들기", where: "base", text: "괴철로에 철광석과 연료를 넣고 그림이나 Space로 풀무질해 철 덩이 2개를 만드세요. 게이지를 초록 칸까지 올려야 불이 붙고, 초록 칸에 두어야 작업이 진행되며, 넘치면 재료가 타 버립니다", done: (s) => countOf(s, "bloom") >= 2 },
  { id: "forge", section: "단조", title: "손 단조대", where: "base", text: "벽돌 4개를 더 굽고, 작업대에서 손 단조대를 만들어 설치하세요 (벽돌 4, 철 덩이 2)", done: (s) => stands(s, "hand_forge") },
  { id: "iron", section: "단조", title: "철 주괴", where: "base", text: "철 덩이를 더 만들어 손 단조대에서 박자에 맞춰 두드려 철 주괴 4개를 만드세요", done: (s) => countOf(s, "iron") >= 4 },
  { id: "bench", section: "단조", title: "건설대", where: "base", text: "벽돌 8개를 더 굽고, 작업대에서 건설대를 만드세요 (철 4, 벽돌 8). 그러면 S0이 끝납니다", done: (s) => has(s, "construction_bench") || s.stage > 0 },
];

/** Steps a later step makes pointless: once the player has the thing a step leads to, it and everything before go. */
const PAST: Record<string, (s: GameState) => boolean> = {
  vitals: (s) => has(s, "open_kiln") || FOOD.some((id) => countOf(s, id) > 0),
  walk: (s) => has(s, "open_kiln") || FOOD.some((id) => countOf(s, id) > 0),
  food: (s) => has(s, "open_kiln"),
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
