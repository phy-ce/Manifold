import { tr, restart } from "./i18n";
import "./style.css";
import { GEAR_SLOTS, PLAYABLE_STAGES, STAGES, gearFor, itemCode, itemColor, itemName } from "./content";
import { GameState, MAX_VITAL, carryLimit, clickGear, SEASON_MS, SEASON_NAMES, STEP_MS, atBase, isWeak, carried, clickStack, createGame, createTestGame, eat, overloaded, loadSave, setSafeWalk, sortSlots, step, trashCursor, yearAt, walkStep, walkTo, wheelStack, currentCave, inCave, startProbe } from "./engine/game";
import { BASE } from "./engine/world";
import { BuildWindow } from "./ui/buildWindow";
import { GraphView } from "./ui/graphView";
import { ItemIndex } from "./ui/itemIndex";
import { MachineWindow } from "./ui/machineWindow";
import { RouteWindow } from "./ui/routeWindow";
import { HelpWindow } from "./ui/helpWindow";
import { SaveWindow } from "./ui/saveWindow";
import { MapView } from "./ui/mapView";
import { makeSlot, paintSlot, setSlotStage } from "./ui/slots";
import { applyTheme } from "./ui/theme";
import { installTooltip } from "./ui/tooltip";

applyTheme();
installTooltip();

const SAVE_KEY = "modpack-simulator-save";
const MAX_CATCH_UP_MS = 2000;

