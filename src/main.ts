import "./style.css";
import { PLAYABLE_STAGES, STAGES, itemCode, itemColor, itemName } from "./content";
import { GameState, MAX_CARRY, MAX_VITAL, SAVE_VERSION, SEASON_MS, SEASON_NAMES, STEP_MS, atBase, isWeak, carried, clickStack, createGame, createTestGame, eat, overloaded, sortSlots, step, trashCursor, upgradeSave, walkTo, wheelStack } from "./engine/game";
import { BASE } from "./engine/world";
import { BuildWindow } from "./ui/buildWindow";
import { GraphView } from "./ui/graphView";
import { ItemIndex } from "./ui/itemIndex";
import { MachineWindow } from "./ui/machineWindow";
import { RouteWindow } from "./ui/routeWindow";
import { SaveWindow } from "./ui/saveWindow";
import { MapView } from "./ui/mapView";
import { makeSlot, paintSlot } from "./ui/slots";
import { applyTheme } from "./ui/theme";
import { installTooltip } from "./ui/tooltip";

applyTheme();
installTooltip();

const SAVE_KEY = "modpack-simulator-save";
const MAX_CATCH_UP_MS = 2000;

function load(): GameState {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    const saved = raw ? (JSON.parse(raw) as GameState) : null;
    if (saved?.version === SAVE_VERSION) return upgradeSave(saved);
  } catch {
    // A blocked or damaged save just starts a new game.
  }
  return createGame(Math.floor(Math.random() * 100000));
}
let saving = true;
function save(): void {
  if (!saving) return;
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
  } catch {
    // Saving is a convenience; the game keeps running without it.
  }
}

let state = load();
const game = () => state;

// Which screen the player has open while standing at the base.
let screen: "base" | "map" = "base";
let wasHome = atBase(state);

const app = document.getElementById("app")!;
const top = document.createElement("header");
top.className = "top";
const goal = document.createElement("div");
goal.className = "goal";
const travel = document.createElement("button");
travel.type = "button";
travel.className = "tech";
const reset = document.createElement("button");
reset.type = "button";
reset.className = "tech push";
reset.textContent = "새 게임";
const vitals = document.createElement("div");
vitals.className = "vitals";
const indexButton = document.createElement("button");
indexButton.type = "button";
indexButton.className = "tech";
indexButton.textContent = "도감";
const saveButton = document.createElement("button");
saveButton.type = "button";
saveButton.className = "tech";
saveButton.textContent = "저장";

// Game speed: 0 pauses.
const SPEEDS: [string, number][] = [["||", 0], ["1x", 1], ["2x", 2], ["4x", 4]];
let speed = 1;
const speedBar = document.createElement("div");
speedBar.className = "modes";
const speedButtons = SPEEDS.map(([label, value]) => {
  const b = document.createElement("button");
  b.type = "button";
  b.className = `tech ${value === speed ? "selected" : ""}`;
  b.textContent = label;
  b.setAttribute("aria-label", value ? `${value}배속` : "일시정지");
  b.addEventListener("click", () => {
    speed = value;
    speedButtons.forEach((other, i) => other.classList.toggle("selected", SPEEDS[i][1] === speed));
  });
  return b;
});
speedBar.append(...speedButtons);
const testStart = document.createElement("button");
testStart.type = "button";
testStart.className = "tech";
testStart.textContent = "테스트 시작";
testStart.dataset.tip = "S1-2가 열린 상태로, 감긴 태엽 동력기, 제련로, 재료가 찬 창고와 함께 시작합니다";
testStart.addEventListener("click", () => {
  if (testStart.dataset.armed !== "1") {
    testStart.dataset.armed = "1";
    testStart.textContent = "정말 초기화?";
    setTimeout(() => {
      testStart.dataset.armed = "";
      testStart.textContent = "테스트 시작";
    }, 3000);
    return;
  }
  state = createTestGame(Math.floor(Math.random() * 100000));
  save();
  location.reload();
});
top.append(goal, vitals, travel, indexButton, speedBar, saveButton, testStart, reset);

// A small number shows the damage taken. No full-screen flash: it was hard on the eyes.
const hurtFlash = document.createElement("div");
hurtFlash.className = "hurt";
hurtFlash.setAttribute("aria-hidden", "true");
document.body.append(hurtFlash);
let lastHp = state.hp;
/** Matches the longest hurt animation in style.css. */
const HURT_MS = 600;
let hurtTimer = 0;

function showHurt(amount: number): void {
  hurtFlash.textContent = `-${amount}`;
  for (const el of [hurtFlash, vitals]) {
    el.classList.remove("hit");
    void el.offsetWidth; // restart the animation if it is already running
    el.classList.add("hit");
  }
  // The clock rebuilds the vitals every second, which would replay a mark left on them.
  clearTimeout(hurtTimer);
  hurtTimer = window.setTimeout(() => {
    hurtFlash.classList.remove("hit");
    vitals.classList.remove("hit");
  }, HURT_MS);
}

