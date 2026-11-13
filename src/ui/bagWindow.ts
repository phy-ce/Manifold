// The bag shows twice: its slots as a hotbar under the map, always there, and with the gear in the window I opens
// over the map. Both are the same slots, so either can be used.
import { tr } from "../i18n";
import { GameState, clickStack, sortSlots, startEat, trashCursor, wheelStack } from "../engine/game";
import { makeSlot, paintSlot } from "./slots";
import { keyHintHtml } from "./keyHint";
import { makeDraggable } from "./dragWindow";

export class BagWindow {
  /** The window [I] opens. */
  readonly root = document.createElement("section");
  /** The bag's slots under the map, with the keys for the bag and the equipment. */
  readonly hotbar = document.createElement("section");
  /** The hotbar's [I] button, which the tutorial points at. */
  readonly bagKey = document.createElement("button");
  private readonly invSlots: HTMLButtonElement[];
  private readonly hotSlots: HTMLButtonElement[];
  private readonly trashButton = document.createElement("button");

  /** `toggleGear` opens or closes the equipment window, from the hotbar's [K]. */
  constructor(private readonly game: () => GameState, private readonly redraw: () => void, toggleGear: () => void) {
    const { root: invBox, hotbar, bagKey, trashButton } = this;
    invBox.className = "box inv-pop";
    invBox.hidden = true;
    invBox.setAttribute("aria-label", tr("인벤토리"));
    const invGrid = document.createElement("div");
    invGrid.className = "slot-grid bag-grid";
    hotbar.className = "box hotbar";
    hotbar.setAttribute("aria-label", tr("가방"));
    const bagSlot = (i: number) => {
      const b = makeSlot(() => {
        const state = this.game();
        clickStack(state, state.inv, i, "left");
        redraw();
      }, {
        right: () => {
          const state = this.game();
          clickStack(state, state.inv, i, "right");
          redraw();
        },
        wheel: (way) => {
          const state = this.game();
          wheelStack(state, state.inv, i, way);
          redraw();
        },
      });
      b.dataset.inv = String(i);
      return b;
    };
    const invSlots = game().inv.map((_, i) => bagSlot(i));
    const hotSlots = game().inv.map((_, i) => bagSlot(i));
    this.invSlots = invSlots;
    this.hotSlots = hotSlots;
    // The hotbar's own key: [I] opens the bag with the gear; it is a button too.
    bagKey.type = "button";
    bagKey.className = "key-button";
    bagKey.innerHTML = keyHintHtml("I", tr("가방"), "on");
    bagKey.addEventListener("click", () => this.toggle());
    // And [K] beside it opens the equipment window.
    const gearButton = document.createElement("button");
    gearButton.type = "button";
    gearButton.className = "key-button";
    gearButton.innerHTML = keyHintHtml("K", tr("장비"), "on");
    gearButton.addEventListener("click", () => toggleGear());
    hotbar.append(...hotSlots, bagKey, gearButton);

    const sortButton = document.createElement("button");
    sortButton.type = "button";
    sortButton.className = "tech";
    sortButton.textContent = tr("정렬");
    sortButton.addEventListener("click", () => {
      sortSlots(this.game().inv);
      redraw();
    });
    trashButton.type = "button";
    trashButton.className = "tech demolish";
    trashButton.textContent = tr("버리기");
    trashButton.dataset.tip = tr("들고 있는 아이템을 버립니다");
    trashButton.addEventListener("click", () => {
      trashCursor(this.game());
      redraw();
    });

    // E over a bag slot eats it; a plain click now picks things up.
    window.addEventListener("keydown", (e) => {
      if (e.target instanceof HTMLInputElement || e.key.toLowerCase() !== "e") return;
      const slot = document.querySelector<HTMLElement>("[data-inv]:hover")?.dataset.inv;
      if (slot !== undefined) {
        startEat(this.game(), Number(slot));
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
    invBox.append(invTools, invGrid);
    makeDraggable(invBox, invTools, "bag");
  }

  /** Opens or closes the bag window. */
  toggle(): void {
    this.root.hidden = !this.root.hidden;
    this.redraw();
  }

  draw(): void {
    const state = this.game();
    state.inv.forEach((stack, i) => {
      paintSlot(this.hotSlots[i], stack);
      if (!this.root.hidden) paintSlot(this.invSlots[i], stack);
    });
    this.trashButton.disabled = !state.cursor;
  }
}
