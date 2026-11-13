// The equipment window, apart from the bag: the player drawn as a pixel figure, each gear slot on it where that
// thing is worn or held. [K] opens it, and it drags by its title as the bag does.
import { tr } from "../i18n";
import { GEAR_SLOTS, gearFor } from "../content";
import { GameState, clickGear } from "../engine/game";
import { makeSlot, paintSlot } from "./slots";
import { keyHintHtml } from "./keyHint";
import { makeDraggable } from "./dragWindow";
import { FIGURE_H, FIGURE_SRC, FIGURE_W, SLOT_AT } from "./gearFigure";

export class GearWindow {
  readonly root = document.createElement("section");
  private readonly gearSlots: { slot: string; name: string; b: HTMLButtonElement }[];

  constructor(private readonly game: () => GameState, private readonly redraw: () => void) {
    const gearBox = this.root;
    gearBox.className = "box gear-pop";
    gearBox.hidden = true;
    gearBox.setAttribute("aria-label", tr("장비"));
    const gearTools = document.createElement("div");
    gearTools.className = "bar-row";
    const gearTitle = document.createElement("strong");
    gearTitle.textContent = tr("장비");
    const gearKey = document.createElement("span");
    gearKey.className = "push";
    gearKey.innerHTML = keyHintHtml("K", "", "on");
    gearTools.append(gearTitle, gearKey);
    const figure = document.createElement("div");
    figure.className = "gear-figure";
    figure.style.setProperty("--fig-w", `${FIGURE_W}px`);
    figure.style.setProperty("--fig-h", `${FIGURE_H}px`);
    const body = document.createElement("img");
    body.src = FIGURE_SRC;
    body.alt = "";
    body.className = "gear-body";
    figure.append(body);
    this.gearSlots = GEAR_SLOTS.map(([slot, name]) => {
      const b = makeSlot(() => {
        clickGear(this.game(), slot);
        redraw();
      });
      const [x, y] = SLOT_AT[slot] ?? [0, 0];
      b.style.setProperty("--x", `${x * FIGURE_W}px`);
      b.style.setProperty("--y", `${y * FIGURE_H}px`);
      figure.append(b);
      return { slot, name, b };
    });
    gearBox.append(gearTools, figure);
    makeDraggable(gearBox, gearTools, "gear");
  }

  /** Opens or closes the equipment window. */
  toggle(): void {
    this.root.hidden = !this.root.hidden;
    this.redraw();
  }

  draw(): void {
    const state = this.game();
    for (const { slot, name, b } of this.gearSlots) {
      paintSlot(b, state.gear[slot] ?? null, "gear", undefined, { name, fits: gearFor(slot) });
    }
  }
}
