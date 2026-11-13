// The S0 tutorial: a card at the foot of the right column saying what to do next, with a way to turn it off; and
// the fill step's pointing at the board, the machine window and the index.
import { tr } from "../i18n";
import { WORKBENCH } from "../content";
import { GameState } from "../engine/game";
import { SECTIONS, TUTORIAL, TutorialStep, acknowledgeStep, currentStep, dismissTip, pendingTip } from "../engine/tutorial";
import { GraphView } from "./graphView";
import { ItemIndex } from "./itemIndex";
import { MachineWindow } from "./machineWindow";

// Folding the card leaves a small box in the corner showing the section; clicking it opens the card again.
// Kept in the browser, as a preference of the screen, not of the game.
const FOLD_KEY = "manifold-tutorial-folded";

export class TutorialCard {
  readonly root = document.createElement("div");
  /** The small box in the corner the card folds into. */
  readonly mini = document.createElement("button");
  private readonly guideTag = document.createElement("span");
  private readonly guideText = document.createElement("span");
  private readonly guideFold = document.createElement("button");
  private readonly guidePrev: HTMLButtonElement;
  private readonly guideNext: HTMLButtonElement;
  private readonly guideList = document.createElement("div");
  private guideFolded = (() => {
    try {
      return localStorage.getItem(FOLD_KEY) === "1";
    } catch {
      return false;
    }
  })();
  /**
   * The step the card shows when the player looks back with 이전: an earlier step's words, read again. Progress is
   * not touched; null shows the current step.
   */
  private guidePeek: number | null = null;

