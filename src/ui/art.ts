// Machine art: a shaded scene on a small canvas, printed as 6px coloured characters.
import { hash } from "../engine/world";
import { Status } from "../engine/game";

export const COLS = 76;
export const ROWS = 46;
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

// Four poses, matching the UI's existing two-tick drawing cadence.
const pose = (mode: Status, frame: number) => mode === "run" ? (Math.floor(frame / 2) % 4 + 4) % 4 : 0;

function line(color: string, width: number, x1: number, y1: number, x2: number, y2: number) {
  g.strokeStyle = color;
  g.lineWidth = width;
  g.beginPath();
  g.moveTo(x1, y1);
  g.lineTo(x2, y2);
  g.stroke();
}

function oval(color: string, x: number, y: number, rx: number, ry: number) {
  g.fillStyle = color;
  g.beginPath();
  g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  g.fill();
}

function polygon(color: string, points: number[][]) {
  g.fillStyle = color;
  g.beginPath();
  points.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y));
  g.closePath();
  g.fill();
}

function blocked(mode: Status) {
  if (mode !== "blocked") return;
  rect("#ff5f56", 67, 7, 3, 10);
  rect("#ff5f56", 67, 20, 3, 3);
}

function plateHammer(mode: Status, f: number) {
  const p = pose(mode, f);
  // A tall guide and a broad falling head above a horned anvil.
  rect("#454d59", 54, 8, 7, 58);
  rect("#929eac", 54, 8, 2, 58);
  rect("#737f8c", 29, 7, 32, 5);
  const headY = [17, 24, 35, 24][p];
  rect("#9ca8b7", 35, 11, 4, headY - 7);
  rect("#697582", 24, headY, 25, 10);
  rect("#dce4e9", 24, headY, 25, 2);
  rect("#adb9c8", 24, headY + 2, 5, 7);
  polygon("#8d99a6", [[8, 47], [20, 44], [49, 44], [49, 51], [39, 54], [39, 60], [47, 63], [47, 66], [19, 66], [19, 63], [28, 59], [28, 54], [19, 51]]);
  line("#dbe3e9", 2, 9, 47, 48, 47);
  rect("#bccfda", 23, 42, 26, 3);
  rect("#eef5f5", 23, 42, 26, 1);
  rect("#594332", 18, 66, 33, 6);
  rect("#39424c", 52, 66, 12, 6);
  if (mode === "run" && p === 2) {
    line("#ffcd72", 1, 18, 39, 14, 35);
    line("#ffcd72", 1, 50, 40, 54, 36);
  }
  blocked(mode);
}

function formingBench(mode: Status, f: number) {
  const p = pose(mode, f);
  // Open press frame, long lever, paired forming rolls and a hollow workpiece.
  rect("#705039", 9, 48, 57, 6);
  rect("#b28a5d", 9, 48, 57, 2);
  rect("#634632", 13, 54, 5, 18);
  rect("#634632", 57, 54, 5, 18);
  rect("#886544", 17, 64, 41, 3);
  rect("#596977", 17, 22, 5, 26);
  rect("#596977", 47, 22, 5, 26);
  rect("#a4b6c4", 16, 21, 37, 4);
  const drop = [0, 2, 4, 2][p];
  line("#c6d4de", 3, 35, 25, 59, 9 + drop * 3);
  oval("#a87b4e", 60, 9 + drop * 3, 4, 3);
  rect("#becad3", 33, 25, 4, 8 + drop);
  rect("#748b9b", 24, 31 + drop, 21, 5);
  oval("#c4d4dd", 28, 42, 7, 5);
  oval("#758d9e", 43, 42, 7, 5);
  rect("#b6cad4", 28, 37, 16, 4);
  oval("#dbe8ea", 28, 41, 5, 4);
  oval("#253440", 28, 41, 3, 2);
  line("#e3edf0", 1, 41, 40, 44, 40 + drop / 2);
  blocked(mode);
}

