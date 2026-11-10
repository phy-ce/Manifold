import { SECTIONS, TUTORIAL, acknowledgeStep, dismissTip, pendingTip, advanceTutorial, currentStep, elsewhere } from "./engine/tutorial";
import { tr, restart } from "./i18n";
import "./style.css";
import { GEAR_SLOTS, PLAYABLE_STAGES, STAGES, gearFor, itemCode, itemColor, itemName } from "./content";
import { GameState, HurtCause, creatureInfo, stairHere, leaveCave, MAX_VITAL, goalMade, carryLimit, clickGear, SEASON_MS, SEASON_NAMES, STEP_MS, atBase, isWeak, carried, clickStack, createGame, createTestGame, eat, overloaded, loadSave, setSafeWalk, sortSlots, step, trashCursor, yearAt, walkStep, walkTo, wheelStack, nearestStair, underground, startProbe } from "./engine/game";
import { BASE } from "./engine/world";
import * as engine from "./engine/game";
import * as content from "./content";
import * as world from "./engine/world";
import { GraphView } from "./ui/graphView";
import { ItemIndex } from "./ui/itemIndex";
import { MachineWindow } from "./ui/machineWindow";
import { RouteWindow } from "./ui/routeWindow";
import { HelpWindow } from "./ui/helpWindow";
import { AUTO_SAVE_MS, SaveWindow, autoSave } from "./ui/saveWindow";
import { MenuWindow } from "./ui/menuWindow";
import { Scenery } from "./ui/scenery";
import { Weather } from "./ui/weather";
import { EraTransition } from "./ui/eraTransition";
import { setSound, soundOn } from "./ui/sound";
import { MapView } from "./ui/mapView";
import { makeSlot, paintSlot, setSlotStage } from "./ui/slots";
import { keyHintHtml } from "./ui/keyHint";
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
reset.className = "tech";
reset.textContent = tr("새 게임");
const vitals = document.createElement("div");
vitals.className = "vitals";
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
testStart.dataset.tip = tr("새 월드에서 지금까지 만든 단계가 모두 열린 채 시작합니다. 모든 광석과 금속, 부품, 기계 2대씩, 장비 한 벌, 선 재료가 있고, 모든 바이옴이 보이도록 지도를 넓게 밝혀 둡니다");
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
// Status on the left may wrap; the buttons stay in one fixed row at the right, so nothing pushes them.
const topStatus = document.createElement("div");
topStatus.className = "top-status";
topStatus.append(goal, vitals);
const topActions = document.createElement("div");
topActions.className = "top-actions";
// New game and test start live in the Escape menu, away from everyday buttons.
const menuButton = document.createElement("button");
menuButton.type = "button";
menuButton.className = "tech";
menuButton.textContent = tr("메뉴");
menuButton.dataset.tip = tr("메뉴 (Esc)");
// One switch for every sound, quiet by default.
const soundButton = document.createElement("button");
soundButton.type = "button";
soundButton.className = "tech";
const showSound = () => {
  soundButton.textContent = soundOn() ? tr("소리 켜짐") : tr("소리 꺼짐");
  soundButton.setAttribute("aria-pressed", String(soundOn()));
};
showSound();
soundButton.addEventListener("click", () => {
  setSound(!soundOn());
  showSound();
});
// From the menu: start the tutorial again from the top, while still in S0.
const guideAgain = document.createElement("button");
guideAgain.type = "button";
guideAgain.className = "tech";
guideAgain.textContent = tr("튜토리얼 다시 보기");
guideAgain.addEventListener("click", () => {
  state.tutorial = { step: 0, off: false };
  guideFolded = false;
  advanceTutorial(state);
  menu.close();
  redraw();
});
const menu = new MenuWindow([soundButton, guideAgain, testStart, reset]);
menuButton.addEventListener("click", () => menu.open());
topActions.append(travel, speedBar, saveButton, helpButton, menuButton);
top.append(topStatus, topActions);