const notice = document.createElement("div");
notice.className = "notice";
notice.hidden = true;
let noticeUntil = 0;
const NOTICE_MS = 6000;
const LOW_VITAL = 25;

function meter(label: string, value: number): string {
  const cells = 10;
  const fill = Math.ceil((value / MAX_VITAL) * cells);
  const low = value <= LOW_VITAL ? " low" : "";
  return `<span class="meter${low}">${label} [${"#".repeat(fill).padEnd(cells, ".")}] ${value}</span>`;
}

const windowView = new MachineWindow(game, redraw);
const buildView = new BuildWindow(game, redraw);
const routeView = new RouteWindow(game, redraw);
const saveView = new SaveWindow(game, (loaded) => {
  saving = false; // keep the page's unload save from overwriting what was just loaded
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(loaded));
  } catch {
    saving = true;
    return;
  }
  location.reload();
});
saveButton.addEventListener("click", () => {
  closeWindows();
  saveView.open();
});
// Only one window at a time: opening one closes the others.
function closeWindows(): void {
  closeBaseWindows();
  saveView.close();
}
/** Windows onto the base. Saving works anywhere, so its window isn't one of them. */
function closeBaseWindows(): void {
  windowView.close();
  buildView.close();
  routeView.close();
}
const graph = new GraphView(
  game,
  (id) => {
    closeWindows();
    windowView.open(id);
  },
  (type) => {
    closeWindows();
    buildView.open(type);
  },
  (from, to) => {
    closeWindows();
    routeView.open(from, to);
  },
  redraw,
);
const map = new MapView(game, () => {
  redraw();
});

const itemIndex = new ItemIndex(game, () => windowView.openNode, redraw);
indexButton.addEventListener("click", () => itemIndex.toggle());

const invBox = document.createElement("section");
invBox.className = "box";
invBox.setAttribute("aria-label", "인벤토리");
const invGrid = document.createElement("div");
invGrid.className = "slot-grid wide";
const invSlots = state.inv.map((_, i) => {
  const b = makeSlot(() => {
    clickStack(state, state.inv, i, "left");
    redraw();
  }, {
    right: () => {
      clickStack(state, state.inv, i, "right");
      redraw();
    },
    wheel: (way) => {
      wheelStack(state, state.inv, i, way);
      redraw();
    },
  });
  b.dataset.inv = String(i);
  return b;
});

const sortButton = document.createElement("button");
sortButton.type = "button";
sortButton.className = "tech";
sortButton.textContent = "정렬";
sortButton.addEventListener("click", () => {
  sortSlots(state.inv);
  redraw();
});
const trashButton = document.createElement("button");
trashButton.type = "button";
trashButton.className = "tech demolish";
trashButton.textContent = "버리기";
trashButton.dataset.tip = "들고 있는 아이템을 버립니다";
trashButton.addEventListener("click", () => {
  trashCursor(state);
  redraw();
});

// The stack in hand follows the pointer.
const held = document.createElement("div");
held.className = "held";
held.hidden = true;
const heldSlot = makeSlot(() => undefined);
heldSlot.tabIndex = -1;
held.append(heldSlot);
document.body.append(held);
document.addEventListener("pointermove", (e) => {
  if (!held.hidden) held.style.transform = `translate(${e.clientX + 6}px, ${e.clientY + 6}px)`;
  pointer = { x: e.clientX, y: e.clientY };
});
let pointer = { x: 0, y: 0 };

// E over a bag slot eats it; a plain click now picks things up.
window.addEventListener("keydown", (e) => {
  if (e.target instanceof HTMLInputElement || e.key.toLowerCase() !== "e") return;
  const slot = document.querySelector<HTMLElement>("[data-inv]:hover")?.dataset.inv;
  if (slot !== undefined) {
    eat(state, Number(slot));
    redraw();
  }
});
invGrid.append(...invSlots);
const invTools = document.createElement("div");
invTools.className = "bar-row";
invTools.append(sortButton, trashButton);
invBox.append(invTools, invGrid);

const win = document.createElement("div");
win.className = "win";
win.hidden = true;
win.innerHTML = `<div class="window"><h2></h2><p></p></div>`;
const keepPlaying = document.createElement("button");
keepPlaying.type = "button";
keepPlaying.className = "tech";
keepPlaying.textContent = "계속하기";
keepPlaying.addEventListener("click", () => {
  state.announced = null;
  redraw();
});
win.firstElementChild!.append(keepPlaying);

document.body.append(itemIndex.root);
app.append(top, notice, graph.root, map.root, invBox, windowView.root, buildView.root, routeView.root, saveView.root, win);

