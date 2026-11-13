// The one bar along the top: the goal and the vitals on the left; where the player is, the travel button, the
// game speed, save, help and the menu in a fixed row at the right.
import { tr } from "../i18n";
import { PLAYABLE_STAGES, STAGES, eraName, itemColor, itemName } from "../content";
import { GameState, MAX_VITAL, goalMade, carryLimit, SEASON_MS, SEASON_NAMES, isWeak, carried, overloaded, yearAt, stairHere, underground } from "../engine/game";

/** Characters in the goal's progress bar. */
const GOAL_BAR = 12;
// Game speed: 0 pauses.
const SPEEDS: [string, number][] = [["||", 0], ["1x", 1], ["2x", 2], ["4x", 4]];
const LOW_VITAL = 25;
const STRAIN_MS = 600;

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

function meter(label: string, value: number, kind = ""): string {
  const cells = 10;
  const fill = Math.ceil((value / MAX_VITAL) * cells);
  const low = value <= LOW_VITAL ? " low" : "";
  // Health and hunger read at a glance: the bar in its own colour, the number bold; the rest of the line stays quiet.
  return `<span class="meter${low}${kind ? ` ${kind}` : ""}">${label} <span class="meter-bar">[${"#".repeat(fill).padEnd(cells, ".")}]</span> <b>${String(value).padStart(String(MAX_VITAL).length)}</b></span>`;
}

export class TopBar {
  readonly root = document.createElement("header");
  readonly goal = document.createElement("div");
  readonly vitals = document.createElement("div");
  readonly travel = document.createElement("button");
  readonly saveButton = document.createElement("button");
  readonly helpButton = document.createElement("button");
  readonly menuButton = document.createElement("button");
  /** Where the player is from home, just left of the button that takes them there. */
  readonly placeLine = document.createElement("span");
  speed = 1;
  private readonly speedButtons: HTMLButtonElement[];
  /** Until when the load meter jolts, after a dig the load stopped. */
  private strainUntil = 0;

  constructor(private readonly game: () => GameState) {
    const { root: top, goal, vitals, travel, saveButton, helpButton, menuButton, placeLine } = this;
    top.className = "top";
    goal.className = "goal";
    travel.type = "button";
    travel.className = "tech";
    vitals.className = "vitals";
    saveButton.type = "button";
    saveButton.className = "tech";
    saveButton.textContent = tr("저장");

    const speedBar = document.createElement("div");
    speedBar.className = "modes";
    const speedButtons = SPEEDS.map(([label, value]) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = `tech ${value === this.speed ? "selected" : ""}`;
      b.textContent = label;
      b.setAttribute("aria-label", value ? `${value}${tr("배속")}` : tr("일시정지"));
      b.addEventListener("click", () => {
        this.speed = value;
        speedButtons.forEach((other, i) => other.classList.toggle("selected", SPEEDS[i][1] === this.speed));
      });
      return b;
    });
    this.speedButtons = speedButtons;
    speedBar.append(...speedButtons);
    helpButton.type = "button";
    helpButton.className = "tech";
    helpButton.textContent = "?";
    helpButton.dataset.tip = tr("조작 도움말 (단축키 ?)");
    helpButton.setAttribute("aria-label", tr("조작 도움말"));
    // Status on the left may wrap; the buttons stay in one fixed row at the right, so nothing pushes them.
    const topStatus = document.createElement("div");
    topStatus.className = "top-status";
    topStatus.append(goal, vitals);
    const topActions = document.createElement("div");
    topActions.className = "top-actions";
    // New game and test start live in the Escape menu, away from everyday buttons.
    menuButton.type = "button";
    menuButton.className = "tech";
    menuButton.textContent = tr("메뉴");
    menuButton.dataset.tip = tr("메뉴 (Esc)");
    placeLine.className = "place-line";
    topActions.append(placeLine, travel, speedBar, saveButton, helpButton, menuButton);
    top.append(topStatus, topActions);
    travel.dataset.tip = tr("단축키 M");
    window.addEventListener("manifold:too-heavy", () => {
      this.strainUntil = performance.now() + STRAIN_MS;
    });
  }

  /** Sets the game speed as its button would. */
  setSpeed(value: number): void {
    this.speedButtons[SPEEDS.findIndex(([, v]) => v === value)]?.click();
  }

  /** `home` is whether the player is at the base, `screen` what shows there, `where` the map's line for the place. */
  draw(home: boolean, screen: "base" | "map", where: string): void {
    const state = this.game();
    const { goal, vitals, travel, placeLine } = this;
    const place = home ? (screen === "base" ? tr("지도") : tr("기지로")) : underground(state) ? (stairHere(state) ? tr("나가기") : tr("출구로")) : tr("기지로 복귀");
    if (travel.textContent !== place) travel.textContent = place;
    if (placeLine.textContent !== where) placeLine.textContent = where;
    const stage = STAGES[Math.min(state.stage, PLAYABLE_STAGES - 1)];
    const { item, amount } = stage.goal;
    const made = goalMade(state);
    const target = `${stage.id}|${made}`;
    if (goal.dataset.key !== target) {
      goal.dataset.key = target;
      const shown = Math.min(made, amount);
      const fill = Math.round((shown / amount) * GOAL_BAR);
      goal.innerHTML = `<span class="goal-tag">${tr("목표")}</span><span class="goal-stage">${eraName(state.stage)}</span>` +
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
      weightMeter(carried(state), Number(limit), over, performance.now() < this.strainUntil) +
      `<span class="meter low${weak ? "" : " reserve"}">${tr("쇠약")} ${String(weakLeft).padStart(2)}${tr("초")}</span>`;
    if (vitals.innerHTML !== shown) vitals.innerHTML = shown;
  }
}
