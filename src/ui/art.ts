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

function steamBoiler(mode: Status, f: number) {
  const p = pose(mode, f);
  // Effect anchors before y scaling: fire door (28, 56), outlet (71, 17).
  rect("#454b50", 7, 68, 61, 4);
  bricks(11, 43, 53, 25, [127, 88, 65]);
  rect("#777a78", 9, 42, 57, 3);
  rect("#666e71", 17, 45, 22, 22);
  rect("#201e1c", 20, 47, 16, 18);
  g.save();
  g.beginPath();
  g.rect(20, 47, 16, 18);
  g.clip();
  fire(21, 35, 63, mode === "blocked" ? "idle" : mode, p * 2);
  g.restore();
  for (const x of [21, 25, 29, 33]) rect("#42464a", x, 62, 1, 3);
  rect("#88857a", 38, 53, 3, 6);
  // Riveted horizontal drum and rear chimney.
  rect("#414d54", 53, 8, 7, 23);
  rect("#7b878b", 53, 8, 2, 23);
  rect("#8b9595", 51, 6, 11, 3);
  oval("#3f505a", 55, 32, 10, 12);
  rect("#647681", 21, 20, 34, 24);
  rect("#98a6ab", 21, 22, 34, 3);
  rect("#435660", 21, 39, 34, 5);
  oval("#96a3a7", 21, 32, 11, 12);
  oval("#536670", 21, 32, 8, 9);
  oval("#71838b", 20, 30, 5, 6);
  for (const x of [34, 49]) {
    rect("#46555d", x, 20, 2, 24);
    for (const y of [23, 30, 37, 41]) rect("#a8b3b5", x, y, 1, 1);
  }
  line("#92754f", 3, 34, 20, 34, 14);
  oval("#a7926d", 34, 11, 6, 6);
  oval("#c1c4b7", 34, 11, 4, 4);
  line("#303c43", 1, 34, 12, mode === "run" ? 36 : 32, 9);
  rect("#9b8b68", 40, 28, 6, 13);
  rect("#273c44", 42, 30, 2, 9);
  rect("#71959a", 42, 34, 2, 5);
  rect("#88744f", 43, 14, 6, 6);
  line("#89999f", 4, 46, 17, 71, 17);
  rect("#b2babb", 68, 13, 3, 8);
  rect("#34444e", 71, 15, 1, 4);
  line("#9d8960", 2, 46, 14, 46, 8);
  line("#9d8960", 2, 43, 9, 51, 9);
  oval("#655a45", 51, 11, 2, 3);
  if (mode === "run") smoke(56, p * 2);
  blocked(mode);
}

