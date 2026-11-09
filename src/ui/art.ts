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

function gear(x: number, y: number, radius: number, teeth: number, turn: number) {
  for (let i = 0; i < teeth; i++) {
    const t = turn + (i / teeth) * Math.PI * 2;
    line("#c4ced4", 3, x, y, x + Math.cos(t) * (radius + 2), y + Math.sin(t) * (radius + 2));
  }
  oval("#8d9ca6", x, y, radius, radius);
  oval("#2a333c", x, y, radius * 0.45, radius * 0.45);
  oval("#d9c08a", x, y, 1.5, 1.5);
}

function springMotor(mode: Status, f: number) {
  const step = pose(mode, f);
  // A geared box wound by a key on top. Each pose turns the gears one quarter of a tooth.
  const turn = step * Math.PI / 16;
  rect("#55616d", 8, 68, 60, 4);
  rect("#a5b2bd", 8, 68, 60, 1);
  rect("#6a5940", 12, 28, 44, 40);
  rect("#b09462", 12, 28, 44, 3);
  rect("#463a2a", 12, 64, 44, 4);
  rect("#171e26", 17, 34, 34, 28);
  for (const x of [14, 53]) for (const y of [33, 62]) rect("#e0bd75", x, y, 1, 1);
  gear(29, 47, 10, 8, turn);
  gear(45, 53, 5, 6, -turn * 8 / 6);
  // Output shaft leaving the box.
  rect("#a8b2ba", 56, 50, 12, 4);
  rect("#d0d9dd", 56, 50, 12, 1);
  rect("#b88a54", 66, 47, 4, 10);
  // The wind-up key narrows as it spins on its stem.
  const wing = [10, 6, 2, 6][step];
  rect("#a8b2ba", 32, 16, 5, 12);
  oval("#e0bd75", 34.5 - wing, 11, wing, 6);
  oval("#e0bd75", 34.5 + wing, 11, wing, 6);
  oval("#fff0c0", 34.5, 12, 3, 3);
  blocked(mode);
}

function steamEngine(mode: Status, f: number) {
  const p = pose(mode, f);
  const angle = p * Math.PI / 2;
  // A complete engine on one heavy bed: boiler, chimney and driven cylinder.
  rect("#515d68", 5, 66, 66, 6);
  rect("#a7b5bf", 5, 66, 66, 2);
  rect("#645044", 10, 50, 30, 16);
  rect("#252a31", 15, 55, 12, 9);
  rect("#bd854b", 17, 59, 8, 3);
  oval("#7b684f", 35, 39, 9, 15);
  rect("#ac8b5d", 16, 24, 19, 30);
  rect("#dfc28c", 16, 27, 19, 4);
  rect("#756044", 16, 48, 19, 6);
  oval("#d4b47d", 16, 39, 10, 15);
  oval("#8e704c", 16, 39, 7, 11);
  rect("#4f606d", 12, 9, 7, 17);
  rect("#9cb0be", 12, 9, 2, 17);
  rect("#b6c3c9", 10, 7, 11, 3);
  rect("#c7a875", 30, 18, 7, 7);
  line("#b3c1c7", 3, 35, 20, 46, 20);
  line("#b3c1c7", 3, 46, 20, 46, 37);
  for (const y of [29, 38, 47]) rect("#eed29d", 32, y, 2, 2);
  // The piston sits low on its own mounting, with an exposed connecting rod.
  rect("#718694", 29, 51, 17, 10);
  rect("#d0dce0", 29, 50, 3, 12);
  rect("#c2d0d6", 43, 50, 3, 12);
  rect("#53616a", 49, 59, 13, 7);
  oval("#c3b18a", 56, 45, 16, 19);
  oval("#5f676a", 56, 45, 13, 16);
  oval("#1c252d", 56, 45, 10, 13);
  for (let i = 0; i < 3; i++) {
    const a = angle + i * Math.PI * 2 / 3;
    line("#a5b5bc", 2, 56, 45, 56 + Math.cos(a) * 12, 45 + Math.sin(a) * 15);
  }
  const crankX = 56 + Math.cos(angle) * 6;
  const crankY = 45 + Math.sin(angle) * 7;
  line("#e0c290", 3, 39 + Math.cos(angle) * 3, 55, crankX, crankY);
  oval("#e7d3a8", crankX, crankY, 2, 2);
  oval("#d8e1e4", 56, 45, 3, 3);
  if (mode === "run") {
    for (let i = 0; i < 2; i++) {
      const rise = (p + i * 2) % 4;
      oval("#b4cbd3", 39 + rise * 2, 15 - rise * 3, 2 + rise / 2, 2);
    }
  }
  blocked(mode);
}