// A small number shows the damage taken, and the screen's edges glow red for a moment, stronger for a
// bigger blow. Only the edges: a flash over the whole picture was hard on the eyes.
const hurtFlash = document.createElement("div");
hurtFlash.className = "hurt";
hurtFlash.setAttribute("aria-hidden", "true");
const hurtEdge = document.createElement("div");
hurtEdge.className = "hurt-edge";
hurtEdge.setAttribute("aria-hidden", "true");
document.body.append(hurtFlash, hurtEdge);
/** Damage at which the red edge is at its strongest. */
const HURT_FULL = 10;
let lastHp = state.hp;
/** Matches the longest hurt animation in style.css. */
const HURT_MS = 1600;
let hurtTimer = 0;

/** The words for what took the health, shown with the amount: "체력 -3 늑대". */
function hurtCause(cause: HurtCause | undefined): string {
  if (cause === "melee" || cause === "ranged" || cause === "yeti") return tr(creatureInfo(cause).name);
  return cause === "water" ? tr("물") : cause === "hill" ? tr("고도 변화") : cause === "hunger" ? tr("굶주림") : "";
}

function showHurt(amount: number): void {
  hurtFlash.textContent = `${tr("체력")} -${amount} ${hurtCause(state.hurtBy)}`.trim();
  hurtEdge.style.setProperty("--hurt", String(0.35 + 0.65 * Math.min(1, amount / HURT_FULL)));
  for (const el of [hurtFlash, hurtEdge, vitals]) {
    el.classList.remove("hit");
    void el.offsetWidth; // restart the animation if it is already running
    el.classList.add("hit");
  }
  // The clock rebuilds the vitals every second, which would replay a mark left on them.
  clearTimeout(hurtTimer);
  hurtTimer = window.setTimeout(() => {
    hurtFlash.classList.remove("hit");
    hurtEdge.classList.remove("hit");
    vitals.classList.remove("hit");
  }, HURT_MS);
}

// The S0 tutorial: a card at the foot of the right column saying what to do next, with a way to turn it off.
const guide = document.createElement("div");
guide.className = "box tutorial";
guide.setAttribute("role", "status");
guide.hidden = true;
const guideTag = document.createElement("span");
guideTag.className = "tutorial-tag";
const guideText = document.createElement("span");
guideText.className = "tutorial-text";
// Folding the card leaves a small box in the corner showing the section; clicking it opens the card again.
// Kept in the browser, as a preference of the screen, not of the game.
const FOLD_KEY = "manifold-tutorial-folded";
let guideFolded = (() => {
  try {
    return localStorage.getItem(FOLD_KEY) === "1";
  } catch {
    return false;
  }
})();
const setFolded = (folded: boolean) => {
  guideFolded = folded;
  try {
    localStorage.setItem(FOLD_KEY, folded ? "1" : "0");
  } catch {
    // Only a convenience.
  }
  redraw();
};
const guideFold = document.createElement("button");
guideFold.type = "button";
guideFold.className = "tech push";
guideFold.textContent = tr("접기");
guideFold.addEventListener("click", () => setFolded(true));
const guideMini = document.createElement("button");
guideMini.type = "button";
guideMini.className = "tutorial-mini";
guideMini.hidden = true;
guideMini.setAttribute("aria-label", tr("튜토리얼"));
guideMini.addEventListener("click", () => setFolded(false));
const guideHead = document.createElement("div");
guideHead.className = "tutorial-head";
guideHead.append(guideTag, guideFold);
// A step that is only for reading moves on with this.
const guideNext = document.createElement("button");
guideNext.type = "button";
guideNext.className = "tech tutorial-next";
guideNext.textContent = tr("다음");
guideNext.addEventListener("click", () => {
  const tip = pendingTip(state);
  if (tip) dismissTip(state, tip.id);
  else acknowledgeStep(state);
  redraw();
});
const guideList = document.createElement("div");
guideList.className = "tutorial-list";
guide.append(guideHead, guideList, guideText, guideNext);
const notice = document.createElement("div");
notice.className = "notice";
notice.hidden = true;
let noticeUntil = 0;
const NOTICE_MS = 6000;
const LOW_VITAL = 25;

/**
 * The load, read like health and hunger: a bar that fills as the bag gets heavier. Over the limit it turns red and
 * pulses; a dig or pick the load just stopped makes it jolt, so the player sees why nothing happened.
 */
