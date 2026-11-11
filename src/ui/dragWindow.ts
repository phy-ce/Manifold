// A floating window the player can drag by its title bar. Where it was left is remembered per window on this
// browser, and it is kept on screen when the window or the browser changes size.

/** How much of a window must stay on screen, so it can always be grabbed back. */
const KEEP = 40;

/** Makes `box` draggable by `handle`, remembered under `key`. Buttons in the handle still click. */
export function makeDraggable(box: HTMLElement, handle: HTMLElement, key: string): void {
  box.classList.add("draggable");
  handle.classList.add("drag-handle");
  const storeKey = `manifold-window-${key}`;
  const place = (x: number, y: number) => {
    const w = box.offsetWidth || 200;
    const left = Math.min(window.innerWidth - KEEP, Math.max(KEEP - w, x));
    const top = Math.min(window.innerHeight - KEEP, Math.max(0, y));
    box.style.left = `${Math.round(left)}px`;
    box.style.top = `${Math.round(top)}px`;
  };
  let saved: { x: number; y: number } | null = null;
  try {
    saved = JSON.parse(localStorage.getItem(storeKey) ?? "null");
  } catch {
    saved = null;
  }
  // Until it has been moved, the window keeps its place from the stylesheet.
  const pinned = () => box.style.left !== "";
  if (saved) requestAnimationFrame(() => place(saved!.x, saved!.y));
  handle.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest("button, input")) return;
    const rect = box.getBoundingClientRect();
    const dx = e.clientX - rect.left;
    const dy = e.clientY - rect.top;
    handle.setPointerCapture(e.pointerId);
    box.classList.add("dragging");
    const move = (ev: PointerEvent) => place(ev.clientX - dx, ev.clientY - dy);
    const up = () => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", up);
      handle.removeEventListener("pointercancel", up);
      box.classList.remove("dragging");
      try {
        localStorage.setItem(storeKey, JSON.stringify({ x: parseFloat(box.style.left), y: parseFloat(box.style.top) }));
      } catch {
        // A private window may refuse storage; the window just won't remember its place.
      }
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", up);
    handle.addEventListener("pointercancel", up);
    e.preventDefault();
  });
  window.addEventListener("resize", () => {
    if (pinned()) place(parseFloat(box.style.left), parseFloat(box.style.top));
  });
}
