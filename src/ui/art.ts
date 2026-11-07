// Machine art: a shaded scene on a small canvas, printed as 6px coloured characters.
import { hash } from "../engine/world";
import { Status } from "../engine/game";

export const COLS = 76;
const ROWS = 46;
const RAMP = " .,:;-~=+*xoX#%@";

const canvas = document.createElement("canvas");
canvas.width = COLS;
canvas.height = ROWS;
const g = canvas.getContext("2d", { willReadFrequently: true })!;
const rect = (color: string, x: number, y: number, w: number, h: number) => {
  g.fillStyle = color;
  g.fillRect(x, y, w, h);
};

function bricks(x0: number, y0: number, w: number, h: number, tint: number[]) {
  for (let y = 0; y < h; y += 1) {
    const course = Math.floor(y / 4);
    for (let x = 0; x < w; x += 1) {
      const shifted = x + (course % 2) * 4;
      const joint = y % 4 === 3 || shifted % 8 === 7;
      const k = (joint ? 0.42 : 0.82 + hash(Math.floor(shifted / 8), course, 3) * 0.3) * (1 - (x / w) * 0.45);
      rect(`rgb(${tint[0] * k | 0},${tint[1] * k | 0},${tint[2] * k | 0})`, x0 + x, y0 + y, 1, 1);
    }
  }
}

function fire(x0: number, x1: number, floor: number, mode: Status, f: number) {
  if (mode === "blocked") {
    rect("#ff5f56", 36, floor - 18, 5, 12);
    rect("#ff5f56", 36, floor - 4, 5, 4);
    return;
  }
  if (mode === "idle") {
    for (let x = x0 + 2; x < x1 - 2; x += 2) rect("#4a3a35", x, floor - 2 + (x % 3), 2, 2);
    return;
  }
  for (let x = x0; x < x1; x += 1) {
    const h = 11 + Math.sin(x * 0.7 + f * 0.9) * 4 + Math.sin(x * 0.31 - f * 0.6) * 3 + hash(x, f % 9, 1) * 3;
    for (let y = 0; y < h; y += 1) {
      const t = y / h;
      rect(t < 0.35 ? "#fff0a8" : t < 0.65 ? "#ffb238" : "#e0541e", x, floor - y, 1, 1);
    }
  }
}

function smoke(x: number, f: number) {
  for (let i = 0; i < 6; i += 1) {
    const t = (f * 0.05 + i / 6) % 1;
    g.fillStyle = `rgba(190,196,204,${0.75 * (1 - t)})`;
    g.beginPath();
    g.arc(x + Math.sin(t * 6 + i) * 4 - t * 16, 8 - t * 8, 2 + t * 4, 0, 7);
    g.fill();
  }
}

function furnace(mode: Status, f: number, tint: number[]) {
  rect("#6f5546", 49, 8, 11, 26);
  rect("#8d6e5a", 49, 8, 3, 26);
  rect("#4b3a31", 57, 8, 3, 26);
  rect("#a5a7ad", 47, 5, 15, 4);
  bricks(12, 28, 52, 40, tint);
  rect("#b4b8c0", 9, 25, 58, 4);
  rect("#73777f", 9, 28, 58, 1);
  for (let x = 12; x < 66; x += 7) rect("#e6e9ee", x, 26, 1, 1);
  g.fillStyle = "#17161a";
  g.beginPath();
  g.moveTo(23, 60);
  g.lineTo(23, 44);
  g.arc(38, 44, 15, Math.PI, 0);
  g.lineTo(53, 60);
  g.closePath();
  g.fill();
  g.strokeStyle = "#c2c5cc";
  g.lineWidth = 2;
  g.stroke();
  fire(25, 52, 58, mode, f);
  for (let x = 24; x < 53; x += 4) rect("#6d7078", x, 60, 2, 3);
  rect("#585c64", 6, 68, 64, 4);
  rect("#8b8f98", 6, 68, 64, 1);
  if (mode === "run") smoke(54, f);
}

