// Instant tooltip. The browser's title attribute waits about a second and can't be sped up.
// Any element with a non-empty data-tip shows it under the pointer.

const OFFSET = 14;
const SELECTOR = '[data-tip]:not([data-tip=""])';

export function installTooltip(): void {
  const tip = document.createElement("div");
  tip.className = "tip";
  tip.hidden = true;
  tip.setAttribute("role", "tooltip");
  document.body.append(tip);

  const update = (e: PointerEvent) => {
    const target = e.target instanceof Element ? e.target.closest(SELECTOR) : null;
    if (!target) {
      tip.hidden = true;
      return;
    }
    const text = target.getAttribute("data-tip")!;
    if (tip.textContent !== text) tip.textContent = text;
    tip.hidden = false;
    // Keep it on screen near the right and bottom edges.
    const x = Math.min(e.clientX + OFFSET, window.innerWidth - tip.offsetWidth - 4);
    const y = Math.min(e.clientY + OFFSET, window.innerHeight - tip.offsetHeight - 4);
    tip.style.transform = `translate(${x}px, ${y}px)`;
  };

  document.addEventListener("pointermove", update);
  document.addEventListener("pointerover", update);
  document.addEventListener("pointerleave", () => {
    tip.hidden = true;
  });
  document.addEventListener("pointerdown", () => {
    tip.hidden = true;
  });
}