function drainagePump(mode: Status, f: number) {
  const p = pose(mode, f);
  const lift = [0, 4, 8, 4][p];
  // Narrow upright pump on a stone bank, with an intake reaching into the river.
  polygon("#766d59", [[6, 56], [36, 54], [43, 62], [39, 72], [6, 72]]);
  polygon("#315c79", [[40, 60], [70, 59], [73, 72], [37, 72]]);
  line("#85bdd1", 1, 45, 64, 66, 64);
  line("#679dbd", 1, 42, 69, 57, 69);
  rect("#4c6674", 25, 46, 6, 18);
  rect("#9fb5bf", 25, 46, 2, 18);
  rect("#677b80", 17, 53, 22, 5);
  rect("#bec8c6", 17, 53, 22, 2);
  rect("#688d91", 20, 28, 16, 24);
  rect("#b0ced0", 20, 28, 4, 24);
  oval("#d3e2dd", 28, 28, 10, 3);
  oval("#759293", 28, 50, 10, 3);
  rect("#c8d6db", 26, 15 + lift, 4, 12 - lift);
  line("#aebbc3", 3, 15, 19, 49, 10 + lift * 2);
  oval("#e1d5b5", 15, 19, 3, 3);
  rect("#a47d4f", 46, 8 + lift * 2, 9, 4);
  rect("#7c9ba7", 35, 34, 22, 6);
  rect("#c1d6dc", 35, 34, 22, 2);
  rect("#7c9ba7", 52, 38, 5, 8);
  oval("#c5d9dc", 54.5, 46, 4, 2);
  oval("#263e4b", 54.5, 46, 2, 1);
  if (mode === "run") {
    for (let i = 0; i < 3; i++) {
      rect("#a8dfed", 53 + i % 2, 48 + (p + i * 4) % 13, 2, 3);
    }
    line("#c6e8ef", 1, 50 - p, 63, 58 + p, 63);
  }
  blocked(mode);
}

function steamHammer(mode: Status, f: number) {
  const p = pose(mode, f);
  const headY = [31, 38, 46, 38][p];
  // Twin cast pillars and an overhead steam cylinder enclose a heavy ram.
  rect("#46535f", 8, 67, 58, 5);
  rect("#acb9c1", 8, 67, 58, 2);
  for (const x of [13, 53]) {
    polygon("#596c79", [[x, 17], [x + 7, 17], [x + 7, 60], [x + 11, 67], [x - 3, 67], [x, 57]]);
    rect("#a3b7c4", x, 20, 2, 42);
    for (const y of [22, 61]) rect("#d5dfe2", x + 3, y, 2, 2);
  }
  rect("#8b9eab", 11, 17, 51, 6);
  rect("#c6d3da", 11, 17, 51, 2);
  rect("#738998", 27, 5, 20, 20);
  rect("#aec6d3", 29, 6, 4, 17);
  rect("#d5dfe0", 25, 4, 24, 3);
  rect("#b9c9ce", 25, 23, 24, 3);
  line("#b49a6b", 3, 48, 12, 59, 12);
  line("#b49a6b", 3, 59, 12, 59, 32);
  rect("#d4e1e7", 34, 26, 5, headY - 26);
  rect("#637788", 24, headY, 26, 9);
  rect("#a9becb", 24, headY, 26, 2);
  rect("#dce5e7", 24, headY + 8, 26, 2);
  polygon("#8093a0", [[20, 57], [51, 57], [51, 61], [44, 63], [47, 67], [25, 67], [28, 63], [20, 61]]);
  rect("#e4be83", 28, 55, 17, 2);
  if (mode === "run" && p === 2) {
    line("#ffd28a", 1, 19, 54, 15, 51);
    line("#ffd28a", 1, 53, 54, 58, 50);
  }
  blocked(mode);
}

