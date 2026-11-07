// Inventory-style slot buttons, updated in place so clicks are never lost to a redraw.
import { foodEffect, isFluid, itemCode, itemColor, itemName, unitOf } from "../content";
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

/** What a machine slot is for, and the items that fit it. */
export interface SlotRole {
  name: string;
  fits: string[];
}

/** An empty slot can show a faded item (ghost), or the word for its role with what fits in the tooltip. */
export function paintSlot(b: HTMLButtonElement, stack: Stack | null, extra = "", ghost?: string, role?: SlotRole): void {
  const key = `${stack?.id}|${stack?.n}|${extra}|${ghost}|${role?.name}|${role?.fits}`;
  if (b.dataset.key === key) return;
  b.dataset.key = key;
  const shown = stack?.id ?? ghost;
  const names = role?.fits.map(itemName).join(", ");
  const roleTip = names ? `${role!.name}: ${names}` : role?.name ?? "";
  b.className = `slot ${stack ? "" : "empty"} ${!stack && ghost ? "ghost" : ""} ${extra}`;
  b.innerHTML = shown ? face(shown, stack ? `<span class="n">${stack.n}${unitOf(stack.id)}</span>` : "") : role ? `<span class="role">${role.name}</span>` : "·";
  const eatHint = stack && b.dataset.inv !== undefined && foodEffect(stack.id) ? " (E: 먹기)" : stack && isFluid(stack.id) ? " (용기로만 옮길 수 있음)" : "";
  b.dataset.tip = shown ? itemName(shown) + eatHint : roleTip;
  b.dataset.item = shown ?? "";
  const label = stack ? `${itemName(stack.id)} ${stack.n}개` : ghost ? `${itemName(ghost)} 칸, 비어 있음` : role ? `${roleTip} 칸, 비어 있음` : "빈 칸";
  b.setAttribute("aria-label", label);
}
