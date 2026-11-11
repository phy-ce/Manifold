// The two bare arms in the sight view, each holding its tool. Made like a block-game skin: each face is a flat
// pixel grid (the strings below, one letter a shade), folded onto little boxes for the forearm, fist, thumb and
// tool, posed once and drawn with a tiny projection. Each tool id is drawn once and cached; a frame only blits.
// The left hand is the right one mirrored. +Y runs toward the tool's tip, +Z toward the viewer; a unit is a pixel.

type Palette = Record<string, string>;
interface Face {
  grid: string[];
  palette: Palette;
}
type Faces = Record<"front" | "back" | "left" | "right" | "top" | "bottom", Face>;
interface Box {
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  d: number;
  textures: Faces;
  angle: number;
  taper: number;
}
type Vec = [number, number, number];

/** Face textures: l light, m mid, b dark edge, d shadow. */
const GRID: Record<string, string[]> = {
  back: ["bbbbbbbb", "blllllbb", "bllmlmbb", "bmmmmmbd", "bmmmmmdd", "bmmmmddd", "bddddddd"],
  palm: ["mmmmmm", "mddmdm", "mmddmm", "mdddmm", "dddddd"],
  thumb: ["llll", "lmmm", "mmmb", "mmdb", "dddb"],
  fingers: ["lmlmlmlm", "bmbmbmbm", "mmmmmmmm", "ddbddbdd"],
  knuckles: ["bllbllbl", "lllllllm", "mmmmmmmm"],
  arm: ["blllmm", "bmlmmm", "bmmmmm", "bmmmmd", "bmmmdd", "bmmmdd", "bmmddd", "bddddd"],
  handle: ["lmb", "lmb", "mmb", "mlb", "mmb", "lmb", "mmb", "mdb"],
  head: ["blllllb", "llmmmmb", "lmmmmmb", "mmmmdmb", "bmddddb"],
  edge: ["llllll", "lmmmml", "mmmmmb"],
  end: ["llll", "lmmb", "mddb"],
};
const SKIN: Palette = { l: "#bc9271", m: "#a57b5d", b: "#88634c", d: "#70503f" };
const WOOD: Palette = { l: "#a17a4c", m: "#795735", b: "#62462e", d: "#4d3828" };
const MATERIAL: Record<string, string> = { wood: "#c8925a", stone: "#d8bf8a", bone: "#ece4d0", iron: "#9aa3ad" };
const KINDS = ["pick", "axe", "shovel", "spear", "blade"];

const face = (grid: string, palette: Palette): Face => ({ grid: GRID[grid], palette });
const skinFaces: Faces = {
  front: face("back", SKIN), back: face("palm", SKIN), left: face("thumb", SKIN),
  right: face("fingers", SKIN), top: face("knuckles", SKIN), bottom: face("palm", SKIN),
};
/** A material's four shades from its colour. */
function shades(hex: string): Palette {
  const rgb = hex.match(/[a-f\d]{2}/gi)!.map((v) => parseInt(v, 16));
  const shade = (n: number) => "#" + rgb.map((v) => Math.round(v * n).toString(16).padStart(2, "0")).join("");
  return { l: hex, m: shade(0.83), b: shade(0.66), d: shade(0.52) };
}
/** One grid on every side, its ends capped. */
const surface = (grid: string, palette: Palette): Faces => ({
  front: face(grid, palette), back: face(grid, palette), left: face(grid, palette), right: face(grid, palette),
  top: face("end", palette), bottom: face("end", palette),
});
/** Each face's corners, wound outward. */
const FACES: [keyof Faces, number[]][] = [
  ["front", [4, 5, 6, 7]], ["back", [1, 0, 3, 2]], ["left", [0, 4, 7, 3]],
  ["right", [5, 1, 2, 6]], ["top", [7, 6, 2, 3]], ["bottom", [0, 1, 5, 4]],
];