function cokeOven(mode: Status, f: number) {
  const p = pose(mode, f);
  // A squat battery of three ovens beneath one continuous brick roof.
  rect("#635b54", 4, 67, 68, 5);
  bricks(6, 37, 64, 30, [158, 105, 76]);
  polygon("#b18b6b", [[4, 37], [11, 31], [63, 31], [72, 37]]);
  rect("#d0ad89", 8, 36, 60, 2);
  rect("#725643", 56, 20, 8, 11);
  rect("#b79778", 54, 18, 12, 3);
  for (const x of [11, 31, 51]) {
    rect("#b6a18a", x, 43, 15, 22);
    rect(mode === "run" ? ["#c66b37", "#e08740", "#f6b25c", "#df8542"][p] : "#3d302b", x + 2, 45, 11, 18);
    rect("#30343a", x + 3, 46, 9, 15);
    rect("#78818a", x + 3, 46, 9, 2);
    rect("#c0a27d", x + 9, 52, 2, 5);
  }
  if (mode === "run") {
    for (let i = 0; i < 3; i++) {
      const rise = (p + i) % 4;
      oval("#8d9298", 59 - rise * 3, 14 - rise * 3, 2 + rise, 2);
    }
  }
  blocked(mode);
}

function blastFurnace(mode: Status, f: number) {
  const p = pose(mode, f);
  // The tallest silhouette: narrow charging throat above a broad masonry stack.
  rect("#565b61", 12, 68, 53, 4);
  g.save();
  g.beginPath();
  g.moveTo(29, 9);
  g.lineTo(45, 9);
  g.lineTo(57, 61);
  g.lineTo(52, 68);
  g.lineTo(20, 68);
  g.lineTo(17, 61);
  g.closePath();
  g.clip();
  bricks(17, 9, 40, 59, [163, 111, 85]);
  rect("#bc9576", 26, 9, 3, 59);
  for (const y of [23, 39, 55]) rect("#5e6972", 17, y, 40, 3);
  g.restore();
  polygon("#a9b6bb", [[24, 2], [50, 2], [44, 10], [30, 10]]);
  oval("#252e37", 37, 3, 10, 2);
  line("#697d89", 5, 49, 17, 61, 17);
  line("#697d89", 5, 61, 17, 61, 49);
  line("#b1c3cb", 1, 60, 17, 60, 49);
  rect("#242930", 28, 56, 16, 11);
  rect(mode === "run" ? ["#da783b", "#f29c48", "#ffd484", "#ed9246"][p] : "#614136", 31, 59, 10, 6);
  polygon("#737782", [[37, 63], [43, 63], [63, 69], [60, 72]]);
  if (mode === "run") line("#ffc978", 2, 38, 63, 60, 69 + p % 2);
  blocked(mode);
}

function converter(mode: Status, f: number) {
  const p = pose(mode, f);
  // An egg-shaped vessel suspended on trunnions, with daylight below its belly.
  rect("#52616b", 7, 68, 62, 4);
  for (const x of [13, 57]) {
    polygon("#71818c", [[x, 34], [x + 5, 34], [x + 9, 68], [x - 5, 68]]);
    line("#b4c4ca", 2, x + 1, 37, x - 2, 65);
  }
  line("#c5b58f", 5, 15, 40, 60, 40);
  polygon("#768b98", [[29, 19], [45, 19], [49, 27], [54, 37], [53, 48], [47, 58], [37, 62], [27, 58], [21, 48], [20, 37], [25, 27]]);
  polygon("#adbfca", [[29, 25], [34, 24], [28, 38], [29, 50], [34, 57], [28, 54], [24, 44], [25, 34]]);
  polygon("#435965", [[46, 27], [51, 38], [50, 48], [44, 57], [37, 59], [43, 50], [46, 39]]);
  oval("#c8d2d3", 37, 20, 11, 4);
  oval("#252b31", 37, 19, 8, 2);
  for (const x of [21, 53]) oval("#c6aa72", x, 40, 4, 4);
  if (mode === "run") {
    const height = [10, 14, 17, 12][p];
    polygon("#e88d43", [[30, 18], [29, 11], [34, 14], [35, 19 - height], [39, 10], [44, 6], [42, 18]]);
    polygon("#ffe2a1", [[34, 18], [36, 9 + p], [39, 13], [40, 18]]);
    rect("#ffcc79", 45 + p, 5 + p * 2, 1, 2);
  }
  blocked(mode);
}

