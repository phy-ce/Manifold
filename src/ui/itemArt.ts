// Item icons. Most items map to a stored shape; metal parts take their form's shape in the metal's colour.
// Ores and slag are drawn fresh instead: their rough, speckled look comes from printing shaded pixels by brightness.
import { familyMembers, formOf, isMachine, itemColor, membersOf } from "../content";
import { hash } from "../engine/world";
import { machineIcon, printCanvas } from "./art";
import { METAL_CHARS, SHAPES, SOLID_CHARS, printShape, rampOf } from "./iconSprites";
import { GLYPH, SIZE, charGrid } from "./theme";

const SHAPE_OF: Record<string, string> = {
  water: "water",
  water_drum: "water_drum",
  steel: "ingot",
  coal_tar: "water",
  brick: "brick", steam_module: "steam_module",
  iron: "ingot", copper: "ingot", steam_drum: "steam_drum", pig_iron: "ingot", steam_engine_unit: "engine",
  Be: "berries", Bc: "berries", Mu: "mushroom", Mc: "mushroom",
};

const METAL_SHAPES = new Set(["ingot", "plate", "tube", "cylinder", "rod", "rivet", "gear", "spring", "belt", "drum", "fan", "boots", "pack", "pick"]);

interface Lump {
  /** Gives each lump its own outline. */
  seed: number;
  /** Grain contrast varies, but every mineral keeps a rough surface. */
  grain?: number;
  /** Gas pockets left in the rock, as in slag. */
  holes?: number;
  /** Mineral-specific fracture and lustre, still printed through the same brightness ramp. */
  mineral?: "hematite" | "magnetite" | "chalcocite" | "chalcopyrite" | "bituminous" | "anthracite";
}

