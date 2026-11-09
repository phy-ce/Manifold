// Inventory-style slot buttons, updated in place so clicks are never lost to a redraw.
import { tr } from "../i18n";
import { foodEffect, gearOf, indexItems, isFluid, itemCode, itemColor, itemName, membersOf, unitOf } from "../content";
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

// Only items the player can meet by now are listed, so later ores stay a surprise.
let known = new Set(indexItems(0));
let knownStage = 0;
/** Call when the stage changes, so group lists grow with it. */
export function setSlotStage(stage: number): void {
  if (stage === knownStage) return;
  knownStage = stage;
  known = new Set(indexItems(stage));
}
/** The items a group such as coal or fuel stands for, as far as the player knows. */
export const knownMembers = (id: string): string[] => membersOf(id).filter((member) => known.has(member));

const face = (id: string, count: string) => {
  const members = knownMembers(id);
  // A group shows how many kinds fill it; Shift on hover lists them.
  const kinds = members.length ? `<span class="kinds">▱${members.length}</span>` : "";
  return `<pre class="icon" aria-hidden="true">${itemIcon(id)}</pre>` +
    `<span class="code" style="color:${itemColor(id)}">${itemCode(id)}</span>${kinds}${count}`;
};

/** What a machine slot is for, and the items that fit it. */
export interface SlotRole {
  name: string;
  fits: string[];
}

/** An empty slot can show a faded item (ghost), or the word for its role with what fits in the tooltip. */
export function paintSlot(b: HTMLButtonElement, stack: Stack | null, extra = "", ghost?: string, role?: SlotRole): void {
  const key = `${stack?.id}|${stack?.n}|${extra}|${ghost}|${role?.name}|${role?.fits}|${knownStage}`;
  if (b.dataset.key === key) return;
  b.dataset.key = key;
  const shown = stack?.id ?? ghost;
  const all = role ? [...new Set(role.fits)] : [];
  const fits = all.some((id) => known.has(id)) ? all.filter((id) => known.has(id)) : all;
  const roleTip = fits.length ? `${role!.name} · ${fits.length}${tr("종")}` : role?.name ?? "";
  b.className = `slot ${stack ? "" : "empty"} ${!stack && ghost ? "ghost" : ""} ${extra}`;
  b.innerHTML = shown ? face(shown, stack ? `<span class="n">${stack.n}${unitOf(stack.id)}</span>` : "") : role ? `<span class="role">${role.name}</span>` : "·";
  const eatHint = stack && b.dataset.inv !== undefined && foodEffect(stack.id) ? tr(" (E: 먹기)") : stack && isFluid(stack.id) ? tr(" (용기로만 옮길 수 있음)") : stack && gearOf(stack.id) ? ` (${gearOf(stack.id)!.note})` : "";
  const members = shown ? knownMembers(shown) : fits;
  const groupTip = shown && members.length ? ` · ${members.length}${tr("종")}` : "";
  b.dataset.tip = shown ? itemName(shown) + groupTip + eatHint : roleTip;
  // The tooltip lists these while Shift is held.
  b.dataset.tipList = members.join();
  b.dataset.item = shown ?? "";
  const label = stack ? `${itemName(stack.id)} ${stack.n}${tr("개")}` : ghost ? `${itemName(ghost)} ${tr("칸, 비어 있음")}` : role ? `${roleTip} ${tr("칸, 비어 있음")}` : tr("빈 칸");
  b.setAttribute("aria-label", label);
}