function tarTank(mode: Status, f: number) {
  const p = pose(mode, f);
  // A low open tank with a black reflective surface and an overhead filling pipe.
  rect("#4d5861", 13, 64, 10, 7);
  rect("#4d5861", 52, 64, 10, 7);
  oval("#4e606b", 37, 60, 29, 8);
  rect("#647b87", 8, 37, 58, 23);
  rect("#9cafb7", 11, 40, 4, 19);
  rect("#394b58", 59, 40, 7, 20);
  oval("#b3c2c8", 37, 37, 29, 9);
  oval("#171b24", 37, 37, 25, 6);
  line("#616574", 1, 19, 37, 30, 35);
  line("#444c5b", 1, 40, 40, 54, 38);
  for (const x of [20, 53]) rect("#acb9be", x, 45, 2, 16);
  line("#6d838d", 6, 13, 28, 13, 15);
  line("#6d838d", 6, 13, 15, 39, 15);
  line("#6d838d", 6, 39, 15, 39, 25);
  line("#c1d1d5", 1, 11, 14, 39, 14);
  if (mode === "run") {
    rect("#333645", 38, 26, 3, 9);
    oval("#85838e", 39, 36, 3 + p, 1);
    oval("#21242e", 39, 36, 2 + p, 0.5);
  }
  blocked(mode);
}

function steamManifold(mode: Status, f: number) {
  const p = pose(mode, f);
  // A broad horizontal header feeds three upward branches with wheel valves.
  rect("#52616b", 18, 53, 5, 17);
  rect("#52616b", 53, 53, 5, 17);
  rect("#8a9ba5", 13, 69, 15, 3);
  rect("#8a9ba5", 48, 69, 15, 3);
  rect("#758b97", 5, 42, 65, 12);
  rect("#cad9df", 5, 42, 65, 3);
  rect("#415562", 5, 51, 65, 3);
  for (const x of [5, 66]) {
    rect("#a5b5bd", x, 39, 4, 18);
    for (const y of [41, 53]) rect("#e2e6dc", x + 1, y, 2, 2);
  }
  for (const x of [17, 37, 57]) {
    rect("#738d9b", x - 3, 17, 7, 25);
    rect("#c8dce2", x - 3, 17, 2, 25);
    rect("#b8c6cd", x - 5, 16, 11, 3);
    oval("#bc8a56", x, 30, 6, 6);
    oval("#29353e", x, 30, 4, 4);
    line("#e4bd7e", 1, x - 4, 30, x + 4, 30);
    line("#e4bd7e", 1, x, 26, x, 34);
    if (mode === "run") {
      const rise = (p + (x - 17) / 20) % 4;
      oval("#bad2d9", x + rise - 1, 12 - rise * 2, 2 + rise / 2, 1.5);
    }
  }
  blocked(mode);
}

function itemSplitter(mode: Status, f: number) {
  const p = pose(mode, f);
  // A wide receiving hopper narrows into two opposed, open-ended chutes.
  for (const x of [23, 49]) {
    rect("#62503c", x, 42, 4, 29);
    rect("#b28c5e", x, 42, 1, 29);
  }
  polygon("#8f6c48", [[12, 16], [62, 16], [47, 40], [27, 40]]);
  polygon("#c09a68", [[12, 16], [17, 16], [30, 38], [27, 40]]);
  polygon("#5f4d38", [[55, 17], [62, 16], [47, 40], [43, 39]]);
  oval("#bec6c5", 37, 16, 26, 5);
  oval("#272e34", 37, 16, 22, 3);
  rect("#b5bfc0", 27, 37, 20, 5);
  polygon("#8295a0", [[28, 41], [38, 46], [15, 63], [4, 58]]);
  polygon("#8295a0", [[46, 41], [36, 46], [59, 63], [70, 58]]);
  line("#d0dce0", 2, 28, 41, 4, 58);
  line("#d0dce0", 2, 46, 41, 70, 58);
  line("#374a55", 3, 34, 46, 12, 60);
  line("#374a55", 3, 40, 46, 62, 60);
  polygon("#dec695", [[37, 38], [42, 46], [32, 46]]);
  if (mode === "run") {
    const travel = p * 5;
    rect("#d3ac72", 31 - travel, 46 + p * 3, 4, 3);
    rect("#b4bec6", 39 + travel, 46 + p * 3, 4, 3);
    rect("#c3a27c", 35, 12 + p, 4, 3);
  }
  blocked(mode);
}

