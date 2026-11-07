// Inventory-style slot buttons, updated in place so clicks are never lost to a redraw.
import { foodEffect, itemCode, itemColor, itemName } from "../content";
import { Stack } from "../engine/game";
import { itemIcon } from "./itemArt";

export interface SlotInput {
  /** Right mouse button. */
  right?: () => void;
  /** Mouse wheel: "in" when scrolled down, "out" when scrolled up. */
  wheel?: (way: "in" | "out") => void;
}

export function makeSlot(onClick: (e: MouseEvent) => void, input: SlotInput = {}): HTMLButtonElement {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "slot empty";
  b.addEventListener("click", onClick);
  if (input.right) {
    const right = input.right;
    b.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      right();
    });
  }
  if (input.wheel) {
    const wheel = input.wheel;
    b.addEventListener("wheel", (e) => {
      e.preventDefault();
      wheel(e.deltaY > 0 ? "in" : "out");
    }, { passive: false });
  }
  return b;
}

const face = (id: string, count: string) =>
  `<pre class="icon" aria-hidden="true">${itemIcon(id)}</pre>` +
  `<span class="code" style="color:${itemColor(id)}">${itemCode(id)}</span>${count}`;

export function paintSlot(b: HTMLButtonElement, stack: Stack | null, extra = "", ghost?: string): void {
  const key = `${stack?.id}|${stack?.n}|${extra}|${ghost}`;
  if (b.dataset.key === key) return;
  b.dataset.key = key;
  const shown = stack?.id ?? ghost;
  b.className = `slot ${stack ? "" : "empty"} ${!stack && ghost ? "ghost" : ""} ${extra}`;
  b.innerHTML = shown ? face(shown, stack ? `<span class="n">${stack.n}</span>` : "") : "·";
  const eatHint = stack && b.dataset.inv !== undefined && foodEffect(stack.id) ? " (E: 먹기)" : "";
  b.dataset.tip = shown ? itemName(shown) + eatHint : "";
  b.dataset.item = shown ?? "";
  const label = stack ? `${itemName(stack.id)} ${stack.n}개` : ghost ? `${itemName(ghost)} 칸, 비어 있음` : "빈 칸";
  b.setAttribute("aria-label", label);
}
