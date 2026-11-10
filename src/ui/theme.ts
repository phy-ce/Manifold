// The one place sizes are defined. Everything else derives from these values.
// See docs/design/style.md before adding a new size.

/** Base spacing unit in px. */
export const UNIT = 8;

/** Component sizes, in units. */
const UNITS = { slot: 6.5, dockSlot: 5.5, nodeW: 22, nodeH: 12, machineWindow: 60 };

export const SIZE = {
  slot: UNITS.slot * UNIT,
  /** The item index grid's smaller slot: the same icon, drawn with the smaller dock glyph. */
  dockSlot: UNITS.dockSlot * UNIT,
  nodeW: UNITS.nodeW * UNIT,
  nodeH: UNITS.nodeH * UNIT,
  /** The machine window is sized by its picture and gauge, not by slots, so smaller slots leave it whole. */
  machineWindow: UNITS.machineWindow * UNIT,
};

/** Character size in px for each kind of text art. */
/** `dock` draws the very same icon grid smaller, so the index shrinks without losing a single character. */
export const GLYPH = { machine: 6, icon: 3, dock: 2 };

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
    "--glyph-dock": GLYPH.dock,
    "--dock-slot": SIZE.dockSlot,
    "--machine-window": SIZE.machineWindow,
  };
  for (const [name, px] of Object.entries(vars)) document.documentElement.style.setProperty(name, `${px}px`);
}
