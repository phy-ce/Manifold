// Instant tooltip. The browser's title attribute waits about a second and can't be sped up.
// Any element with a non-empty data-tip shows it under the pointer.
// An element with data-tip-list (item ids) shows a ⇧ key, and holding Shift lists those items.
// data-tip-burn, a machine's heat per second, adds how long one piece of each fuel burns in it.
import { tr } from "../i18n";
import { fuelValue, isFuel, itemCode, itemColor, itemName } from "../content";

const OFFSET = 14;
const SELECTOR = '[data-tip]:not([data-tip=""])';

/** Short numbers: whole when they are, otherwise up to two decimals. */
const short = (n: number) => String(Math.round(n * 100) / 100);

function row(id: string, burn: number): HTMLElement {
  const line = document.createElement("div");
  line.className = "tip-row";
  const code = document.createElement("span");
  code.className = "tip-code";
  code.style.color = itemColor(id);
  code.textContent = itemCode(id);
  const name = document.createElement("span");
  name.textContent = itemName(id);
  line.append(code, name);
  if (isFuel(id)) {
    const value = document.createElement("span");
    value.className = "tip-value";
    value.textContent = burn > 0 ? `${short(fuelValue(id) / burn)}${tr("초")}` : `${tr("열량")} ${fuelValue(id)}`;
    line.append(value);
  }
  return line;
}

export function installTooltip(): void {
  const tip = document.createElement("div");
  tip.className = "tip";
  tip.hidden = true;
  tip.setAttribute("role", "tooltip");
  document.body.append(tip);

  let target: Element | null = null;
  let x = 0;
  let y = 0;
  let shift = false;
  let drawn = "";

  const place = () => {
    // Keep it on screen near the right and bottom edges.
    const left = Math.min(x + OFFSET, window.innerWidth - tip.offsetWidth - 4);
    const top = Math.min(y + OFFSET, window.innerHeight - tip.offsetHeight - 4);
    tip.style.transform = `translate(${left}px, ${top}px)`;
  };

  const render = () => {
    if (!target || !target.isConnected) {
      tip.hidden = true;
      drawn = "";
      return;
    }
    const text = target.getAttribute("data-tip")!;
    const list = (target.getAttribute("data-tip-list") ?? "").split(",").filter(Boolean);
    const burn = Number(target.getAttribute("data-tip-burn") ?? 0);
    const open = shift && list.length > 0;
    const key = `${text}|${list}|${burn}|${open}`;
    if (key !== drawn) {
      drawn = key;
      const head = document.createElement("div");
      head.textContent = text;
      if (list.length && !open) {
        const kbd = document.createElement("kbd");
        kbd.textContent = "⇧";
        head.append(" ", kbd);
      }
      tip.replaceChildren(head, ...(open ? list.map((id) => row(id, burn)) : []));
    }
    tip.hidden = false;
    place();
  };

  const update = (e: PointerEvent) => {
    x = e.clientX;
    y = e.clientY;
    shift = e.shiftKey;
    target = e.target instanceof Element ? e.target.closest(SELECTOR) : null;
    render();
  };

  // Shift alone changes nothing else, so the list never gets in the way of Shift+click.
  const key = (e: KeyboardEvent) => {
    if (e.key !== "Shift" || shift === (e.type === "keydown")) return;
    shift = e.type === "keydown";
    render();
  };

  document.addEventListener("pointermove", update);
  document.addEventListener("pointerover", update);
  document.addEventListener("pointerleave", () => {
    target = null;
    tip.hidden = true;
  });
  document.addEventListener("pointerdown", () => {
    target = null;
    tip.hidden = true;
  });
  window.addEventListener("keydown", key);
  window.addEventListener("keyup", key);
  window.addEventListener("blur", () => {
    shift = false;
    render();
  });
}