function steamEngine(mode: Status, f: number) {
  const p = pose(mode, f);
  const angle = p * Math.PI / 2;
  // Separate steam supply from the left; exhaust anchor (29, 11).
  rect("#424e58", 5, 66, 66, 6);
  rect("#8999a3", 5, 66, 66, 2);
  line("#71858e", 5, 0, 23, 18, 23);
  line("#71858e", 5, 18, 23, 18, 31);
  line("#a0afb4", 1, 0, 21, 19, 21);
  rect("#a38d65", 7, 19, 3, 8);
  rect("#647b87", 12, 30, 16, 7);
  rect("#99aab1", 12, 30, 16, 2);
  line("#72858e", 4, 26, 31, 29, 25);
  line("#72858e", 4, 29, 25, 29, 11);
  oval("#a6b2b6", 29, 11, 3, 1.5);
  oval("#26343c", 29, 11, 1.5, 0.8);
  for (const x of [13, 25, 54]) rect("#50616d", x, 54, 7, 12);
  rect("#596f7e", 9, 37, 21, 18);
  rect("#8fa6b2", 9, 38, 21, 3);
  rect("#384d5a", 9, 51, 21, 4);
  for (const x of [9, 27]) rect("#a6b5bd", x, 35, 3, 22);
  for (const y of [40, 53]) rect("#657884", 30, y, 18, 2);
  oval("#8999a1", 57, 43, 16, 21);
  oval("#465963", 57, 43, 13, 18);
  oval("#1b252d", 57, 43, 11, 15);
  for (let i = 0; i < 3; i++) {
    const a = angle + i * Math.PI * 2 / 3;
    line("#8298a4", 2, 57, 43, 57 + Math.cos(a) * 12, 43 + Math.sin(a) * 17);
  }
  const crankX = 57 + Math.cos(angle) * 6;
  const crankY = 43 + Math.sin(angle) * 7;
  const slideX = 37 + Math.cos(angle) * 4;
  line("#b4c0c5", 3, 30, 47, slideX, 47);
  rect("#8a9ba5", slideX - 2, 43, 5, 9);
  line("#b29b73", 3, slideX, 47, crankX, crankY);
  oval("#c1b08d", crankX, crankY, 2, 2);
  oval("#b1bec4", 57, 43, 3, 3);
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
  // Solid drive drum on a heavy bed; the shaft comes in from the left, a cleated belt leaves right.
  rect("#43515e", 8, 65, 58, 7);
  rect("#a5b2bd", 8, 65, 58, 3);
  polygon("#596d7b", [[23, 44], [41, 44], [49, 65], [17, 65]]);
  rect("#a4b8c5", 23, 49, 4, 16);
  oval("#202b34", 35, 38, 19, 23);
  rect("#202b34", 35, 15, 41, 9);
  rect("#202b34", 35, 52, 41, 9);
  oval("#465b69", 41, 38, 12, 18);
  rect("#718896", 30, 20, 11, 36);
  rect("#bbced6", 30, 20, 11, 4);
  rect("#354956", 30, 51, 11, 5);
  oval("#c2d0d6", 30, 38, 13, 19);
  oval("#6f8796", 30, 39, 9, 14);
  oval("#a9beca", 28, 35, 5, 9);
  rect("#91a6b3", 2, 34, 28, 8);
  rect("#dce5e9", 2, 34, 28, 3);
  rect("#40515e", 2, 40, 28, 3);
  rect("#a17c49", 9, 29, 8, 18);
  rect("#e0bd75", 9, 29, 8, 4);
  rect("#d8b276", 9, 33, 3, 11);
  rect("#6a7d89", 40, 15, 36, 3);
  rect("#394b57", 40, 58, 36, 3);
  // Only the cleats move: out along the top run, back along the bottom.
  for (let i = 0; i < 3; i += 1) {
    rect("#d8b276", 40 + (i * 12 + p * 3) % 36, 16, 3, 7);
    rect("#92734d", 40 + (i * 12 + 36 - p * 3) % 36, 53, 3, 7);
  }
  blocked(mode);
}

function constructionBench(mode: Status, f: number) {
  // A staked building plot: string lines, a brick footing, an unfinished frame and gable,
  // scaffolding, and heaps of bricks and beams. Only the hammer strokes.
  const headY = [10, 14, 18, 22][pose(mode, f)];
  polygon("#40382f", [[4, 52], [17, 43], [65, 43], [72, 61], [69, 72], [4, 72]]);
  polygon("#87765a", [[4, 52], [17, 43], [65, 43], [72, 66], [4, 66]]);
  line("#b6a383", 2, 5, 52, 17, 44);
  line("#d8b276", 2, 10, 46, 63, 40);
  line("#d8b276", 2, 63, 40, 69, 64);
  line("#d8b276", 2, 10, 46, 6, 64);
  bricks(21, 49, 35, 8, [174, 113, 80]);
  bricks(18, 54, 7, 10, [190, 127, 88]);
  bricks(49, 54, 10, 10, [145, 94, 69]);
  rect("#cba482", 21, 49, 35, 2);
  rect("#443c34", 25, 57, 24, 7);
  for (const [x, y] of [[23, 29], [48, 29], [36, 17]]) {
    rect("#435563", x, y, 6, 51 - y);
    rect("#a9bdc8", x, y, 2, 51 - y);
  }
  line("#718996", 5, 25, 29, 39, 17);
  line("#c4d4da", 2, 24, 27, 38, 15);
  rect("#718996", 23, 29, 31, 5);
  rect("#c4d4da", 23, 29, 31, 2);
  for (const x of [25, 49]) rect("#e0bd75", x, 31, 3, 3);
  for (const x of [59, 68]) line("#8598a2", 3, x, 30, x, 60);
  line("#526570", 3, 59, 57, 68, 37);
  rect("#795337", 56, 39, 16, 5);
  rect("#d0a575", 56, 39, 16, 2);
  bricks(10, 57, 12, 8, [194, 126, 87]);
  for (const y of [59, 64]) {
    rect("#694830", 30, y, 17, 4);
    rect("#bf9563", 30, y, 17, 2);
  }
  line("#d8b276", 2, 6, 66, 69, 66);
  for (const [x, y] of [[8, 43], [61, 37], [4, 61], [67, 61]]) {
    rect("#775236", x, y, 4, 11);
    rect("#e0bd75", x, y, 4, 3);
  }
  line("#bd925f", 3, 29, headY + 3, 40, headY - 4);
  rect("#536978", 22, headY, 11, 7);
  rect("#d3dfe3", 22, headY, 11, 2);
  if (mode === "run" && headY === 22) line("#ffd58c", 2, 20, 28, 16, 24);
  blocked(mode);
}

