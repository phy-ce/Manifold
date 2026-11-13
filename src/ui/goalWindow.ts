// The window that says a stage's goal is met and names the next one.
import { tr } from "../i18n";
import { PLAYABLE_STAGES, STAGES, itemName } from "../content";
import { GameState } from "../engine/game";

export class GoalWindow {
  readonly root = document.createElement("div");

  constructor(private readonly game: () => GameState, redraw: () => void) {
    const win = this.root;
    win.className = "win";
    win.hidden = true;
    win.innerHTML = `<div class="window"><h2></h2><p></p></div>`;
    const keepPlaying = document.createElement("button");
    keepPlaying.type = "button";
    keepPlaying.className = "tech";
    keepPlaying.textContent = tr("계속하기");
    keepPlaying.addEventListener("click", () => {
      this.game().announced = null;
      redraw();
    });
    win.firstElementChild!.append(keepPlaying);
  }

  /** Hidden while `covered`: the turn of an age takes the window's place. */
  draw(covered: boolean): void {
    const state = this.game();
    const win = this.root;
    win.hidden = !state.announced || covered;
    if (state.announced && win.dataset.stage !== state.announced) {
      win.dataset.stage = state.announced;
      // Stages inside an age go unnamed: the window says the goal is met and what the next one is.
      win.querySelector("h2")!.textContent = tr("목표 달성");
      const next = STAGES[state.stage];
      win.querySelector("p")!.textContent = state.stage < PLAYABLE_STAGES && next
        ? `${tr("다음 목표:")} ${itemName(next.goal.item)} ${next.goal.amount}`
        : tr("다음 목표는 아직 준비 중입니다.");
    }
  }
}