function bench(mode: Status, f: number, metal: string) {
  // Work surface, legs and a vice.
  rect("#7c5a3c", 8, 42, 60, 6);
  rect("#a07a55", 8, 42, 60, 2);
  rect("#4f3a28", 12, 48, 5, 24);
  rect("#4f3a28", 59, 48, 5, 24);
  rect("#3a2c20", 12, 62, 52, 3);
  rect("#8b8f98", 14, 34, 12, 8);
  rect("#b4b8c0", 14, 34, 12, 2);
  // Workpiece.
  rect(metal, 34, 36, 20, 6);
  rect("#ffffff", 34, 36, 20, 1);
  // Hammer swings while running.
  const lift = mode === "run" ? Math.abs(Math.sin(f * 0.6)) * 14 : 10;
  rect("#7c5a3c", 41, 12 + (14 - lift), 3, 20);
  rect("#c2c5cc", 35, 8 + (14 - lift), 15, 7);
  if (mode === "run" && lift < 3) {
    for (let i = 0; i < 5; i += 1) rect("#ffb238", 32 + i * 5, 30 - (i % 2) * 3, 1, 1);
  }
  if (mode === "blocked") {
    rect("#ff5f56", 60, 12, 4, 14);
    rect("#ff5f56", 60, 28, 4, 4);
  }
}

function crate() {
  // Warehouse shelving.
  rect("#4f3a28", 8, 12, 4, 60);
  rect("#4f3a28", 64, 12, 4, 60);
  for (const y of [24, 44, 64]) {
    rect("#a07a55", 8, y, 60, 3);
    for (let x = 14; x < 62; x += 12) {
      const k = 0.7 + hash(x, y, 2) * 0.4;
      rect(`rgb(${150 * k | 0},${112 * k | 0},${72 * k | 0})`, x, y - 10, 10, 10);
      rect("#5e452f", x, y - 6, 10, 1);
    }
  }
}

const SCENES: Record<string, (mode: Status, f: number) => void> = {
  brick_kiln: (m, f) => furnace(m, f, [190, 110, 80]),
  smelter: (m, f) => furnace(m, f, [172, 92, 62]),
  stove: (m, f) => furnace(m, f, [130, 118, 104]),
  plate_hammer: (m, f) => bench(m, f, "#b9c6d2"),
  forming_bench: (m, f) => bench(m, f, "#8fa6bb"),
  boiler_bench: (m, f) => bench(m, f, "#d0a060"),
  engine_bench: (m, f) => bench(m, f, "#ffd24a"),
  warehouse: () => crate(),
  spring_motor: (m, f) => bench(m, f, "#ffd24a"),
};

export function renderArt(type: string, mode: Status, frame: number): string {
  g.clearRect(0, 0, COLS, ROWS);
  g.save();
  g.scale(1, 0.62); // characters are taller than wide
  SCENES[type](mode, frame);
  g.restore();
  return printCanvas(g, COLS, ROWS);
}

/**
 * Prints a canvas as coloured characters. Textured art gets denser where it is
 * brighter; solid art uses full blocks for a clean, manufactured look.
 */
export function printCanvas(ctx: CanvasRenderingContext2D, cols: number, rows: number, solid = false): string {
  const gain = solid ? 1 : 1.3;
  const px = ctx.getImageData(0, 0, cols, rows).data;
  let html = "";
  for (let y = 0; y < rows; y += 1) {
    let run = "";
    let color = "";
    for (let x = 0; x < cols; x += 1) {
      const i = (y * cols + x) * 4;
      const a = px[i + 3] / 255;
      const [r, gr, b] = [0, 1, 2].map((c) => Math.min(255, px[i + c] * a * gain));
      const lum = (0.3 * r + 0.59 * gr + 0.11 * b) / 255;
      const ch = a < 0.06 ? " " : solid ? "█" : RAMP[Math.min(RAMP.length - 1, 2 + Math.floor(Math.pow(lum, 0.55) * (RAMP.length - 2)))];
      const hex = `#${[r, gr, b].map((v) => Math.min(255, Math.round(v / 24) * 24).toString(16).padStart(2, "0")).join("")}`;
      const next = ch === " " ? color : hex;
      if (next !== color) {
        if (run) html += `<span style="color:${color || "#000"}">${run}</span>`;
        run = "";
        color = next;
      }
      run += ch;
    }
    html += `<span style="color:${color || "#000"}">${run}</span>\n`;
  }
  return html;
}