travel.addEventListener("click", () => {
  if (atBase(state)) screen = screen === "base" ? "map" : "base";
  else walkTo(state, BASE);
  redraw();
});
reset.addEventListener("click", () => {
  if (reset.dataset.armed !== "1") {
    reset.dataset.armed = "1";
    reset.textContent = "정말 초기화?";
    setTimeout(() => {
      reset.dataset.armed = "";
      reset.textContent = "새 게임";
    }, 3000);
    return;
  }
  state = createGame(Math.floor(Math.random() * 100000));
  screen = "base";
  reset.dataset.armed = "";
  reset.textContent = "새 게임";
  windowView.close();
  save();
  location.reload();
});

function redraw(): void {
  // Only the screen for the player's current location exists on the page.
  const home = atBase(state);
  if (home && !wasHome) screen = "base"; // arriving home opens the base
  wasHome = home;
  if (!home) closeBaseWindows();
  const showBase = home && screen === "base";
  graph.root.hidden = !showBase;
  map.root.hidden = showBase;

  const place = home ? (screen === "base" ? "지도" : "기지로") : "기지로 복귀";
  if (travel.textContent !== place) travel.textContent = place;
  const stage = STAGES[Math.min(state.stage, PLAYABLE_STAGES - 1)];
  const { item, amount } = stage.goal;
  const made = state.made[item] ?? 0;
  const target = `${stage.id}|${made}`;
  if (goal.dataset.key !== target) {
    goal.dataset.key = target;
    goal.innerHTML = `${stage.id} <span style="color:${itemColor(item)}">${itemCode(item)}</span> ${itemName(item)} ${Math.min(made, amount)}/${amount}`;
  }
  const seasonLeft = Math.ceil((SEASON_MS - (state.time % SEASON_MS)) / 1000);
  const clock = `${Math.floor(seasonLeft / 60)}:${String(seasonLeft % 60).padStart(2, "0")}`;
  const shown = `<span class="meter">${SEASON_NAMES[state.season]} ${clock}</span>${isWeak(state) ? `<span class="meter low">쇠약 ${Math.ceil((state.weakUntil - state.time) / 1000)}초</span>` : ""}` + meter("체력", state.hp) + meter("허기", state.hunger) +
    `<span class="meter${overloaded(state) ? " low" : ""}">무게 ${carried(state)}/${MAX_CARRY}${overloaded(state) ? " 초과, 이동 불가" : ""}</span>`;
  if (vitals.innerHTML !== shown) vitals.innerHTML = shown;
  // A collapse jumps health back up, so it counts as a hit even though the number rises.
  if (state.hp < lastHp) showHurt(lastHp - state.hp);
  else if (state.lost) showHurt(lastHp);
  lastHp = state.hp;
  if (state.lost) {
    const items = state.lost.map((s) => `${itemCode(s.id)} -${s.n}`).join(", ");
    notice.textContent = items ? `쓰러졌습니다. 잃은 재료: ${items}` : "쓰러졌습니다.";
    notice.hidden = false;
    noticeUntil = performance.now() + NOTICE_MS;
    state.lost = null;
  } else if (!notice.hidden && performance.now() > noticeUntil) {
    notice.hidden = true;
  }
  state.inv.forEach((stack, i) => paintSlot(invSlots[i], stack));
  const wasHidden = held.hidden;
  held.hidden = !state.cursor;
  if (state.cursor) paintSlot(heldSlot, state.cursor);
  if (wasHidden && !held.hidden) held.style.transform = `translate(${pointer.x + 6}px, ${pointer.y + 6}px)`;
  trashButton.disabled = !state.cursor;
  win.hidden = !state.announced;
  if (state.announced && win.dataset.stage !== state.announced) {
    win.dataset.stage = state.announced;
    win.querySelector("h2")!.textContent = `${state.announced} 완료`;
    const next = STAGES[state.stage];
    win.querySelector("p")!.textContent = state.stage < PLAYABLE_STAGES ? `다음 단계: ${next.id} ${next.name}` : `${next.id}은 아직 준비 중입니다.`;
  }
  graph.setStage(state.stage);
  itemIndex.sync();
  if (showBase) graph.draw();
  else map.draw();
}

let last = performance.now();
let backlog = 0;
let frame = 0;
let saveClock = 0;

/** The world only changes every STEP_MS, so the screen doesn't need to redraw any faster. */
function tick(): void {
  const now = performance.now();
  const dt = now - last;
  last = now;
  backlog = Math.min(backlog + dt * speed, MAX_CATCH_UP_MS * Math.max(1, speed));
  while (backlog >= STEP_MS) {
    step(state);
    backlog -= STEP_MS;
  }
  saveClock += dt;
  frame += 1;
  windowView.draw(frame);
  buildView.draw(frame);
  routeView.draw();
  if (saveClock > 5000) {
    saveClock = 0;
    save();
  }
  redraw();
}

redraw();
setInterval(tick, STEP_MS);
window.addEventListener("beforeunload", save);
