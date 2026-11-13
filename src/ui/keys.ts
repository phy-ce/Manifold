// The game's keyboard: shortcuts for the windows, walking with WASD, the map's action keys, and Escape.
// Physical keys, so these still work while the keyboard is set to Korean.
import { GameState, face, leaveCave, setSafeWalk, stairHere, startProbe, underground, walkStep } from "../engine/game";
import { ItemIndex } from "./itemIndex";
import { MapView } from "./mapView";
import { MenuWindow } from "./menuWindow";

/** How long M is held on a stair to climb out of a cave, in ms. */
const CLIMB_HOLD_MS = 500;
// WASD walks on the map. Held keys keep walking at the normal pace, one cell per finished step.
const WALK_KEYS: Record<string, [number, number]> = { KeyW: [0, -1], KeyS: [0, 1], KeyA: [-1, 0], KeyD: [1, 0] };
/** A key for a new direction only turns the player; held this long, it walks on that way. */
const TURN_HOLD_MS = 180;

/** What the keys reach. Everything is looked up when a key is pressed, so it may be made after the keys. */
export interface KeyTargets {
  game: () => GameState;
  redraw: () => void;
  closeWindows: () => void;
  itemIndex: ItemIndex;
  map: MapView;
  /** The top bar's travel button, which M presses. */
  travel: HTMLButtonElement;
  toggleBag: () => void;
  toggleGear: () => void;
}

/** Installs the keys; the game loop calls `keyWalk` every walk tick so held keys walk on. */
export function installKeys(t: KeyTargets): { keyWalk: () => void } {
  const { game, redraw, closeWindows, itemIndex, map, travel } = t;
  let climbTimer = 0;
  window.addEventListener("keyup", (e) => {
    if (e.code === "KeyM") clearTimeout(climbTimer);
  });
  window.addEventListener("keydown", (e) => {
    if (e.target instanceof HTMLInputElement || e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
    const state = game();
    if (e.code === "KeyG") {
      e.preventDefault(); // the G must not land in the search box it focuses
      itemIndex.focus();
    }
    if (e.code === "KeyK") t.toggleGear();
    if (e.code === "KeyI") t.toggleBag();
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
          const now = game();
          if (underground(now) && stairHere(now)) leaveCave(now);
          redraw();
        }, CLIMB_HOLD_MS);
      } else travel.click();
    }
  });

  const heldWalk = new Set<string>();
  const onMap = (): boolean => !map.root.hidden && !document.querySelector(".window-back:not([hidden]), .win:not([hidden])");
  /** Until when a fresh turn holds the player in place. */
  let turnUntil = 0;
  /** The way the held keys point together. */
  function heldWay(): [number, number] {
    let dx = 0;
    let dy = 0;
    for (const code of heldWalk) {
      dx += WALK_KEYS[code][0];
      dy += WALK_KEYS[code][1];
    }
    return [Math.sign(dx), Math.sign(dy)];
  }
  function keyWalk(): void {
    const state = game();
    if (!heldWalk.size || state.path.length > 1 || !onMap() || performance.now() < turnUntil) return;
    // Only start a new step once the one under way is done, or straight away from standing still.
    if (!state.path.length) walkStep(state, ...heldWay());
  }
  window.addEventListener("keydown", (e) => {
    if (!(e.code in WALK_KEYS) || e.target instanceof HTMLInputElement || e.ctrlKey || e.metaKey || e.altKey || !onMap()) return;
    e.preventDefault();
    if (e.repeat) return;
    const state = game();
    // A key takes over from a walk set by clicking.
    if (!heldWalk.size && state.path.length > 1) state.path = [];
    heldWalk.add(e.code);
    // A key that points a new way stops the player and turns them; one that keeps the way they face walks on at once.
    // Before the first turn there is no way faced yet, so the first key just walks.
    const [dx, dy] = heldWay();
    if (state.facing && face(state, dx, dy)) {
      state.path = [];
      state.walkTimer = 0;
      turnUntil = performance.now() + TURN_HOLD_MS;
    }
    keyWalk();
    redraw();
  });
  window.addEventListener("keyup", (e) => {
    heldWalk.delete(e.code);
  });
  // Q prospects, underground: on the left hand, beside WASD, F and the rest.
  window.addEventListener("keydown", (e) => {
    if (e.code !== "KeyQ" || e.repeat || e.target instanceof HTMLInputElement || e.ctrlKey || e.metaKey || e.altKey || !onMap()) return;
    if (startProbe(game())) redraw();
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
  return { keyWalk };
}

/** What Escape closes, in order, before it opens the menu. */
export interface EscapeTargets {
  menu: MenuWindow;
  tests: MenuWindow;
  gear: HTMLElement;
  bag: HTMLElement;
  /** Whether another window or the board's own work has Escape to itself. */
  busy: () => boolean;
}

/**
 * Escape first closes whatever is open; only with nothing to cancel does it open the menu.
 * This runs in the capture phase, before the windows' own Escape handlers close them.
 */
export function installEscape({ menu, tests, gear, bag, busy }: EscapeTargets): void {
  window.addEventListener("keydown", (e) => {
    if (e.key !== "Escape" || e.target instanceof HTMLInputElement) return;
    if (tests.isOpen) return tests.close();
    if (menu.isOpen) return menu.close();
    if (!gear.hidden) {
      gear.hidden = true;
      return;
    }
    if (!bag.hidden) {
      bag.hidden = true;
      return;
    }
    if (!busy()) menu.open();
  }, true);
}