function workbench(mode: Status, f: number) {
  // Rough plank top, splayed timber trestles and hand tools; only the mallet moves.
  const p = pose(mode, f);
  for (const x of [17, 53]) {
    polygon("#68482f", [[x, 47], [x + 6, 47], [x + 12, 71], [x + 6, 71], [x + 3, 57], [x - 3, 71], [x - 9, 71]]);
    line("#bc9160", 3, x + 1, 51, x - 5, 69);
  }
  rect("#8b623d", 14, 61, 45, 5);
  rect("#c49a68", 14, 61, 45, 2);
  polygon("#93683f", [[6, 39], [65, 38], [70, 43], [69, 51], [6, 51]]);
  polygon("#c9a06b", [[6, 39], [65, 38], [70, 43], [7, 44]]);
  rect("#493325", 7, 48, 62, 4);
  line("#735035", 2, 11, 42, 61, 41);
  rect("#d8b276", 12, 44, 4, 3);
  rect("#d8b276", 57, 44, 4, 3);
  // A coarse saw lies across the left end; a chisel stands in a small offcut.
  polygon("#9baab2", [[9, 34], [28, 32], [28, 36], [24, 39], [21, 37], [17, 40], [14, 38], [9, 40]]);
  rect("#765035", 26, 30, 9, 8);
  rect("#d3a66c", 28, 32, 5, 3);
  rect("#ad7d49", 39, 35, 17, 5);
  rect("#c1cdd2", 44, 29, 3, 7);
  rect("#a77b4d", 42, 22, 7, 8);
  const headY = [8, 13, 18, 13][p];
  line("#b98c56", 4, 47, headY + 4, 62, headY + 15);
  rect("#805533", 37, headY, 17, 8);
  rect("#d5ac76", 37, headY, 17, 3);
  rect("#503727", 50, headY + 3, 4, 5);
  blocked(mode);
}

function openKiln(mode: Status, f: number) {
  // Low, uncovered clay clamp in an earthen pit, with exposed fuel at its foot.
  const p = pose(mode, f);
  polygon("#584638", [[4, 63], [13, 57], [60, 57], [72, 65], [67, 72], [8, 72]]);
  oval("#302923", 38, 62, 28, 7);
  polygon("#866047", [[12, 59], [18, 43], [29, 34], [46, 33], [58, 44], [64, 60]]);
  polygon("#b58a60", [[12, 57], [18, 43], [29, 34], [35, 34], [26, 46], [22, 58]]);
  polygon("#503b30", [[46, 34], [58, 44], [64, 60], [53, 60], [49, 45]]);
  for (const [x, y, w] of [[24, 35, 13], [39, 34, 11], [18, 43, 16], [36, 42, 17], [14, 51, 15], [47, 51, 14]]) {
    rect("#a87350", x, y, w, 7);
    rect("#d0a178", x, y, w, 2);
    rect("#614333", x + w - 3, y + 2, 3, 5);
  }
  polygon("#211e1b", [[28, 62], [30, 49], [42, 47], [48, 62]]);
  line("#795136", 5, 23, 63, 49, 57);
  line("#a0784c", 3, 25, 61, 48, 58);
  fire(30, 46, 61, mode === "blocked" ? "idle" : mode, p * 2);
  for (const [x, y] of [[9, 62], [19, 66], [51, 65], [61, 61]]) {
    polygon("#827b68", [[x, y], [x + 7, y - 2], [x + 10, y + 4], [x + 1, y + 5]]);
    line("#b9ad90", 2, x + 1, y, x + 6, y - 1);
  }
  if (mode === "run") {
    oval("#68625a", 37, 29, 5, 5);
    oval("#827d73", 35, 21, 6, 5);
    oval("#9c9990", 34, 13, 5, 4);
    smoke(34, p * 2);
  }
  blocked(mode);
}