function boilerBench(mode: Status, f: number) {
  const p = pose(mode, f);
  // Long horizontal shell, domed ends, hoop seams and individual rivets.
  polygon("#66503a", [[13, 55], [25, 55], [29, 71], [10, 71]]);
  polygon("#66503a", [[49, 55], [60, 55], [65, 71], [46, 71]]);
  rect("#bc9466", 11, 55, 52, 4);
  oval("#735235", 57, 39, 10, 17);
  rect("#b78248", 20, 22, 37, 34);
  rect("#e7bb79", 20, 25, 37, 5);
  rect("#ca995b", 20, 30, 37, 9);
  rect("#8c6038", 20, 48, 37, 8);
  oval("#edc68b", 20, 39, 11, 17);
  oval("#aa7948", 20, 40, 8, 13);
  oval("#d3a268", 19, 37, 6, 10);
  for (const x of [34, 51]) {
    rect("#6f563d", x, 22, 3, 34);
    for (const y of [26, 33, 41, 50]) rect("#f3d49d", x, y, 2, 2);
  }
  rect("#8e683f", 41, 15, 8, 7);
  rect("#d8b079", 39, 13, 12, 3);
  // A short riveting tool strokes at the upper seam; the heavy shell stays put.
  const tip = [0, 2, 4, 2][p];
  rect("#536373", 30, 7 + tip, 10, 5);
  rect("#c1ced7", 33, 12 + tip, 3, 6);
  blocked(mode);
}

function engineBench(mode: Status, f: number) {
  const a = pose(mode, f) * Math.PI / 4;
  // Suspended cylinder on the left, open flywheel and crank linkage on the right.
  rect("#4b5964", 10, 10, 5, 59);
  rect("#8b9eac", 10, 9, 36, 4);
  line("#99a5ad", 2, 24, 13, 24, 25);
  line("#99a5ad", 2, 38, 13, 38, 25);
  rect("#647e8e", 18, 26, 24, 20);
  rect("#b4cad4", 18, 26, 24, 4);
  rect("#405966", 18, 42, 24, 4);
  rect("#d1dce0", 18, 25, 3, 22);
  rect("#d1dce0", 39, 25, 3, 22);
  rect("#62717b", 48, 55, 10, 13);
  oval("#bdc7cb", 53, 43, 18, 20);
  oval("#4a5965", 53, 43, 15, 17);
  oval("#171e26", 53, 43, 12, 14);
  for (let i = 0; i < 3; i++) {
    const t = a + i * Math.PI * 2 / 3;
    line("#a0b5c2", 3, 53, 43, 53 + Math.cos(t) * 14, 43 + Math.sin(t) * 16);
  }
  const crankX = 53 + Math.cos(a) * 7;
  const crankY = 43 + Math.sin(a) * 8;
  line("#d8b276", 3, 32, 36, crankX, crankY);
  oval("#e9cf9d", crankX, crankY, 2, 2);
  oval("#d5dce0", 53, 43, 3, 3);
  rect("#55616d", 7, 68, 63, 4);
  rect("#a5b2bd", 7, 68, 63, 1);
  blocked(mode);
}

function stove(mode: Status, f: number) {
  const p = pose(mode, f);
  // Low stone hearth; its pot and handles replace the tall furnace chimney.
  rect("#4d4c49", 11, 47, 54, 23);
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 4; col++) {
      const x = 12 + col * 13;
      const y = 48 + row * 7;
      rect(row % 2 ? "#8b8980" : "#a29d8f", x, y, 12, 6);
      rect("#c0b8a5", x, y, 12, 1);
    }
  }
  rect("#202126", 26, 53, 24, 15);
  for (let i = 0; i < 4; i++) {
    const h = mode === "run" ? [7, 11, 8, 5][(p + i) % 4] : 2;
    rect(mode === "run" ? "#e8833c" : "#6a4940", 29 + i * 5, 66 - h, 3, h);
    if (mode === "run") rect("#ffd780", 30 + i * 5, 64 - h / 2, 1, h / 2);
  }
  rect("#50545a", 8, 45, 60, 4);
  oval("#9babb3", 18, 31, 7, 5);
  oval("#171e26", 18, 31, 4, 2);
  oval("#788890", 57, 31, 7, 5);
  oval("#171e26", 57, 31, 4, 2);
  oval("#657984", 38, 39, 18, 7);
  rect("#657984", 20, 26, 36, 13);
  rect("#9dafb7", 23, 27, 5, 11);
  oval("#bdcbd0", 38, 25, 20, 5);
  oval("#7c909b", 38, 24, 16, 3);
  rect("#d0d8d6", 35, 18, 6, 5);
  if (mode === "run") {
    for (let i = 0; i < 2; i++) {
      const y = 14 - (p + i * 2) % 4 * 3;
      rect("#a8b8be", 29 + i * 15 + p % 2, y, 2, 3);
    }
  }
  blocked(mode);
}

function storageBox(x: number, y: number, w: number, h: number) {
  rect("#967049", x, y, w, h);
  rect("#c79d69", x, y, w, 2);
  rect("#5d442f", x + w - 3, y + 2, 3, h - 2);
  rect("#d0a775", x + 2, y + 2, 2, h - 2);
  line("#c49a66", 2, x + 3, y + h - 3, x + w - 4, y + 3);
  rect("#49382c", x + w / 2 - 2, y + 4, 4, 2);
}