function weightMeter(load: number, limit: number, over: boolean, strain: boolean): string {
  const cells = 10;
  const fill = Math.min(cells, Math.ceil((load / limit) * cells));
  const digits = String(limit).length;
  return `<span class="meter vital weight${over ? " low" : ""}${strain ? " strain" : ""}">${tr("무게")} <span class="meter-bar">[${"#".repeat(fill).padEnd(cells, ".")}]</span> <b>${String(load).padStart(digits)}/${limit}</b></span>`;
}
/** Until when the load meter jolts, after a dig the load stopped. */
let strainUntil = 0;
const STRAIN_MS = 600;
window.addEventListener("manifold:too-heavy", () => {
  strainUntil = performance.now() + STRAIN_MS;
});

function meter(label: string, value: number, kind = ""): string {
  const cells = 10;
  const fill = Math.ceil((value / MAX_VITAL) * cells);
  const low = value <= LOW_VITAL ? " low" : "";
  // Health and hunger read at a glance: the bar in its own colour, the number bold; the rest of the line stays quiet.
  return `<span class="meter${low}${kind ? ` ${kind}` : ""}">${label} <span class="meter-bar">[${"#".repeat(fill).padEnd(cells, ".")}]</span> <b>${String(value).padStart(String(MAX_VITAL).length)}</b></span>`;
}