function bloomery(mode: Status, f: number) {
  // Short tapering clay shaft beside a leather bellows hinged at its clay nozzle.
  const p = pose(mode, f);
  const top = [43, 48, 54, 48][p];
  polygon("#635345", [[5, 66], [17, 61], [63, 62], [72, 68], [68, 72], [7, 72]]);
  polygon("#a57551", [[13, 64], [17, 37], [22, 17], [40, 17], [46, 40], [48, 65]]);
  polygon("#d1a576", [[13, 62], [17, 37], [22, 17], [27, 18], [22, 39], [20, 63]]);
  polygon("#674634", [[37, 19], [40, 17], [46, 40], [48, 65], [38, 65], [39, 40]]);
  oval("#c6996e", 31, 18, 10, 4);
  oval("#302821", 31, 18, 7, 2);
  line("#79523b", 2, 25, 32, 31, 36);
  line("#79523b", 2, 31, 36, 28, 43);
  line("#79523b", 2, 19, 51, 25, 48);
  oval("#4d352a", 40, 57, 7, 8);
  oval(mode === "run" ? "#e87932" : "#302720", 40, 57, 5, 5);
  oval(mode === "run" ? "#ffd18a" : "#554032", 40, 57, 3, 3);
  polygon("#ac8057", [[42, 55], [51, 55], [51, 61], [42, 59]]);
  line("#d8b276", 2, 44, 55, 51, 55);
  rect("#59402c", 53, 64, 5, 5);
  rect("#59402c", 66, 64, 5, 5);
  polygon("#724735", [[49, 58], [67, top], [71, top + 5], [70, 62], [64, 65], [49, 61]]);
  polygon("#ac7650", [[51, 58], [66, top + 3], [68, top + 6], [63, 60], [51, 61]]);
  line("#412d25", 2, 54, 59, 67, top + 7);
  line("#68462e", 5, 49, 63, 71, 63);
  line("#c49a68", 4, 49, 57, 70, top);
  line("#e0bd75", 2, 50, 56, 69, top - 1);
  line("#997044", 4, 68, top, 71, top - 7);
  blocked(mode);
}

function handForge(mode: Status, f: number) {
  // A squat horned anvil on a bark-covered stump; a free hand hammer strikes the bloom.
  const p = pose(mode, f);
  const headY = [10, 20, 31, 20][p];
  oval("#42382d", 37, 69, 27, 4);
  polygon("#805535", [[22, 48], [49, 48], [51, 63], [56, 71], [18, 71], [21, 62]]);
  polygon("#b18350", [[22, 49], [28, 50], [27, 65], [23, 70], [19, 70]]);
  polygon("#513a29", [[44, 50], [49, 48], [51, 63], [56, 71], [45, 71]]);
  line("#513a29", 3, 33, 55, 31, 69);
  line("#c0935e", 2, 38, 54, 39, 66);
  oval("#c49b68", 35, 49, 15, 4);
  oval("#805b39", 35, 49, 8, 2);
  polygon("#718593", [[9, 41], [22, 36], [53, 36], [53, 42], [43, 45], [41, 49], [47, 52], [25, 52], [30, 48], [29, 44], [20, 44]]);
  line("#cbd9df", 3, 12, 40, 24, 38);
  rect("#cbd9df", 24, 36, 29, 3);
  polygon("#3e505c", [[43, 42], [53, 40], [53, 42], [43, 45], [41, 49], [47, 52], [38, 52]]);
  polygon(mode === "run" ? "#f39b45" : "#895c40", [[30, 35], [32, 31], [39, 30], [44, 33], [43, 36], [32, 37]]);
  line(mode === "run" ? "#ffe1a0" : "#b18b63", 2, 33, 32, 39, 32);
  line("#b58a57", 4, 39, headY + 3, 61, 29);
  rect("#667985", 29, headY, 17, 7);
  rect("#ced9de", 29, headY, 17, 2);
  rect("#394c58", 42, headY + 2, 4, 5);
  if (mode === "run" && p === 2) {
    line("#ffd181", 2, 26, 32, 20, 27);
    line("#ffd181", 2, 48, 32, 55, 26);
    rect("#ffe4a7", 22, 23, 3, 3);
  }
  blocked(mode);
}

