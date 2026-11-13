// The page: makes the game state, builds the views onto it, wires them together and runs the loop. Each view
// takes the state through a getter, since a new game, a test set or a load replaces it.
import { advanceTutorial, elsewhere } from "./engine/tutorial";
import { restart } from "./i18n";
import "./style.css";
import { STAGES } from "./content";
import { GameState, stairHere, leaveCave, STEP_MS, atBase, createGame, createTestGame, loadSave, step, walk, WALK_TICK, walkTo, nearestStair, underground } from "./engine/game";
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
import { Scenery } from "./ui/scenery";
import { Weather } from "./ui/weather";
import { EraTransition } from "./ui/eraTransition";
import { MapView } from "./ui/mapView";
import { setSlotStage } from "./ui/slots";
import { applyTheme } from "./ui/theme";
import { installTooltip } from "./ui/tooltip";
import { keepFitted } from "./ui/fitColumn";
import { TopBar } from "./ui/topBar";
import { makeMenus } from "./ui/gameMenu";
import { Hurt } from "./ui/hurt";
import { TutorialCard, pointFill } from "./ui/tutorialCard";
import { installEscape, installKeys } from "./ui/keys";
import { BagWindow } from "./ui/bagWindow";
import { GearWindow } from "./ui/gearWindow";
import { HeldStack } from "./ui/heldStack";
import { GoalWindow } from "./ui/goalWindow";

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
const top = new TopBar(game);
const { travel } = top;
const help = new HelpWindow();
top.helpButton.addEventListener("click", () => help.toggle(true));
const { menu, tests, guideAgain } = makeMenus({
  startTest: (set) => {
    state = createTestGame(Math.floor(Math.random() * 100000), set);
    save();
    restart();
  },
  newGame: () => {
    state = createGame(Math.floor(Math.random() * 100000));
    screen = "base";
    windowView.close();
    save();
    restart();
  },
  guideAgain: () => {
    state.tutorial = { step: 0, off: false };
    card.unfold();
    advanceTutorial(state);
    menu.close();
    redraw();
  },
});
top.menuButton.addEventListener("click", () => menu.open());

const hurt = new Hurt(game, top.vitals);
const card = new TutorialCard(game, redraw);

const windowView = new MachineWindow(game, redraw, () => top.speed);
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
top.saveButton.addEventListener("click", () => {
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

const bag = new BagWindow(game, redraw, () => gear.toggle());
const gear = new GearWindow(game, redraw);
const { keyWalk } = installKeys({
  game,
  redraw,
  closeWindows,
  itemIndex,
  map,
  travel,
  toggleBag: () => bag.toggle(),
  toggleGear: () => gear.toggle(),
});
const held = new HeldStack(game);
const win = new GoalWindow(game, redraw);

// The biome's landscape behind everything, first in the page so all else stands over it.
const scenery = new Scenery();
document.body.prepend(scenery.root);
// Desert and snow weather: over the whole screen, the map included.
const weather = new Weather(() => null);
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
app.append(card.root, card.mini);
app.append(top.root, map.side, graph.side, map.root, graph.root, hurt.notice, rightCol, bag.hotbar, bag.root, gear.root, windowView.root, routeView.root, saveView.root, help.root, win.root, menu.root, tests.root);
// The side columns shrink to fit the window rather than scroll.
keepFitted([map.side, graph.side, rightCol]);

installEscape({
  menu,
  tests,
  gear: gear.root,
  bag: bag.root,
  busy: () => windowView.isOpen || routeView.isOpen || !saveView.root.hidden || !help.root.hidden || graph.busy,
});

travel.addEventListener("click", () => {
  const stair = underground(state) ? nearestStair(state) : undefined;
  if (atBase(state)) screen = screen === "base" ? "map" : "base";
  // On the stair the button climbs out; elsewhere underground it walks to the nearest stair the player has seen.
  else if (stairHere(state)) leaveCave(state);
  else if (stair) walkTo(state, stair);
  else if (!underground(state)) walkTo(state, BASE);
  redraw();
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
  map.setPaused(top.speed === 0);
  graph.setPaused(top.speed === 0);

  top.draw(home, screen, showBase ? "" : map.where);
  hurt.draw();
  bag.draw();
  gear.draw();
  held.draw();
  win.draw(eraTurn.running);
  // With a machine or line window open, the index column sits above the dark back (style.css).
  app.classList.toggle("index-beside", windowView.isOpen || routeView.isOpen);
  const lesson = card.draw();
  top.vitals.classList.toggle("tutorial-target", lesson?.id === "vitals");
  bag.bagKey.classList.toggle("tutorial-target", lesson?.id === "bag");
  itemIndex.root.classList.toggle("tutorial-target", lesson?.id === "index");
  const fillPointing = lesson?.id === "fill" && !card.peeking;
  guideAgain.disabled = state.stage > 0;
  // The travel button is pointed out when the step needs the player somewhere else.
  travel.classList.toggle("tutorial-target", !!lesson && elsewhere(state, lesson, home && screen === "base"));
  // On the map, a step that needs a vein points at the search box to find it by name.
  map.pointSearch(!!lesson?.search && !(home && screen === "base") && !underground(state));
  graph.setStage(state.stage);
  setSlotStage(state.stage);
  itemIndex.sync();
  if (showBase) graph.draw();
  else map.draw();
  // Last, after the board, the index and the windows have drawn: a redraw of theirs would wipe the marks.
  pointFill(state, fillPointing, windowView, itemIndex, graph, app);
}

let last = performance.now();
let backlog = 0;
let frame = 0;
let saveClock = 0;
/** Play time since the last copy into the automatic slot; paused time does not count. */
let autoClock = 0;

/** Game time walked but not yet stepped into the world: the world moves every STEP_MS, walking every WALK_TICK. */
let worldClock = 0;
/** Real time since the screen last drew in full. */
let drawClock = 0;

/**
 * Runs every WALK_TICK so steps land when they are due. The world only changes every STEP_MS, so the screen
 * draws in full that often, and in between only when the player has moved.
 */
function tick(): void {
  const now = performance.now();
  const dt = now - last;
  last = now;
  // The menu stops the world while it is open, as a pause would; the chosen speed comes back when it closes.
  const pace = menu.isOpen || tests.isOpen || eraTurn.running ? 0 : top.speed;
  backlog = Math.min(backlog + dt * pace, MAX_CATCH_UP_MS * Math.max(1, pace));
  const { x, y } = state.player;
  const z = state.z;
  while (backlog >= WALK_TICK) {
    keyWalk();
    walk(state, WALK_TICK);
    worldClock += WALK_TICK;
    if (worldClock >= STEP_MS) {
      worldClock -= STEP_MS;
      step(state, 0);
    }
    backlog -= WALK_TICK;
  }
  saveClock += dt;
  if (pace > 0) autoClock += dt;
  drawClock += dt;
  const moved = state.player.x !== x || state.player.y !== y || state.z !== z;
  if (drawClock < STEP_MS) {
    // Between full draws only a step that just landed is shown.
    if (moved) redraw();
    return;
  }
  drawClock = 0;
  if (autoClock >= AUTO_SAVE_MS) {
    autoClock = 0;
    autoSave(state);
  }
  // Window animations count in full draws, a tenth of a second each, as before.
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
setInterval(tick, WALK_TICK);
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
    setSpeed: (value: number) => top.setSpeed(value),
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
