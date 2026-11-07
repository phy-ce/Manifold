// Item icons. Most items map to a stored shape; metal parts take their form's shape in the metal's colour.
// Ores and slag are drawn fresh instead: their rough, speckled look comes from printing shaded pixels by brightness.
import { familyMembers, formOf, itemColor } from "../content";
import { hash } from "../engine/world";
import { printCanvas } from "./art";
import { METAL_CHARS, SHAPES, SOLID_CHARS, printShape, rampOf } from "./iconSprites";
import { GLYPH, SIZE, charGrid } from "./theme";

const SHAPE_OF: Record<string, string> = {
  brick: "brick",
  iron: "ingot", copper: "ingot", boiler: "boiler", steam_engine_unit: "engine",
  Be: "berries", Bc: "berries", Mu: "mushroom", Mc: "mushroom",
};

const METAL_SHAPES = new Set(["ingot", "plate", "tube", "cylinder"]);

interface Lump {
  /** Gives each lump its own outline. */
  seed: number;
  smooth?: boolean;
  /** Gas pockets left in the rock, as in slag. */
  holes?: number;
}

const LUMPS: Record<string, Lump> = {
  Lm: { seed: 11 }, Ml: { seed: 12 }, Lg: { seed: 13 }, Kn: { seed: 14, smooth: true },
  slag: { seed: 41, holes: 9 },
};

const { cols: COLS, rows: ROWS } = charGrid(SIZE.slot - 2, GLYPH.icon);
const SHEET_W = 20;
const SHEET_H = 18;

const canvas = document.createElement("canvas");
canvas.width = COLS;
canvas.height = ROWS;
const g = canvas.getContext("2d", { willReadFrequently: true })!;

function shade(hex: string, k: number): string {
  const v = parseInt(hex.slice(1), 16);
  const c = [v >> 16, (v >> 8) & 255, v & 255].map((n) => Math.min(255, Math.round(n * k)));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

/** Rough rock with a lit top-left and mineral flecks. */
function drawLump(color: string, { seed, smooth = false, holes = 0 }: Lump): string {
  g.clearRect(0, 0, COLS, ROWS);
  g.save();
  g.scale(COLS / SHEET_W, ROWS / SHEET_H);
  const cx = SHEET_W / 2;
  const cy = SHEET_H / 2;
  const edge = (a: number) => (smooth ? 0.95 : 0.78 + hash(Math.floor(a * 2.2), 1, seed) * 0.34);
  for (let y = 0; y < SHEET_H; y += 1) {
    for (let x = 0; x < SHEET_W; x += 1) {
      const dx = (x - cx) / 9;
      const dy = (y - cy) / 7.4;
      const a = Math.atan2(dy, dx) + Math.PI;
      if (Math.hypot(dx, dy) > edge(a)) continue;
      const light = 0.62 + (-dx - dy) * 0.32;
      const fleck = !smooth && hash(x, y, seed) > 0.8;
      g.fillStyle = shade(color, fleck ? 1.5 : light + hash(x, y, seed + 1) * 0.12);
      g.fillRect(x, y, 1, 1);
    }
  }
  g.fillStyle = shade(color, 0.2);
  for (let i = 0; i < holes; i += 1) {
    g.fillRect(4 + Math.floor(hash(i, 1, seed) * 11), 3 + Math.floor(hash(i, 2, seed) * 11), 2, 2);
  }
  g.restore();
  return printCanvas(g, COLS, ROWS);
}

const cache = new Map<string, string>();

export function itemIcon(id: string): string {
  let html = cache.get(id);
  if (html === undefined) {
    // An ore family shows the ore that fills it.
    const item = familyMembers(id)[0] ?? id;
    const lump = LUMPS[item];
    const shape = formOf(item) ?? SHAPE_OF[item];
    if (lump) html = drawLump(itemColor(item), lump);
    else html = shape ? printShape(SHAPES[shape], METAL_SHAPES.has(shape) ? METAL_CHARS : SOLID_CHARS, rampOf(itemColor(item))) : "";
    cache.set(id, html);
  }
  return html;
}