const windowView = new MachineWindow(game, redraw, () => speed);
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
  routeView.close();
}
const graph = new GraphView(
  game,
  (id) => {
    closeWindows();
    windowView.open(id);
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
travel.dataset.tip = tr("단축키 M");
/** How long M is held on a stair to climb out of a cave, in ms. */
const CLIMB_HOLD_MS = 500;
let climbTimer = 0;
window.addEventListener("keyup", (e) => {
  if (e.code === "KeyM") clearTimeout(climbTimer);
});
// Physical keys, so these still work while the keyboard is set to Korean.
window.addEventListener("keydown", (e) => {
  if (e.target instanceof HTMLInputElement || e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
  if (e.code === "KeyG") {
    e.preventDefault(); // the G must not land in the search box it focuses
    itemIndex.focus();
  }
  if (e.code === "KeyI") {
    invBox.hidden = !invBox.hidden;
    redraw();
  }
  if (e.code === "KeyT") {
    setSafeWalk(state, !state.safeWalk);
    redraw();
  }
  if (e.code === "KeyM") {
    closeWindows();
    // On a stair, M has to be held to climb out, so a tap on the way past never pulls the player up by accident.
    if (underground(state) && stairHere(state)) {
      clearTimeout(climbTimer);
      climbTimer = window.setTimeout(() => {
        if (underground(state) && stairHere(state)) leaveCave(state);
        redraw();
      }, CLIMB_HOLD_MS);
    } else travel.click();
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
// Q prospects, underground: on the left hand, beside WASD, F and the rest.
window.addEventListener("keydown", (e) => {
  if (e.code !== "KeyQ" || e.repeat || e.target instanceof HTMLInputElement || e.ctrlKey || e.metaKey || e.altKey || !onMap()) return;
  if (startProbe(state)) redraw();
});
// F is the one action key on the map: it fights a creature in sight (closing in when out of reach), and
// otherwise digs, picks or fills at the place underfoot. On the surface and underground alike.
window.addEventListener("keydown", (e) => {
  if (e.code !== "KeyF" || e.target instanceof HTMLInputElement || e.ctrlKey || e.metaKey || e.altKey || !onMap()) return;
  map.useKey(e.repeat);
});
// C closes in on the nearest creature in sight: F never walks, so a fight is never a step taken by mistake.
window.addEventListener("keydown", (e) => {
  if (e.code !== "KeyC" || e.repeat || e.target instanceof HTMLInputElement || e.ctrlKey || e.metaKey || e.altKey || !onMap()) return;
  map.approach();
});
window.addEventListener("blur", () => heldWalk.clear());
// Space is the game's own key (bellows, rhythm work). A browser would also press whatever button was last
// clicked with it, so its default is stopped everywhere but in a text box; the game's handlers still see it.
for (const type of ["keydown", "keyup"] as const) {
  window.addEventListener(type, (e) => {
    if (e.code !== "Space" || e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    e.preventDefault();
  }, true);
}

// The bag shows twice: its slots as a hotbar under the map, always there, and with the gear in the window I opens
// over the map. Both are the same slots, so either can be used.
const invBox = document.createElement("section");
invBox.className = "box inv-pop";
invBox.hidden = true;
invBox.setAttribute("aria-label", tr("인벤토리"));
const invGrid = document.createElement("div");
invGrid.className = "slot-grid bag-grid";
const hotbar = document.createElement("section");
hotbar.className = "box hotbar";
hotbar.setAttribute("aria-label", tr("가방"));
const bagSlot = (i: number) => {
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
};
const invSlots = state.inv.map((_, i) => bagSlot(i));
const hotSlots = state.inv.map((_, i) => bagSlot(i));
// The hotbar's own key: [I] opens the bag with the gear; it is a button too.
const bagKey = document.createElement("button");
bagKey.type = "button";
bagKey.className = "key-button";
bagKey.innerHTML = keyHintHtml("I", tr("가방"), "on");
bagKey.addEventListener("click", () => {
  invBox.hidden = !invBox.hidden;
  redraw();
});
hotbar.append(...hotSlots, bagKey);

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
const invTitle = document.createElement("strong");
invTitle.textContent = tr("가방");
const invKey = document.createElement("span");
invKey.className = "push";
invKey.innerHTML = keyHintHtml("I", "", "on");
invTools.append(invTitle, sortButton, trashButton, invKey);
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

// The biome's landscape behind everything, first in the page so all else stands over it.
const scenery = new Scenery();
document.body.prepend(scenery.root);
// Desert and snow weather: over the whole screen except the map.
const weather = new Weather(() => (map.root.hidden ? null : map.root.getBoundingClientRect()));
document.body.append(weather.canvas);
// The age's tones (style.css: body.era-s0, body.era-s1). Set once on loading; after that only the turn of an
// age changes them, under its cover, so a save never replays it.
const setEra = (stage: number) => {
  document.body.classList.toggle("era-s0", stage === 0);
  document.body.classList.toggle("era-s1", stage >= 1);
};
setEra(state.stage);
const eraTurn = new EraTransition();
document.body.append(eraTurn.root);
/** The stage last drawn, to see S0 end during play. */
let drawnStage = state.stage;
// The screen (docs/design/interface.md): one bar along the top; the left column for the map's tools, the map in
// the middle, the item index on the right with the tutorial card at its foot; the bag's hotbar under the map.
// At the base the board takes the left column and the middle together.
windowView.root.classList.add("beside-index");
routeView.root.classList.add("beside-index");
map.side.classList.add("left-col");
graph.side.classList.add("left-col");
const rightCol = document.createElement("div");
rightCol.className = "right-col";
rightCol.append(itemIndex.root);
// The tutorial card floats over the foot of the right column, as tall as its text, never cut short; inside #app so
// windows still cover it.
app.append(guide, guideMini);
app.append(top, map.side, graph.side, map.root, graph.root, notice, rightCol, hotbar, invBox, windowView.root, routeView.root, saveView.root, help.root, win, menu.root);

// Escape first closes whatever is open; only with nothing to cancel does it open the menu.
// This runs in the capture phase, before the windows' own Escape handlers close them.
window.addEventListener("keydown", (e) => {
  if (e.key !== "Escape" || e.target instanceof HTMLInputElement) return;
  if (menu.isOpen) return menu.close();
  if (!invBox.hidden) {
    invBox.hidden = true;
    return;
  }
  const busy = windowView.isOpen || routeView.isOpen || !saveView.root.hidden || !help.root.hidden || graph.busy;
  if (!busy) menu.open();
}, true);

travel.addEventListener("click", () => {
  const stair = underground(state) ? nearestStair(state) : undefined;
  if (atBase(state)) screen = screen === "base" ? "map" : "base";
  // On the stair the button climbs out; elsewhere underground it walks to the nearest stair the player has seen.
  else if (stairHere(state)) leaveCave(state);
  else if (stair) walkTo(state, stair);
  else if (!underground(state)) walkTo(state, BASE);
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
  // Underground there is no sky to see; on the surface, the biome underfoot.
  scenery.show(underground(state) ? null : world.biomeAt(state.player.x, state.player.y, state.seed));
  if (home && !wasHome) screen = "base"; // arriving home opens the base
  wasHome = home;
  if (!home) closeBaseWindows();
  const showBase = home && screen === "base";
  weather.canvas.hidden = menu.isOpen || !!document.querySelector(".window-back:not([hidden])");
  if (underground(state) || showBase) weather.clear();
  else weather.show(world.biomeAt(state.player.x, state.player.y, state.seed));
  // S0 ending in play turns the age: from the window the player made it in, else the goal machine on the board,
  // else the middle of the screen. The turn takes the place of S0's "complete" window.
  if (drawnStage === 0 && state.stage >= 1 && !eraTurn.running) {
    const open = windowView.isOpen ? windowView.root.querySelector(".window")?.getBoundingClientRect() : undefined;
    const origin = open ? { x: open.left + open.width / 2, y: open.top + open.height / 2 }
      : graph.nodeCenter(STAGES[0].goal.item) ?? { x: innerWidth / 2, y: innerHeight / 2 };
    eraTurn.play(origin, () => setEra(state.stage), () => {
      if (state.announced === STAGES[0].id) state.announced = null;
      redraw();
    });
  }
  drawnStage = state.stage;
  graph.root.hidden = !showBase;
  graph.side.hidden = !showBase;
  map.root.hidden = showBase;
  map.side.hidden = showBase;

  const place = home ? (screen === "base" ? tr("지도") : tr("기지로")) : underground(state) ? (stairHere(state) ? tr("나가기") : tr("출구로")) : tr("기지로 복귀");
  if (travel.textContent !== place) travel.textContent = place;
  const stage = STAGES[Math.min(state.stage, PLAYABLE_STAGES - 1)];
  const { item, amount } = stage.goal;
  const made = goalMade(state);
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
  // Every part keeps its width, so warnings and changing numbers never push the bar about.
  const limit = String(carryLimit(state));
  const over = overloaded(state);
  const weak = isWeak(state);
  const weakLeft = weak ? Math.ceil((state.weakUntil - state.time) / 1000) : 0;
  const shown = `<span class="meter">${yearAt(state.time)}${tr("년차")} ${SEASON_NAMES[state.season]} ${clock}</span>` +
    meter(tr("체력"), state.hp, "vital hp") + meter(tr("허기"), state.hunger, "vital hunger") +
    weightMeter(carried(state), Number(limit), over, performance.now() < strainUntil) +
    `<span class="meter low${weak ? "" : " reserve"}">${tr("쇠약")} ${String(weakLeft).padStart(2)}${tr("초")}</span>`;
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
  state.inv.forEach((stack, i) => {
    paintSlot(hotSlots[i], stack);
    if (!invBox.hidden) paintSlot(invSlots[i], stack);
  });
  for (const { slot, name, b } of gearSlots) {
    const id = state.gear[slot];
    paintSlot(b, id ? { id, n: 1 } : null, "gear", undefined, { name, fits: gearFor(slot) });
  }
  const wasHidden = held.hidden;
  held.hidden = !state.cursor;
  if (state.cursor) paintSlot(heldSlot, state.cursor);
  if (wasHidden && !held.hidden) held.style.transform = `translate(${pointer.x + 6}px, ${pointer.y + 6}px)`;
  trashButton.disabled = !state.cursor;
  win.hidden = !state.announced || eraTurn.running;
  if (state.announced && win.dataset.stage !== state.announced) {
    win.dataset.stage = state.announced;
    win.querySelector("h2")!.textContent = `${state.announced} ${tr("완료")}`;
    const next = STAGES[state.stage];
    win.querySelector("p")!.textContent = state.stage < PLAYABLE_STAGES ? `${tr("다음 단계:")} ${next.id} ${next.name}` : `${next.id}${tr("은 아직 준비 중입니다.")}`;
  }
  // A tip (the first cave, say) takes the card for a moment, ahead of the step; then the step comes back.
  const tip = pendingTip(state);
  const lesson = tip ? null : currentStep(state);
  // Folded, only the corner box shows; a tip opens the card regardless, as it comes once.
  guide.hidden = (!lesson && !tip) || (guideFolded && !tip);
  guideMini.hidden = !lesson || !guideFolded || !!tip;
  guideList.hidden = !!tip;
  guideNext.hidden = !tip && !lesson?.ack;
  const nextLabel = tip ? tr("확인") : tr("다음");
  if (guideNext.textContent !== nextLabel) guideNext.textContent = nextLabel;
  if (tip) {
    if (guideTag.textContent !== tr(tip.title)) guideTag.textContent = tr(tip.title);
    if (guideText.textContent !== tr(tip.text)) guideText.textContent = tr(tip.text);
  }
  vitals.classList.toggle("tutorial-target", lesson?.id === "vitals");
  bagKey.classList.toggle("tutorial-target", lesson?.id === "bag");
  itemIndex.root.classList.toggle("tutorial-target", lesson?.id === "index");
  guideAgain.disabled = state.stage > 0;
  if (lesson) {
    // One section at a time: its name and number, its steps as a checklist, and what to do for the current one.
    const at = state.tutorial!.step;
    const part = SECTIONS.findIndex((p) => p.steps.includes(at));
    const tag = `${part + 1}/${SECTIONS.length} ${tr(SECTIONS[part].name)}`;
    const mini = `${part + 1}/${SECTIONS.length}`;
    if (guideMini.textContent !== mini) guideMini.textContent = mini;
    if (guideTag.textContent !== tag) guideTag.textContent = tag;
    const list = SECTIONS[part].steps.map((i) => {
      const mark = i < at ? "[x]" : i === at ? "[>]" : "[ ]";
      return `<div class="tutorial-item ${i < at ? "done" : i === at ? "now" : ""}">${mark} ${tr(TUTORIAL[i].title)}</div>`;
    }).join("");
    if (guideList.dataset.shown !== list) guideList.innerHTML = guideList.dataset.shown = list;
    const text = tr(lesson.text);
    if (guideText.textContent !== text) guideText.textContent = text;
  }
  // The travel button is pointed out when the step needs the player somewhere else.
  travel.classList.toggle("tutorial-target", !!lesson && elsewhere(state, lesson, home && screen === "base"));
  // On the map, a step that needs a vein points at the search box to find it by name.
  map.pointSearch(!!lesson?.search && !(home && screen === "base") && !underground(state));
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
/** Play time since the last copy into the automatic slot; paused time does not count. */
let autoClock = 0;

/** The world only changes every STEP_MS, so the screen doesn't need to redraw any faster. */
function tick(): void {
  const now = performance.now();
  const dt = now - last;
  last = now;
  // The menu stops the world while it is open, as a pause would; the chosen speed comes back when it closes.
  const pace = menu.isOpen || eraTurn.running ? 0 : speed;
  backlog = Math.min(backlog + dt * pace, MAX_CATCH_UP_MS * Math.max(1, pace));
  while (backlog >= STEP_MS) {
    keyWalk();
    step(state);
    backlog -= STEP_MS;
  }
  saveClock += dt;
  if (pace > 0) autoClock += dt;
  if (autoClock >= AUTO_SAVE_MS) {
    autoClock = 0;
    autoSave(state);
  }
  frame += 1;
  windowView.draw(frame);
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

// For tools/speedrun: a dev-server-only handle to drive the game from outside and record it.
// import.meta.env.DEV is false in a build, so none of this ships.
if (import.meta.env.DEV) {
  (window as unknown as { __manifold: unknown }).__manifold = {
    game: () => state,
    engine,
    content,
    world,
    redraw,
    setSpeed: (value: number) => speedButtons[SPEEDS.findIndex(([, v]) => v === value)]?.click(),
    setScreen: (value: "base" | "map") => {
      screen = value;
      redraw();
    },
    openMachine: (id: number) => windowView.open(id),
    closeMachine: () => windowView.close(),
    beatIn: () => windowView.beatIn(),
    index: itemIndex,
  };
}