  constructor(private readonly game: () => GameState, redraw: () => void) {
    const { root: guide, mini: guideMini, guideTag, guideText, guideFold, guideList } = this;
    guide.className = "box tutorial";
    guide.setAttribute("role", "status");
    guide.hidden = true;
    guideTag.className = "tutorial-tag";
    guideText.className = "tutorial-text";
    const setFolded = (folded: boolean) => {
      this.guideFolded = folded;
      try {
        localStorage.setItem(FOLD_KEY, folded ? "1" : "0");
      } catch {
        // Only a convenience.
      }
      redraw();
    };
    guideFold.type = "button";
    guideFold.className = "tech push";
    guideFold.textContent = tr("접기");
    guideFold.addEventListener("click", () => setFolded(true));
    guideMini.type = "button";
    guideMini.className = "tutorial-mini";
    guideMini.hidden = true;
    guideMini.setAttribute("aria-label", tr("튜토리얼"));
    guideMini.addEventListener("click", () => setFolded(false));
    const guideButton = (label: string, run: () => void) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "tech";
      b.textContent = label;
      b.addEventListener("click", () => {
        run();
        redraw();
      });
      return b;
    };
    // 이전 looks back a step; 다음 comes forward again, and on the current step moves on from one only for reading
    // (or closes a tip). Both at the top right; 접기 sits in the card's corner, where the folded box will be.
    const guidePrev = guideButton(tr("이전"), () => {
      const at = this.guidePeek ?? this.game().tutorial?.step ?? 0;
      this.guidePeek = Math.max(0, at - 1);
    });
    const guideNext = guideButton(tr("다음"), () => {
      const state = this.game();
      const tip = pendingTip(state);
      if (tip) dismissTip(state, tip.id);
      else if (this.guidePeek !== null) this.guidePeek = this.guidePeek + 1 >= (state.tutorial?.step ?? 0) ? null : this.guidePeek + 1;
      else acknowledgeStep(state);
    });
    this.guidePrev = guidePrev;
    this.guideNext = guideNext;
    guidePrev.classList.add("push");
    guideFold.classList.remove("push");
    guideFold.classList.add("tutorial-fold");
    const guideHead = document.createElement("div");
    guideHead.className = "tutorial-head";
    guideHead.append(guideTag, guidePrev, guideNext);
    guideList.className = "tutorial-list";
    guide.append(guideHead, guideList, guideText, guideFold);
  }

  /** Opens the card again, as when the tutorial starts over; not kept as the folding preference. */
  unfold(): void {
    this.guideFolded = false;
  }

  /** Whether the card shows an earlier step, looked back at with 이전. */
  get peeking(): boolean {
    return this.guidePeek !== null;
  }

  /** Draws the card; returns the step the player is on, if any (none while a tip shows). */
  draw(): TutorialStep | null {
    const state = this.game();
    const { root: guide, mini: guideMini, guideTag, guideText, guideFold, guidePrev, guideNext, guideList } = this;
    // A tip (the first cave, say) takes the card for a moment, ahead of the step; then the step comes back.
    const tip = pendingTip(state);
    const lesson = tip ? null : currentStep(state);
    // Folded, only the corner box shows; a tip opens the card regardless, as it comes once.
    guide.hidden = (!lesson && !tip) || (this.guideFolded && !tip);
    guideMini.hidden = !lesson || !this.guideFolded || !!tip;
    guideList.hidden = !!tip;
    // Looking back past the current step makes no sense once progress has caught up with it.
    if (this.guidePeek !== null && this.guidePeek >= (state.tutorial?.step ?? 0)) this.guidePeek = null;
    guidePrev.hidden = !!tip;
    guidePrev.disabled = (this.guidePeek ?? state.tutorial?.step ?? 0) <= 0;
    guideNext.disabled = !tip && this.guidePeek === null && !lesson?.ack;
    guideFold.hidden = !!tip;
    const nextLabel = tip ? tr("확인") : tr("다음");
    if (guideNext.textContent !== nextLabel) guideNext.textContent = nextLabel;
    if (tip) {
      if (guideTag.textContent !== tr(tip.title)) guideTag.textContent = tr(tip.title);
      if (guideText.textContent !== tr(tip.text)) guideText.textContent = tr(tip.text);
    }
    if (lesson) {
      // One section at a time: its name and number, its steps as a checklist, and what to do for the step shown
      // (the current one, or the one looked back at with 이전). The marks always follow real progress.
      const at = state.tutorial!.step;
      const shown = this.guidePeek ?? at;
      const part = SECTIONS.findIndex((p) => p.steps.includes(shown));
      const tag = `${part + 1}/${SECTIONS.length} ${tr(SECTIONS[part].name)}`;
      const mini = `${part + 1}/${SECTIONS.length}`;
      if (guideMini.textContent !== mini) guideMini.textContent = mini;
      if (guideTag.textContent !== tag) guideTag.textContent = tag;
      const list = SECTIONS[part].steps.map((i) => {
        const mark = i < at ? "[x]" : i === at ? "[>]" : "[ ]";
        const look = i === shown && shown !== at ? " look" : "";
        return `<div class="tutorial-item ${i < at ? "done" : i === at ? "now" : ""}${look}">${mark} ${tr(TUTORIAL[i].title)}</div>`;
      }).join("");
      if (guideList.dataset.shown !== list) guideList.innerHTML = guideList.dataset.shown = list;
      const text = tr(TUTORIAL[shown].text);
      if (guideText.textContent !== text) guideText.textContent = text;
    }
    return lesson;
  }
}

/** What the fill step makes at the workbench. */
const FILL_FORM = "open_kiln";
/**
 * The fill step, one thing lit at a time where it is on screen: the workbench on the board until its window is
 * open; then the S0 group and its open kiln, until that is chosen; then 도감으로 이동, until the index shows the
 * open kiln; then the recipe's + in the index. Off, it clears them all.
 */
export function pointFill(state: GameState, on: boolean, windowView: MachineWindow, itemIndex: ItemIndex, graph: GraphView, app: HTMLElement): void {
  const node = windowView.openNode === null ? undefined : state.nodes.find((n) => n.id === windowView.openNode);
  const bench = on && windowView.isOpen && node?.type === WORKBENCH ? node : undefined;
  const at = !on ? "" : !bench ? "board" : bench.form !== FILL_FORM ? "form" : itemIndex.shown !== FILL_FORM ? "go" : "plus";
  graph.point(at === "board" ? WORKBENCH : null);
  const lit = (selector: string, want: boolean) => document.querySelectorAll(selector).forEach((el) => el.classList.toggle("tutorial-target", want));
  lit(".machine-window .form-pick", false);
  lit(`.machine-window .form-pick[data-forms~="${FILL_FORM}"], .machine-window [data-form="${FILL_FORM}"]`, at === "form");
  lit(".codex-go", at === "go");
  lit(".dock .fill-plus", at === "plus");
  // The + is in the index column, dimmed behind the window: while it is the thing to press, the column stays lit.
  app.classList.toggle("index-lit", at === "plus");
}