function pressurePump(mode: Status, f: number) {
  // Horizontal force pump on a heavy bed: left crank, tall air dome, flanged outlet right.
  const p = pose(mode, f), a = p * Math.PI / 2;
  const cx = 18 + Math.cos(a) * 5, cy = 49 + Math.sin(a) * 5;
  rect("#43515e", 6, 65, 62, 7);
  rect("#a5b2bd", 6, 65, 62, 3);
  for (const x of [13, 35, 50]) rect("#526775", x, 57, 7, 8);
  rect("#845535", 0, 58, 40, 6);
  rect("#c98a55", 0, 58, 40, 2);
  oval("#435966", 47, 21, 10, 13);
  rect("#617d8c", 37, 21, 20, 24);
  oval("#b8ccd5", 44, 20, 5, 9);
  rect("#b8ccd5", 39, 21, 3, 20);
  rect("#354b59", 53, 22, 4, 23);
  rect("#d8b276", 35, 40, 24, 4);
  rect("#845535", 55, 43, 21, 12);
  rect("#e0bd75", 55, 43, 21, 3);
  rect("#263c48", 57, 47, 19, 5);
  if (mode === "run") {
    for (let i = 0; i < 2; i += 1) rect("#a8d5df", 58 + (i * 8 + p * 2) % 16, 48, 3, 3);
  }
  rect("#d8b276", 67, 40, 5, 18);
  for (const y of [41, 55]) rect("#eef0dc", 68, y, 3, 2);
  rect("#718896", 32, 43, 25, 17);
  rect("#c5d6de", 32, 43, 25, 3);
  rect("#354956", 32, 56, 25, 4);
  for (const x of [32, 53]) rect("#d8b276", x, 42, 3, 19);
  // A pressure gauge on a short copper stem.
  line("#c98a55", 4, 29, 33, 39, 39);
  oval("#e0bd75", 28, 27, 8, 9);
  oval("#e4e8dc", 28, 27, 5, 6);
  line("#263440", 2, 28, 29, 31, 23);
  rect("#a5b9c5", 0, 46, 18, 6);
  // The input shaft turns a crank that drives the piston rod.
  oval("#293943", 18, 49, 10, 12);
  oval("#849daa", 18, 49, 7, 9);
  line("#e0bd75", 4, 18, 49, cx, cy);
  line("#d4dfe3", 3, cx, cy, 38, 51);
  blocked(mode);
}

// Compact late-era machines share a cast bed, but retain distinct tooling.
function machineBed() {
  rect("#424f59", 7, 66, 62, 6);
  rect("#8c9ca5", 7, 66, 62, 2);
  for (const x of [13, 57]) rect("#526570", x, 51, 6, 15);
}

function rollingMill(mode: Status, f: number) {
  const p = pose(mode, f), a = p * Math.PI / 2;
  machineBed();
  // Two massive rolls flatten a steel billet into a thin plate.
  for (const x of [19, 53]) {
    rect("#4e626e", x, 18, 7, 48);
    rect("#8d9fa8", x, 18, 2, 48);
    rect("#9c8a67", x + 2, 10, 3, 8);
    line("#a3aaa7", 2, x - 2, 10, x + 9, 10);
  }
  rect("#71838e", 17, 18, 45, 4);
  rect("#727f86", 2, 39, 27, 7);
  rect("#9aa7ad", 2, 39, 27, 2);
  rect("#7c8e99", 43, 42, 31, 3);
  rect("#b1bbc0", 43, 42, 31, 1);
  for (const y of [32, 53]) {
    rect("#617683", 28, y - 8, 25, 16);
    rect("#9aabb3", 28, y - 7, 25, 3);
    oval("#a2afb5", 28, y, 7, 9);
    oval("#425763", 28, y, 4, 6);
    line("#b6a077", 2, 28, y, 28 + Math.cos(a) * 4, y + Math.sin(a) * (y === 32 ? 6 : -6));
  }
  blocked(mode);
}

