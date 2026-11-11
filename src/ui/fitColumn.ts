// The side columns never scroll: when what they hold is taller than the window allows, everything in them is
// drawn smaller, all together, until it fits. A larger window lets it grow back to full size.

/** The smallest a column is drawn, so text stays legible on a very short window. */
const MIN_FIT = 0.5;

/** How much a column's contents are shrunk now, 1 for full size. */
const fitOf = (col: HTMLElement): number => Number(col.dataset.fit ?? 1);

function setFit(col: HTMLElement, fit: number): void {
  col.dataset.fit = String(fit);
  for (const child of col.children) (child as HTMLElement).style.zoom = fit === 1 ? "" : String(fit);
}

/**
 * Shrinks a column's contents just enough to fit its height. With `regrow`, it starts again from full size, as
 * after the window grows; otherwise it only shrinks further when something new overflows.
 */
export function fitColumn(col: HTMLElement, regrow = false): void {
  if (col.hidden || !col.clientHeight) return;
  if (regrow && fitOf(col) !== 1) setFit(col, 1);
  // Twice: gaps between children don't shrink, so the first guess can fall a little short.
  for (let pass = 0; pass < 2; pass += 1) {
    const room = col.clientHeight;
    const used = col.scrollHeight;
    if (used <= room + 1) return;
    const fit = Math.max(MIN_FIT, Math.floor(fitOf(col) * (room / used) * 100) / 100);
    if (fit >= fitOf(col)) return;
    setFit(col, fit);
  }
}

/** Keeps columns fitted: from scratch whenever the window changes size, and against overflow as contents change. */
export function keepFitted(cols: HTMLElement[]): void {
  const all = (regrow: boolean) => cols.forEach((col) => fitColumn(col, regrow));
  window.addEventListener("resize", () => all(true));
  document.addEventListener("fullscreenchange", () => all(true));
  // Panels come and go (a vein underfoot, a fight); a light check twice a second catches what overflows.
  setInterval(() => all(false), 500);
  requestAnimationFrame(() => all(true));
}