/** The boxes of one arm: forearm, fist and thumb, and the tool through the fist if it holds one. */
function model(id: string): Box[] {
  const boxes: Box[] = [];
  const box = (x: number, y: number, z: number, w: number, h: number, d: number, textures: Faces, angle = 0, taper = 1) =>
    boxes.push({ x, y, z, w, h, d, textures, angle, taper });
  const [material, kind] = id.split("_");
  const holding = !!MATERIAL[material] && KINDS.includes(kind);
  // One bare forearm, broad below and narrowing to the wrist, coming in through the bottom corner.
  box(7, -24, 1, 15, 43, 11, surface("arm", SKIN), 0.35, 0.73);
  box(0, 0, 2, 12, 12, 10, skinFaces, -0.08);
  // The thumb crosses the inner side of the grip, in front of the shaft.
  box(-4, 1, 8, 5, 8, 4, { ...skinFaces, front: face("thumb", SKIN) }, -0.28);
  if (!holding) {
    box(2, 2, 7, 8, 6, 3, { ...skinFaces, front: face("fingers", SKIN) }, -0.08);
    return boxes;
  }
  const metal = shades(MATERIAL[material]);
  const head = { ...surface("head", metal), top: face("edge", metal) };
  // The shaft runs on below the fist and behind it: the fist really closes round it.
  const length = kind === "spear" ? 62 : kind === "blade" ? 17 : 39;
  box(-2, length / 2 - 8, 1, 3, length, 4, surface("handle", WOOD));
  if (kind === "pick") {
    box(-2, 30, 1, 23, 5, 6, head);
    box(-15, 28, 1, 6, 4, 5, head, 0.22);
    box(-19, 26, 1, 4, 2, 3, head, 0.35);
    box(11, 28, 1, 5, 4, 5, head, -0.24);
  } else if (kind === "axe") {
    // +X is the outer side on the right arm; the mirror keeps it outer on the left.
    box(-2, 29, 1, 6, 8, 6, head);
    box(4, 29, 1, 8, 12, 4, head);
    box(10, 29, 1, 5, 17, 2, { ...head, front: face("edge", metal) });
  } else if (kind === "shovel") {
    box(-2, 30, 1, 5, 8, 5, head);
    box(-2, 38, 1, 16, 12, 2, head);
    box(-2, 45, 1, 12, 3, 2, { ...head, front: face("edge", metal) });
  } else if (kind === "spear") {
    box(-2, 52, 1, 7, 12, 4, head);
    box(-2, 60, 1, 5, 5, 3, head);
    box(-2, 64, 1, 3, 4, 2, head);
    box(-2, 67, 1, 1, 3, 1, head);
    box(-2, 45, 1, 5, 4, 5, surface("handle", WOOD));
  } else {
    box(-2, 12, 1, 15, 3, 5, head);
    box(-2, 28, 1, 6, 29, 3, head);
    box(-2, 44, 1, 4, 4, 3, head);
    box(-2, 47, 1, 2, 3, 2, head);
    box(-2, -9, 1, 5, 4, 5, head);
  }
  return boxes;
}

/** The fixed pose: turned to show the side faces, rolled so the tip leans inward. */
function project([x, y, z]: Vec): Vec {
  const a = x * 0.94 - z * 0.342;
  const b = x * 0.342 + z * 0.94;
  const c = y * 0.978 - b * 0.208;
  const depth = y * 0.208 + b * 0.978;
  return [48 + a * 0.951 - c * 0.309, 82 - (a * 0.309 + c * 0.951), depth];
}

const SPRITE = 144;
const CORNERS: Vec[] = [[-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1], [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]];
const UV = [[0, 0], [1, 0], [1, 1], [0, 1]];