function lathe(mode: Status, f: number) {
  const p = pose(mode, f);
  machineBed();
  rect("#637986", 7, 49, 62, 5);
  rect("#a0b0b8", 7, 49, 62, 2);
  rect("#536a78", 8, 26, 14, 23);
  rect("#94a6af", 8, 26, 14, 3);
  oval("#a3afb4", 23, 36, 5, 11);
  oval("#3f515e", 23, 36, 3, 7);
  rect("#83959f", 25, 33, 30, 6);
  line("#bec7ca", 1, 26, 34 + [0, 1, 3, 1][p], 54, 34 + [0, 1, 3, 1][p]);
  polygon("#859aa5", [[53, 36], [62, 28], [67, 28], [67, 49], [58, 49], [58, 39]]);
  const x = 33 + p * 3;
  rect("#485e6d", x, 44, 13, 7);
  rect("#a18d69", x + 4, 39, 4, 7);
  line("#aab7bb", 2, x + 6, 40, x + 3, 37);
  oval("#8a9aa3", x + 6, 55, 4, 4);
  oval("#273740", x + 6, 55, 2, 2);
  for (const dx of [0, 5, 9]) line("#6f7a80", 1, 30 + dx, 61, 33 + dx, 59);
  blocked(mode);
}

function gearCutter(mode: Status, f: number) {
  const p = pose(mode, f);
  machineBed();
  rect("#4d6370", 12, 14, 10, 52);
  rect("#8fa1aa", 12, 14, 3, 49);
  rect("#718590", 12, 14, 40, 6);
  rect("#93a5ae", 12, 14, 40, 2);
  rect("#4a5e6b", 43, 20, 8, 12);
  rect("#9cabb1", 45, 30, 4, 13);
  oval("#a6b2b6", 47, 36, 7, 5);
  for (let i = 0; i < 3; i++) rect("#465864", 42 + (i * 4 + p) % 12, 33, 1, 6);
  rect("#697e8a", 26, 56, 30, 10);
  rect("#9baab1", 23, 54, 36, 3);
  gear(37, 44, 10, 10, p * Math.PI / 20);
  blocked(mode);
}

function wireDrawer(mode: Status, f: number) {
  const p = pose(mode, f), a = p * Math.PI / 2;
  machineBed();
  // Copper stock passes through a die into a large take-up drum.
  oval("#756049", 13, 35, 10, 15);
  oval("#292c2b", 13, 35, 6, 10);
  line("#a97c50", 3, 13, 35, 13 + Math.cos(a) * 8, 35 + Math.sin(a) * 12);
  line("#af8156", 3, 19, 40, 31, 40);
  rect("#526975", 29, 29, 10, 24);
  rect("#a0afb5", 29, 29, 10, 3);
  oval("#b09b73", 34, 40, 3, 5);
  line("#b98a5b", 1, 37, 40, 56, 40);
  rect("#876346", 52, 26, 12, 30);
  for (let y = 29; y < 55; y += 4) line("#b0875e", 1, 52, y, 64, y);
  oval("#899ba6", 52, 41, 7, 18);
  oval("#455966", 52, 41, 5, 14);
  line("#a88d66", 2, 52, 41, 52 + Math.cos(a) * 4, 41 + Math.sin(a) * 12);
  rect("#8395a0", 64, 24, 3, 34);
  blocked(mode);
}

function tarStill(mode: Status, f: number) {
  const p = pose(mode, f);
  machineBed();
  // Steam-jacketed retort, overhead condenser, and a dark pitch receiver.
  line("#6f8189", 4, 26, 22, 26, 12);
  line("#6f8189", 4, 26, 12, 56, 12);
  line("#6f8189", 4, 56, 12, 56, 23);
  oval("#798b94", 26, 31, 15, 14);
  rect("#5e737e", 11, 31, 30, 24);
  oval("#425864", 26, 55, 15, 7);
  rect("#92a2a8", 14, 31, 3, 22);
  for (const y of [33, 51]) rect("#897b60", 11, y, 30, 2);
  rect("#4e6976", 49, 22, 14, 25);
  rect("#879fa9", 49, 22, 3, 25);
  for (const y of [26, 32, 38]) line("#9e7e58", 2, 52, y, 61, y + 3);
  line("#7a8b92", 3, 56, 47, 56, 54);
  rect("#4c555c", 47, 58, 20, 8);
  oval("#89969b", 57, 58, 10, 3);
  oval("#22252a", 57, 58, 8, 2);
  if (mode === "run") rect("#494035", 55, 54 + p, 2, 2);
  line("#87704f", 3, 0, 48, 11, 48);
  blocked(mode);
}

