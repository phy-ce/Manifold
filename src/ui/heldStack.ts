// The stack in hand follows the pointer.
import { GameState } from "../engine/game";
import { makeSlot, paintSlot } from "./slots";

export class HeldStack {
  readonly root = document.createElement("div");
  private readonly heldSlot = makeSlot(() => undefined);
  private pointer = { x: 0, y: 0 };

  constructor(private readonly game: () => GameState) {
    const held = this.root;
    held.className = "held";
    held.hidden = true;
    this.heldSlot.tabIndex = -1;
    held.append(this.heldSlot);
    document.body.append(held);
    document.addEventListener("pointermove", (e) => {
      if (!held.hidden) held.style.transform = `translate(${e.clientX + 6}px, ${e.clientY + 6}px)`;
      this.pointer = { x: e.clientX, y: e.clientY };
    });
  }

  draw(): void {
    const state = this.game();
    const { root: held, pointer } = this;
    const wasHidden = held.hidden;
    held.hidden = !state.cursor;
    if (state.cursor) paintSlot(this.heldSlot, state.cursor);
    if (wasHidden && !held.hidden) held.style.transform = `translate(${pointer.x + 6}px, ${pointer.y + 6}px)`;
  }
}