function warehouse(mode: Status, f: number) {
  rect("#514132", 8, 11, 4, 61);
  rect("#514132", 63, 11, 4, 61);
  rect("#bc9667", 8, 9, 59, 4);
  line("#514132", 2, 12, 14, 63, 67);
  for (const y of [31, 52, 70]) {
    rect("#896747", 8, y, 59, 3);
    rect("#c9a373", 8, y, 59, 1);
  }
  storageBox(15, 16, 18, 15);
  storageBox(37, 19, 22, 12);
  storageBox(15, 36, 27, 16);
  storageBox(46, 39, 13, 13);
  storageBox(15, 57, 17, 13);
  // Only the box being handled moves, over four short loading positions.
  storageBox(39 + [0, 2, 4, 2][pose(mode, f)], 57, 19, 13);
  blocked(mode);
}

function springMotor(mode: Status, f: number) {
  const a = pose(mode, f) * Math.PI / 2;
  rect("#6a5940", 18, 60, 7, 10);
  rect("#6a5940", 45, 60, 7, 10);
  rect("#b09462", 12, 69, 47, 3);
  oval("#9f8453", 35, 36, 27, 28);
  oval("#424347", 35, 36, 24, 25);
  oval("#1d252d", 35, 36, 21, 22);
  // A broad continuous spiral reads as wound spring steel, not wheel spokes.
  g.strokeStyle = "#e0bd75";
  g.lineWidth = 2;
  g.beginPath();
  for (let i = 0; i <= 64; i++) {
    const t = i / 64;
    const angle = a + t * Math.PI * 5;
    const r = 3 + t * 17;
    const x = 35 + Math.cos(angle) * r;
    const y = 36 + Math.sin(angle) * r;
    if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
  }
  g.stroke();
  oval("#f0d89c", 35, 36, 4, 4);
  // External winding crank, visibly separated from the spring housing.
  line("#a8b2ba", 3, 60, 36, 66, 36);
  const crankY = 36 + [10, 0, -10, 0][pose(mode, f)];
  line("#cad2d5", 3, 66, 36, 66, crankY);
  rect("#b88a54", 64, crankY - 2, 9, 4);
  blocked(mode);
}

const SCENES: Record<string, (mode: Status, f: number) => void> = {
  brick_kiln: (m, f) => furnace(m, f, [190, 110, 80]),
  smelter: (m, f) => furnace(m, f, [172, 92, 62]),
  stove,
  plate_hammer: plateHammer,
  forming_bench: formingBench,
  boiler_bench: boilerBench,
  engine_bench: engineBench,
  warehouse,
  spring_motor: springMotor,
};

function drawScene(type: string, mode: Status, frame: number): void {
  g.clearRect(0, 0, COLS, ROWS);
  g.save();
  g.scale(1, 0.62); // characters are taller than wide
  SCENES[type](mode, frame);
  g.restore();
}

export function renderArt(type: string, mode: Status, frame: number): string {
  drawScene(type, mode, frame);
  return printCanvas(g, COLS, ROWS);
}

/** The same scene as character runs, for drawing on a canvas. */
export function artRuns(type: string, mode: Status, frame: number): ArtRun[] {
  drawScene(type, mode, frame);
  return scanCanvas(g, COLS, ROWS, false);
}

/** A stretch of same-coloured characters on one row. */
export interface ArtRun {
  row: number;
  col: number;
  color: string;
  text: string;
}

/**
 * Reads a canvas as coloured characters. Textured art gets denser where it is
 * brighter; solid art uses full blocks for a clean, manufactured look.
 */
function scanCanvas(ctx: CanvasRenderingContext2D, cols: number, rows: number, solid: boolean): ArtRun[] {
  const gain = solid ? 1 : 1.3;
  const px = ctx.getImageData(0, 0, cols, rows).data;
  const runs: ArtRun[] = [];
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
        if (run) runs.push({ row: y, col: x - run.length, color: color || "#000", text: run });
        run = "";
        color = next;
      }
      run += ch;
    }
    runs.push({ row: y, col: cols - run.length, color: color || "#000", text: run });
  }
  return runs;
}

/** Prints a canvas as coloured characters in HTML. */
export function printCanvas(ctx: CanvasRenderingContext2D, cols: number, rows: number, solid = false): string {
  const runs = scanCanvas(ctx, cols, rows, solid);
  return runs.map((run, i) => {
    const span = `<span style="color:${run.color}">${run.text}</span>`;
    return run.row !== runs[i + 1]?.row ? `${span}\n` : span;
  }).join("");
}