function load(): GameState {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    const saved = raw ? loadSave(JSON.parse(raw)) : null;
    if (saved) return saved;
    // A save from before fuel and power networks is kept aside rather than overwritten.
    if (raw && !localStorage.getItem(`${SAVE_KEY}-old`)) localStorage.setItem(`${SAVE_KEY}-old`, raw);
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
/** Characters in the goal's progress bar. */
const GOAL_BAR = 12;
const goal = document.createElement("div");
goal.className = "goal";
const travel = document.createElement("button");
travel.type = "button";
travel.className = "tech";
const reset = document.createElement("button");
reset.type = "button";
reset.className = "tech push";
reset.textContent = tr("새 게임");
const vitals = document.createElement("div");
vitals.className = "vitals";
const indexButton = document.createElement("button");
indexButton.type = "button";
indexButton.className = "tech";
indexButton.textContent = tr("도감");
const saveButton = document.createElement("button");
saveButton.type = "button";
saveButton.className = "tech";
saveButton.textContent = tr("저장");

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
  b.setAttribute("aria-label", value ? `${value}${tr("배속")}` : tr("일시정지"));
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
testStart.textContent = tr("테스트 시작");
testStart.dataset.tip = tr("지금까지 만든 단계가 열린 상태로, 감긴 태엽 동력기, 벨트 구동기, 제련로, 원료 창고, 부품 창고, 모든 기계 2대씩, 인벤토리의 선 재료와 함께 시작합니다");
testStart.addEventListener("click", () => {
  if (testStart.dataset.armed !== "1") {
    testStart.dataset.armed = "1";
    testStart.textContent = tr("정말 초기화?");
    setTimeout(() => {
      testStart.dataset.armed = "";
      testStart.textContent = tr("테스트 시작");
    }, 3000);
    return;
  }
  state = createTestGame(Math.floor(Math.random() * 100000));
  save();
  restart();
});
const help = new HelpWindow();
const helpButton = document.createElement("button");
helpButton.type = "button";
helpButton.className = "tech";
helpButton.textContent = "?";
helpButton.dataset.tip = tr("조작 도움말 (단축키 ?)");
helpButton.setAttribute("aria-label", tr("조작 도움말"));
helpButton.addEventListener("click", () => help.toggle(true));
top.append(goal, vitals, travel, indexButton, speedBar, saveButton, helpButton, testStart, reset);

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
// The route window shows the layer the graph is on. The graph is made below, before any window opens.
const routeView = new RouteWindow(game, redraw, () => graph.layer);
const saveView = new SaveWindow(game, (loaded) => {
  saving = false; // keep the page's unload save from overwriting what was just loaded
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(loaded));
  } catch {
    saving = true;
    return;
  }
  restart();
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
windowView.showItem = (id) => itemIndex.show(id);
indexButton.addEventListener("click", () => itemIndex.toggle());
indexButton.dataset.tip = tr("단축키 G");
travel.dataset.tip = tr("단축키 M");
// Physical keys, so these still work while the keyboard is set to Korean.
window.addEventListener("keydown", (e) => {
  if (e.target instanceof HTMLInputElement || e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
  if (e.code === "KeyG") itemIndex.toggle();
  if (e.code === "KeyT") {
    setSafeWalk(state, !state.safeWalk);
    redraw();
  }
  if (e.code === "KeyM") {
    closeWindows();
    travel.click();
  }
});

// WASD walks on the map. Held keys keep walking at the normal pace, one cell per finished step.
const WALK_KEYS: Record<string, [number, number]> = { KeyW: [0, -1], KeyS: [0, 1], KeyA: [-1, 0], KeyD: [1, 0] };
const heldWalk = new Set<string>();
const onMap = (): boolean => !map.root.hidden && !document.querySelector(".window-back:not([hidden]), .win:not([hidden])");
function keyWalk(): void {
  if (!heldWalk.size || state.path.length > 1 || !onMap()) return;
  let dx = 0;
  let dy = 0;
  for (const code of heldWalk) {
    dx += WALK_KEYS[code][0];
    dy += WALK_KEYS[code][1];
  }
  // Only start a new step once the one under way is done, or straight away from standing still.
  if (!state.path.length) walkStep(state, dx, dy);
}
window.addEventListener("keydown", (e) => {
  if (!(e.code in WALK_KEYS) || e.target instanceof HTMLInputElement || e.ctrlKey || e.metaKey || e.altKey || !onMap()) return;
  e.preventDefault();
  if (e.repeat) return;
  // A key takes over from a walk set by clicking.
  if (!heldWalk.size && state.path.length > 1) state.path = [];
  heldWalk.add(e.code);
  keyWalk();
  redraw();
});
window.addEventListener("keyup", (e) => {
  heldWalk.delete(e.code);
});
// P prospects, underground.
window.addEventListener("keydown", (e) => {
  if (e.code !== "KeyP" || e.repeat || e.target instanceof HTMLInputElement || e.ctrlKey || e.metaKey || e.altKey || !onMap()) return;
  if (startProbe(state)) redraw();
});
window.addEventListener("blur", () => heldWalk.clear());

const invBox = document.createElement("section");
invBox.className = "box";
invBox.setAttribute("aria-label", tr("인벤토리"));
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
sortButton.textContent = tr("정렬");
sortButton.addEventListener("click", () => {
  sortSlots(state.inv);
  redraw();
});
const trashButton = document.createElement("button");
trashButton.type = "button";
trashButton.className = "tech demolish";
trashButton.textContent = tr("버리기");
trashButton.dataset.tip = tr("들고 있는 아이템을 버립니다");
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
const gearSlots = GEAR_SLOTS.map(([slot, name]) => {
  const b = makeSlot(() => {
    clickGear(state, slot);
    redraw();
  });
  return { slot, name, b };
});
const gearGrid = document.createElement("div");
gearGrid.className = "gear-grid";
gearGrid.setAttribute("aria-label", tr("장비"));
gearGrid.append(...gearSlots.map((g) => g.b));
const invRow = document.createElement("div");
invRow.className = "inv-row";
invRow.append(invGrid, gearGrid);
invBox.append(invTools, invRow);

const win = document.createElement("div");
win.className = "win";
win.hidden = true;
win.innerHTML = `<div class="window"><h2></h2><p></p></div>`;
const keepPlaying = document.createElement("button");
keepPlaying.type = "button";
keepPlaying.className = "tech";
keepPlaying.textContent = tr("계속하기");
keepPlaying.addEventListener("click", () => {
  state.announced = null;
  redraw();
});
win.firstElementChild!.append(keepPlaying);

document.body.append(itemIndex.root);
app.append(top, notice, graph.root, map.root, invBox, windowView.root, buildView.root, routeView.root, saveView.root, help.root, win);

travel.addEventListener("click", () => {
  const cave = currentCave(state);
  if (atBase(state)) screen = screen === "base" ? "map" : "base";
  // Underground the way home starts at the cave's way out.
  else if (cave) walkTo(state, cave.map.entry);
  else walkTo(state, BASE);
  redraw();
});
reset.addEventListener("click", () => {
  if (reset.dataset.armed !== "1") {
    reset.dataset.armed = "1";
    reset.textContent = tr("정말 초기화?");
    setTimeout(() => {
      reset.dataset.armed = "";
      reset.textContent = tr("새 게임");
    }, 3000);
    return;
  }
  state = createGame(Math.floor(Math.random() * 100000));
  screen = "base";
  reset.dataset.armed = "";
  reset.textContent = tr("새 게임");
  windowView.close();
  save();
  restart();
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

  const place = home ? (screen === "base" ? tr("지도") : tr("기지로")) : inCave(state) ? tr("출구로") : tr("기지로 복귀");
  if (travel.textContent !== place) travel.textContent = place;
  const stage = STAGES[Math.min(state.stage, PLAYABLE_STAGES - 1)];
  const { item, amount } = stage.goal;
  const made = state.made[item] ?? 0;
  const target = `${stage.id}|${made}`;
  if (goal.dataset.key !== target) {
    goal.dataset.key = target;
    const shown = Math.min(made, amount);
    const fill = Math.round((shown / amount) * GOAL_BAR);
    goal.innerHTML = `<span class="goal-tag">${tr("목표")}</span><span class="goal-stage">${stage.id} ${stage.name}</span>` +
      `<span class="goal-item"><span style="color:${itemColor(item)}">${itemName(item)}</span> ${shown}/${amount}</span>` +
      `<span class="goal-bar">[${"#".repeat(fill).padEnd(GOAL_BAR, ".")}]</span>`;
  }
  const seasonLeft = Math.ceil((SEASON_MS - (state.time % SEASON_MS)) / 1000);
  const clock = `${Math.floor(seasonLeft / 60)}:${String(seasonLeft % 60).padStart(2, "0")}`;
  const shown = `<span class="meter">${yearAt(state.time)}${tr("년차")} ${SEASON_NAMES[state.season]} ${clock}</span>${isWeak(state) ? `<span class="meter low">${tr("쇠약")} ${Math.ceil((state.weakUntil - state.time) / 1000)}${tr("초")}</span>` : ""}` + meter(tr("체력"), state.hp) + meter(tr("허기"), state.hunger) +
    `<span class="meter${overloaded(state) ? " low" : ""}">${tr("무게")} ${carried(state)}/${carryLimit(state)}${overloaded(state) ? tr(" 초과, 이동 불가") : ""}</span>`;
  if (vitals.innerHTML !== shown) vitals.innerHTML = shown;
  // A collapse jumps health back up, so it counts as a hit even though the number rises.
  if (state.hp < lastHp) showHurt(lastHp - state.hp);
  else if (state.lost) showHurt(lastHp);
  lastHp = state.hp;
  if (state.lost) {
    const items = state.lost.map((s) => `${itemCode(s.id)} -${s.n}`).join(", ");
    notice.textContent = items ? `${tr("쓰러졌습니다. 잃은 재료:")} ${items}` : tr("쓰러졌습니다.");
    notice.hidden = false;
    noticeUntil = performance.now() + NOTICE_MS;
    state.lost = null;
  } else if (!notice.hidden && performance.now() > noticeUntil) {
    notice.hidden = true;
  }
  state.inv.forEach((stack, i) => paintSlot(invSlots[i], stack));
  for (const { slot, name, b } of gearSlots) {
    const id = state.gear[slot];
    paintSlot(b, id ? { id, n: 1 } : null, "gear", undefined, { name, fits: gearFor(slot) });
  }
  const wasHidden = held.hidden;
  held.hidden = !state.cursor;
  if (state.cursor) paintSlot(heldSlot, state.cursor);
  if (wasHidden && !held.hidden) held.style.transform = `translate(${pointer.x + 6}px, ${pointer.y + 6}px)`;
  trashButton.disabled = !state.cursor;
  win.hidden = !state.announced;
  if (state.announced && win.dataset.stage !== state.announced) {
    win.dataset.stage = state.announced;
    win.querySelector("h2")!.textContent = `${state.announced} ${tr("완료")}`;
    const next = STAGES[state.stage];
    win.querySelector("p")!.textContent = state.stage < PLAYABLE_STAGES ? `${tr("다음 단계:")} ${next.id} ${next.name}` : `${next.id}${tr("은 아직 준비 중입니다.")}`;
  }
  graph.setStage(state.stage);
  setSlotStage(state.stage);
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
    keyWalk();
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
