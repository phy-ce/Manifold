// The one place sizes are defined. Everything else derives from these values.
// See docs/design/style.md before adding a new size.

/** Base spacing unit in px. */
export const UNIT = 8;

/** Component sizes, in units. */
const UNITS = { slot: 8, nodeW: 22, nodeH: 12 };

export const SIZE = {
  slot: UNITS.slot * UNIT,
  nodeW: UNITS.nodeW * UNIT,
  nodeH: UNITS.nodeH * UNIT,
};

/** Character size in px for each kind of text art. */
export const GLYPH = { machine: 6, icon: 4 };

/** Width of a monospace character relative to its height. */
export const GLYPH_ASPECT = 0.6;

/** How many characters of a given size fit in a square box. */
export function charGrid(boxPx: number, glyphPx: number): { cols: number; rows: number } {
  return { cols: Math.floor(boxPx / (glyphPx * GLYPH_ASPECT)), rows: Math.floor(boxPx / glyphPx) };
}

/** Publishes the sizes to CSS, so stylesheets never hold their own copies. */
export function applyTheme(): void {
  const vars: Record<string, number> = {
    "--u": UNIT,
    "--slot": SIZE.slot,
    "--node-w": SIZE.nodeW,
    "--node-h": SIZE.nodeH,
    "--glyph-machine": GLYPH.machine,
    "--glyph-icon": GLYPH.icon,
  };
  for (const [name, px] of Object.entries(vars)) document.documentElement.style.setProperty(name, `${px}px`);
}