function beltDrive(mode: Status, f: number) {
  const p = pose(mode, f);
  // A drive pulley on a low frame, with the belt running off to the right over a small idler.
  rect("#4c5560", 8, 58, 44, 6);
  rect("#8f9aa6", 8, 58, 44, 2);
  rect("#3c444e", 12, 64, 5, 8);
  rect("#3c444e", 43, 64, 5, 8);
  oval("#5e6b78", 28, 38, 17, 17);
  oval("#a9b5c1", 28, 38, 13, 13);
  oval("#3a4550", 28, 38, 4, 4);
  // Spokes turn with the pose so the pulley reads as spinning.
  for (let i = 0; i < 3; i += 1) {
    const a = (i * Math.PI * 2) / 3 + p * 0.5;
    line("#dbe3e9", 2, 28, 38, 28 + Math.cos(a) * 12, 38 + Math.sin(a) * 12);
  }
  oval("#6f7b87", 62, 46, 6, 6);
  oval("#3a4550", 62, 46, 2, 2);
  line("#2a2f36", 4, 28, 21, 62, 40);
  line("#2a2f36", 4, 28, 55, 62, 52);
  if (mode === "run") for (let i = 0; i < 3; i += 1) rect("#c9983f", 34 + ((p * 4 + i * 9) % 26), 24 + ((p * 4 + i * 9) % 26) * 0.5, 3, 2);
  blocked(mode);
}

function constructionBench(mode: Status, f: number) {
  const p = pose(mode, f);
  // A heavy timber bench under a hoist, with a machine frame half put together on it.
  rect("#6b4a33", 6, 50, 62, 7);
  rect("#a87c52", 6, 50, 62, 2);
  rect("#57402d", 10, 57, 6, 15);
  rect("#57402d", 58, 57, 6, 15);
  rect("#4c5560", 4, 6, 4, 44);
  rect("#4c5560", 4, 6, 50, 4);
  rect("#8f9aa6", 4, 6, 50, 1);
  const drop = [0, 3, 6, 3][p];
  line("#c7ced6", 1, 44, 10, 44, 22 + drop);
  rect("#9ca8b7", 40, 22 + drop, 9, 4);
  // The part being lowered into the frame.
  rect("#b9c6d2", 38, 26 + drop, 13, 8);
  rect("#727f8c", 16, 30, 4, 20);
  rect("#727f8c", 30, 30, 4, 20);
  rect("#727f8c", 16, 30, 18, 4);
  rect("#b9c6d2", 16, 30, 18, 1);
  if (mode === "run" && p === 2) {
    line("#ffcd72", 1, 36, 36, 33, 40);
    line("#ffcd72", 1, 53, 36, 56, 40);
  }
  blocked(mode);
}

/** A plain crate, for any machine without a scene of its own yet. */
function crate(mode: Status) {
  rect("#6b4a33", 14, 24, 46, 46);
  rect("#a87c52", 14, 24, 46, 3);
  line("#4a3324", 2, 14, 24, 60, 70);
  line("#4a3324", 2, 60, 24, 14, 70);
  blocked(mode);
}

const SCENES: Record<string, (mode: Status, f: number) => void> = {
  construction_bench: constructionBench,
  belt_drive: beltDrive,
  brick_kiln: (m, f) => furnace(m, f, [190, 110, 80]),
  smelter: (m, f) => furnace(m, f, [172, 92, 62]),
  plate_hammer: plateHammer,
  forming_bench: formingBench,
  boiler_bench: boilerBench,
  engine_bench: engineBench,
  warehouse,
  spring_motor: springMotor,
  steam_engine: steamEngine,
  drainage_pump: drainagePump,
  steam_hammer: steamHammer,
  coke_oven: cokeOven,
  blast_furnace: blastFurnace,
  converter,
  tar_tank: tarTank,
  steam_manifold: steamManifold,
  item_splitter: itemSplitter,
};

function drawScene(type: string, mode: Status, frame: number): void {
  g.clearRect(0, 0, COLS, ROWS);
  g.save();
  g.scale(1, 0.62); // characters are taller than wide
  (SCENES[type] ?? crate)(mode, frame);
  g.restore();
}

export function renderArt(type: string, mode: Status, frame: number): string {
  drawScene(type, mode, frame);
  return printCanvas(g, COLS, ROWS);
}

const small = document.createElement("canvas");
const smallContext = small.getContext("2d", { willReadFrequently: true })!;

/** A machine shrunk to item-icon size. */
export function machineIcon(type: string, cols: number, rows: number): string {
  drawScene(type, "idle", 0);
  small.width = cols;
  small.height = rows;
  smallContext.drawImage(canvas, 0, 0, cols, rows);
  return printCanvas(smallContext, cols, rows);
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