const LUMPS: Record<string, Lump> = {
  Ls: { seed: 15, grain: 0.35 },
  coke: { seed: 42, grain: 0.8, holes: 14 },
  Lm: { seed: 11 }, Ml: { seed: 12 }, Lg: { seed: 13 }, Kn: { seed: 14, grain: 0.7 },
  Hm: { seed: 21, grain: 0.65, mineral: "hematite" },
  Mt: { seed: 22, grain: 0.3, mineral: "magnetite" },
  Cc: { seed: 23, grain: 0.4, mineral: "chalcocite" },
  Cp: { seed: 24, grain: 0.8, mineral: "chalcopyrite" },
  Bt: { seed: 25, grain: 0.55, mineral: "bituminous" },
  An: { seed: 26, grain: 0.2, mineral: "anthracite" },
  slag: { seed: 41, holes: 9 },
  // A bloom is spongy iron straight from the bloomery, still full of slag pockets.
  bloom: { seed: 44, grain: 0.6, holes: 12, mineral: "magnetite" },
  // Matte is a cooled copper sulphide melt: a dense lump with a metallic sheen and a few gas pockets.
  copper_matte: { seed: 43, grain: 0.45, holes: 4, mineral: "chalcocite" },
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
function drawLump(color: string, { seed, grain = 1, holes = 0, mineral }: Lump): string {
  g.clearRect(0, 0, COLS, ROWS);
  const cx = SHEET_W / 2 - 0.8;
  const cy = SHEET_H / 2;
  const edge = (a: number) => 0.82 + hash(Math.floor(a * 2.2), 1, seed) * 0.25;
  const inside = (x: number, y: number) => {
    const dx = ((x + 0.5) * SHEET_W / COLS - cx) / 7.8;
    const dy = ((y + 0.5) * SHEET_H / ROWS - cy) / 6.1;
    // Joined octahedral crystals, a broad cleavage slab, and two distinct coal fractures.
    if (mineral === "magnetite") return Math.abs(dx + 0.22) / 0.74 + Math.abs(dy + 0.12) / 1.02 < 1 ||
      Math.abs(dx - 0.46) / 0.48 + Math.abs(dy - 0.3) / 0.64 < 1;
    if (mineral === "chalcocite") return Math.max(Math.abs(dx + dy * 0.22) / 0.98, Math.abs(dy) / 0.66) < edge(Math.atan2(dy, dx) + Math.PI);
    if (mineral === "bituminous") return Math.max(Math.abs(dx - dy * 0.2) / 0.92, Math.abs(dy) / 0.82) < edge(Math.atan2(dy, dx) + Math.PI);
    if (mineral === "anthracite") return Math.abs(dx + dy * 0.3) * 0.72 + Math.abs(dy) * 0.65 < 0.84;
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
      let tone = fleck ? light + 0.55 * grain : light + texture - (speck < 0.12 ? 0.2 : 0);
      let tint = color;
      if (mineral === "hematite") {
        // Earthy red lobes with darker iron-red bands, rather than limonite's ochre grains.
        const band = Math.sin(dy * 15 + Math.sin(dx * 5) * 1.5);
        tone = light + texture + (band > 0.5 ? 0.22 : band < -0.6 ? -0.25 : 0);
        if (speck > 0.93) { tint = "#e58b78"; tone = 0.95; }
      } else if (mineral === "magnetite") {
        // Large contrasting crystal faces and a narrow silver ridge, not random glitter.
        const ridge = dx < 0.18 ? dx + 0.22 : dx - 0.46;
        tone = ridge < 0 ? 0.85 - dy * 0.17 : 0.32 + texture;
        if (Math.abs(ridge) < 0.065) { tint = "#d9e2eb"; tone = 0.95; }
        else if (Math.abs(dy + 0.12) < 0.07 && dx < 0.18) tone += 0.26;
      } else if (mineral === "chalcocite") {
        // Low, lead-grey cleavage planes; subdued highlights keep this darker than magnetite.
        tone = 0.4 + (-dx - dy) * 0.12 + texture;
        if (Math.abs(dy + dx * 0.18 + 0.23) < 0.07) { tint = "#aab6c3"; tone = 0.8; }
        if (Math.abs(dx - dy * 0.4 - 0.2) < 0.055) tone *= 0.45;
      } else if (mineral === "chalcopyrite") {
        // Brass-yellow mineral patches in a dull host, with occasional tarnished violet.
        const brass = cluster > 0.49 && speck > 0.24;
        tint = brass ? "#dfbb50" : speck > 0.89 ? "#82718e" : color;
        tone = brass ? 0.88 + light * 0.3 + texture : light * 0.43 + texture;
        if (brass && speck > 0.88) { tint = "#f7e1a0"; tone = 1; }
      } else if (mineral === "bituminous") {
        // Dark, blocky coal with broad horizontal bedding and irregular cross-cracks.
        const bed = Math.sin((dy + dx * 0.12) * 19);
        tone = 0.25 + light * 0.2 + texture + (bed > 0.65 ? 0.22 : bed < -0.7 ? -0.12 : 0);
        if (Math.abs(dx + Math.sin(dy * 7) * 0.12 - 0.25) < 0.06) tone *= 0.45;
      } else if (mineral === "anthracite") {
        // Smooth black conchoidal fracture with two sharp, curved specular ribbons.
        const arc = dy + 0.46 - 0.65 * (dx + 0.15) ** 2;
        tone = 0.19 + light * 0.1 + texture;
        if (Math.abs(arc) < 0.075 || Math.abs(arc - 0.48) < 0.05 && dx < 0.35) {
          tint = "#dce8f1"; tone = 0.9 + speck * 0.1;
        } else if (Math.abs(arc) < 0.16) { tint = "#7a8c9e"; tone = 0.72; }
      }
      g.fillStyle = shade(tint, Math.max(mineral ? 0.1 : 0.24, tone - (rim > 0.87 ? 0.17 : 0)));
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
    const item = familyMembers(id)[0] ?? membersOf(id)[0] ?? id;
    const lump = LUMPS[item];
    const shape = formOf(item) ?? SHAPE_OF[item];
    if (isMachine(item)) html = machineIcon(item, COLS, ROWS);
    else if (lump) html = drawLump(itemColor(item), lump);
    else html = shape && SHAPES[shape] ? printShape(SHAPES[shape], METAL_SHAPES.has(shape) ? METAL_CHARS : SOLID_CHARS, rampOf(itemColor(item))) : "";
    cache.set(id, html);
  }
  return html;
}