/** Draws one arm into a sprite: faces turned away dropped, the rest textured nearest-pixel, nearest in front. */
function render(id: string): HTMLCanvasElement {
  const pixels = new Uint8ClampedArray(SPRITE * SPRITE * 4);
  const depths = new Float32Array(SPRITE * SPRITE).fill(-Infinity);
  const quads: { p: Vec[]; texture: Face; depth: number }[] = [];
  for (const b of model(id)) {
    const corners = CORNERS.map(([cx, cy, cz]) => {
      const taper = cy > 0 ? b.taper : 1;
      const x = cx * (b.w / 2) * taper;
      const z = cz * (cy > 0 ? (1 + b.taper) / 2 : 1);
      const y = cy * (b.h / 2);
      return project([b.x + x * Math.cos(b.angle) - y * Math.sin(b.angle), b.y + x * Math.sin(b.angle) + y * Math.cos(b.angle), b.z + (z * b.d) / 2]);
    });
    for (const [name, indices] of FACES) {
      const p = indices.map((i) => corners[i]);
      const cross = (p[1][0] - p[0][0]) * (p[2][1] - p[0][1]) - (p[1][1] - p[0][1]) * (p[2][0] - p[0][0]);
      if (cross >= 0) continue;
      quads.push({ p, texture: b.textures[name], depth: p.reduce((sum, v) => sum + v[2], 0) / 4 });
    }
  }
  quads.sort((a, b) => a.depth - b.depth);
  for (const { p: quad, texture } of quads) {
    const colours = Object.fromEntries(Object.entries(texture.palette).map(([k, hex]) => [k, hex.match(/\w{2}/g)!.map((v) => parseInt(v, 16))]));
    const rows = texture.grid;
    const th = rows.length;
    const tw = rows[0].length;
    for (const tri of [[0, 1, 2], [0, 2, 3]]) {
      const [o, u, v] = tri.map((i) => quad[i]);
      const uv = tri.map((i) => UV[i]);
      const ux = u[0] - o[0], uy = u[1] - o[1], vx = v[0] - o[0], vy = v[1] - o[1];
      const det = ux * vy - uy * vx;
      const ys = [o[1], u[1], v[1]];
      const xs = [o[0], u[0], v[0]];
      for (let y = Math.max(0, Math.floor(Math.min(...ys))); y < Math.min(SPRITE, Math.ceil(Math.max(...ys))); y++) {
        for (let x = Math.max(0, Math.floor(Math.min(...xs))); x < Math.min(SPRITE, Math.ceil(Math.max(...xs))); x++) {
          const dx = x + 0.5 - o[0], dy = y + 0.5 - o[1];
          const s = (dx * vy - dy * vx) / det;
          const t = (ux * dy - uy * dx) / det;
          if (s < 0 || t < 0 || s + t > 1) continue;
          const tu = uv[0][0] + s * (uv[1][0] - uv[0][0]) + t * (uv[2][0] - uv[0][0]);
          const tv = uv[0][1] + s * (uv[1][1] - uv[0][1]) + t * (uv[2][1] - uv[0][1]);
          const rgb = colours[rows[Math.min(th - 1, Math.floor((1 - tv) * th))][Math.min(tw - 1, Math.floor(tu * tw))]];
          const index = y * SPRITE + x;
          const depth = o[2] + s * (u[2] - o[2]) + t * (v[2] - o[2]);
          if (depth < depths[index]) continue;
          depths[index] = depth;
          pixels.set([...rgb, 255], index * 4);
        }
      }
    }
  }
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = SPRITE;
  const ctx = canvas.getContext("2d")!;
  const data = ctx.createImageData(SPRITE, SPRITE);
  data.data.set(pixels);
  ctx.putImageData(data, 0, 0);
  return canvas;
}

const cache = new Map<string, HTMLCanvasElement>();

/** Both arms at the bottom of a W x H view, each with what it holds (a tool id, or nothing), raised by `lift` pixels. */
export function drawHands(ctx: CanvasRenderingContext2D, W: number, H: number, left: string | undefined, right: string | undefined, lift: { left: number; right: number }): void {
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  for (const [side, id] of [["left", left], ["right", right]] as const) {
    const [material, kind] = (id ?? "").split("_");
    const key = MATERIAL[material] && KINDS.includes(kind) ? id! : "empty";
    let sprite = cache.get(key);
    if (!sprite) cache.set(key, (sprite = render(key)));
    ctx.save();
    if (side === "left") {
      ctx.translate(W, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(sprite, W - 73, Math.round(H - 112 - lift[side]));
    ctx.restore();
  }
  ctx.restore();
}