function coilWinder(mode: Status, f: number) {
  const p = pose(mode, f);
  machineBed();
  // Feed reel, pitch bath and traversing guide wind an insulated copper coil.
  oval("#a28159", 14, 31, 9, 12);
  oval("#353c3e", 14, 31, 5, 8);
  line("#ad8a60", 2, 14, 31, 14 + [6, 0, -6, 0][p], 31 + [0, 8, 0, -8][p]);
  line("#ad8056", 1, 21, 34, 31, 48);
  rect("#556672", 24, 45, 16, 9);
  rect("#292a2b", 26, 45, 12, 3);
  line("#806148", 1, 33, 47, 49 + p, 35);
  for (const x of [43, 64]) rect("#5d737f", x, 36, 5, 30);
  line("#a1b0b7", 3, 41, 35, 70, 35);
  rect("#614b38", 48, 23, 15, 24);
  for (let x = 49; x < 63; x += 3) rect("#a07850", x, 24, 1, 22);
  for (const x of [46, 63]) rect("#8598a2", x, 21, 3, 28);
  rect("#a6b1b4", 49 + p * 3, 49, 3, 5);
  blocked(mode);
}

function corePress(mode: Status, f: number) {
  const p = pose(mode, f), drop = [0, 5, 10, 5][p];
  machineBed();
  for (const x of [16, 55]) {
    rect("#536a78", x, 13, 6, 53);
    rect("#8b9fa9", x, 13, 2, 53);
  }
  rect("#748893", 14, 12, 49, 6);
  rect("#a1b0b7", 14, 12, 49, 2);
  rect("#526b7b", 30, 18, 16, 12);
  rect("#a8b6bc", 36, 30, 4, 7 + drop);
  rect("#7a8f9d", 26, 35 + drop, 24, 6);
  rect("#a5b4bc", 26, 35 + drop, 24, 2);
  rect("#3b4d59", 25, 58, 26, 8);
  // Stacked iron laminations, with a central slot.
  for (const y of [51, 54, 57]) {
    rect("#8d9da6", 28, y, 20, 2);
    rect("#283740", 35, y, 6, 2);
  }
  for (const y of [59, 62]) rect("#798a95", 3, y, 17, 2);
  blocked(mode);
}

function generatorBench(mode: Status, f: number) {
  const p = pose(mode, f);
  machineBed();
  rect("#74604a", 6, 52, 64, 5);
  rect("#a18a65", 6, 52, 64, 2);
  // Open generator casing reveals the iron armature and two field coils.
  oval("#526a78", 40, 33, 22, 19);
  oval("#263640", 40, 33, 17, 15);
  for (const y of [20, 40]) {
    rect("#725239", 29, y, 22, 8);
    for (let x = 31; x < 50; x += 3) rect("#a67c50", x, y, 1, 8);
  }
  rect("#8398a4", 30, 30, 21, 7);
  for (const x of [33, 38, 43, 48]) rect("#455b69", x, 30, 1, 7);
  line("#afbdc3", 3, 11, 34, 67, 34);
  rect("#8e7958", 17, 29, 5, 11);
  for (const x of [23, 53]) rect("#657c89", x, 45, 7, 7);
  // Assembly tool strokes; the unfinished generator is not energized.
  const y = 7 + [0, 2, 4, 2][p];
  line("#a6b3b9", 2, 54, y, 54, y + 10);
  rect("#856648", 51, y, 6, 5);
  gear(13, 46, 4, 6, 0);
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
  workbench,
  open_kiln: openKiln,
  bloomery,
  hand_forge: handForge,
  construction_bench: constructionBench,
  belt_drive: beltDrive,
  pressure_pump: pressurePump,
  brick_kiln: (m, f) => furnace(m, f, [190, 110, 80]),
  plate_hammer: plateHammer,
  forming_bench: formingBench,
  boiler_bench: boilerBench,
  engine_bench: engineBench,
  warehouse,
  spring_motor: springMotor,
  steam_boiler: steamBoiler,
  steam_engine: steamEngine,
  drainage_pump: drainagePump,
  steam_hammer: steamHammer,
  coke_oven: cokeOven,
  blast_furnace: blastFurnace,
  converter,
  tar_tank: tarTank,
  steam_manifold: steamManifold,
  item_splitter: itemSplitter,
  rolling_mill: rollingMill,
  lathe,
  gear_cutter: gearCutter,
  wire_drawer: wireDrawer,
  tar_still: tarStill,
  coil_winder: coilWinder,
  core_press: corePress,
  generator_bench: generatorBench,
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
