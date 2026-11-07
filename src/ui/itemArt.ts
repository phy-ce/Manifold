// Item icons. Most items map to a stored shape; metal parts take their form's shape in the metal's colour.
// Ores and slag are drawn fresh instead: their rough, speckled look comes from printing shaded pixels by brightness.
import { familyMembers, formOf, isMachine, itemColor } from "../content";
import { hash } from "../engine/world";
import { machineIcon, printCanvas } from "./art";
import { METAL_CHARS, SHAPES, SOLID_CHARS, printShape, rampOf } from "./iconSprites";
import { GLYPH, SIZE, charGrid } from "./theme";

const SHAPE_OF: Record<string, string> = {
  water: "water",
  water_drum: "water_drum",
  steel: "ingot",
  coal_tar: "water",
  brick: "brick",
  iron: "ingot", copper: "ingot", boiler: "boiler", steam_engine_unit: "engine",
  Be: "berries", Bc: "berries", Mu: "mushroom", Mc: "mushroom",
};

const METAL_SHAPES = new Set(["ingot", "plate", "tube", "cylinder", "drum", "fan", "boots", "pack", "pick"]);

interface Lump {
  /** Gives each lump its own outline. */
  seed: number;
  /** Grain contrast varies, but every mineral keeps a rough surface. */
  grain?: number;
  /** Gas pockets left in the rock, as in slag. */
  holes?: number;
}

const LUMPS: Record<string, Lump> = {
  Ls: { seed: 15, grain: 0.35 },
  coke: { seed: 42, grain: 0.8, holes: 14 },
  Lm: { seed: 11 }, Ml: { seed: 12 }, Lg: { seed: 13 }, Kn: { seed: 14, grain: 0.7 },
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
function drawLump(color: string, { seed, grain = 1, holes = 0 }: Lump): string {
  g.clearRect(0, 0, COLS, ROWS);
  const cx = SHEET_W / 2 - 0.8;
  const cy = SHEET_H / 2;
  const edge = (a: number) => 0.82 + hash(Math.floor(a * 2.2), 1, seed) * 0.25;
  const inside = (x: number, y: number) => {
    const dx = ((x + 0.5) * SHEET_W / COLS - cx) / 7.8;
    const dy = ((y + 0.5) * SHEET_H / ROWS - cy) / 6.1;
    return Math.hypot(dx, dy) <= edge(Math.atan2(dy, dx) + Math.PI);
  };
  // Draw on whole character cells: fractional canvas scaling blurs the grains.
  for (let y = 0; y < ROWS; y += 1) {
    for (let x = 0; x < COLS; x += 1) {
      if (!inside(x, y)) continue;
      const dx = ((x + 0.5) * SHEET_W / COLS - cx) / 7.8;
      const dy = ((y + 0.5) * SHEET_H / ROWS - cy) / 6.1;
      const a = Math.atan2(dy, dx) + Math.PI;
      const rim = Math.hypot(dx, dy) / edge(a);
      const light = 0.66 + (-dx - dy) * 0.25;
      const speck = hash(x, y, seed);
      // Small bright inclusions sit in mottled rock, with occasional dark seams.
      const cluster = hash(Math.floor(x / 2), Math.floor(y / 2), seed + 2);
      const fleck = speck > 0.84 || (cluster > 0.72 && speck > 0.6);
      const texture = (hash(x, y, seed + 1) - 0.5) * 0.26 * grain;
      const tone = fleck ? light + 0.55 * grain : light + texture - (speck < 0.12 ? 0.2 : 0);
      g.fillStyle = shade(color, Math.max(0.24, tone - (rim > 0.87 ? 0.17 : 0)));
      g.fillRect(x, y, 1, 1);
    }
  }
  for (let i = 0; i < holes; i += 1) {
    const x = Math.floor(COLS * (0.24 + hash(i, 1, seed) * 0.43));
    const y = Math.floor(ROWS * (0.3 + hash(i, 2, seed) * 0.4));
    if (!inside(x - 1, y) || !inside(x + 2, y + 1)) continue;
    g.fillStyle = shade(color, 0.2);
    g.fillRect(x, y, 2, 1);
    g.fillStyle = shade(color, 0.8);
    g.fillRect(x, y + 1, 1, 1);
  }
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
    if (isMachine(item)) html = machineIcon(item, COLS, ROWS);
    else if (lump) html = drawLump(itemColor(item), lump);
    else html = shape ? printShape(SHAPES[shape], METAL_SHAPES.has(shape) ? METAL_CHARS : SOLID_CHARS, rampOf(itemColor(item))) : "";
    cache.set(id, html);
  }
  return html;
}
