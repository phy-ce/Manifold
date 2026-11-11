import { tr } from "../i18n";
import { GameState, Mob, attack, canStrike, creatureInfo, creaturesInSight, isVisible, visionAt, mobVisible, walkTo, weaponOf, harvestTarget, jobOf, toolFor } from "../engine/game";
import { BIOMES, itemColor, toolOf } from "../content";
import { biomeAt, terrain, underCell, ROCK } from "../engine/world";
import { SOUND } from "./sound";
import { keyHint, setKeyHint } from "./keyHint";

const W = 192, H = 108, SW = 24, SH = 28;
const FOCAL = W / (2 * Math.tan(33 * Math.PI / 180));
const HIT_MS = 180;
/** One stroke of a tool while digging, felling or picking: up and down. */
const SWING_MS = 520;
/** How long a blow pressed early waits for the weapon to come ready, in ms. */
const BUFFER_MS = 450;
/** The most cells a wall ray crosses underground. */
const RAY_STEPS = 48;
/** How many cells past the map's sight the surface view still draws, ahead of the player, fading into haze. */
const VIEW_EXTRA = 3;
/** Over how many cells past the map's sight the land fades into fog. */
const FOG_DEPTH = 2.5;
const steps8 = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

type HandRect = (x: number, y: number, w: number, h: number, color: string) => void;
const headTones = new Map<string, string[]>();

/** Cache dim material tones; the view only needs three shades. */
function toolTones(id: string): string[] {
  let tones = headTones.get(id);
  if (!tones) {
    const rgb = parseInt(itemColor(id).slice(1), 16);
    tones = [.48, .65, .34].map((light) =>
      `rgb(${Math.round((rgb >> 16) * light)},${Math.round(((rgb >> 8) & 255) * light)},${Math.round((rgb & 255) * light)})`);
    headTones.set(id, tones);
  }
  return tones;
}

/** Stepped shafts lean inward, with the fingers painted over the grip. */
function drawHeldTool(rect: HandRect, kind: string, tones: string[]): void {
  const [face, light, dark] = tones;
  const length = kind === "spear" ? 36 : kind === "blade" ? 10 : 23;
  for (let y = -length; y < 10; y++) {
    const x = 0;
    rect(x, y, 3, 1, "#59432f");
    rect(x, y, 1, 1, "#806345");
    rect(x + 3, y, 1, 1, "#382e26");
  }
  const x = 0, y = -length;
  switch (kind) {
    case "pick":
      rect(x - 7, y - 2, 16, 4, face);
      rect(x - 5, y - 3, 12, 1, light);
      rect(x - 7, y + 1, 16, 1, dark);
      rect(x + 9, y - 1, 3, 2, face);
      rect(x + 12, y, 2, 1, light);
      rect(x - 9, y, 2, 3, dark);
      break;
    case "axe":
      rect(x - 2, y - 2, 6, 4, face);
      rect(x - 7, y - 5, 5, 11, face);
      rect(x - 9, y - 6, 2, 13, light);
      rect(x - 7, y - 5, 5, 1, light);
      rect(x - 7, y + 5, 5, 2, dark);
      break;
    case "shovel":
      rect(x - 3, y - 8, 10, 8, face);
      rect(x - 2, y, 8, 2, dark);
      rect(x, y + 2, 4, 1, dark);
      rect(x - 3, y - 8, 10, 1, light);
      rect(x - 3, y - 7, 1, 6, light);
      rect(x + 2, y - 6, 1, 6, dark);
      break;
    case "spear":
      rect(x, y - 5, 5, 6, face);
      rect(x + 2, y - 9, 2, 4, light);
      rect(x + 1, y - 5, 1, 5, light);
      rect(x + 4, y - 4, 1, 5, dark);
      rect(x, y + 1, 4, 2, "#958064");
      break;
    case "blade":
      rect(x, y - 15, 4, 16, face);
      rect(x + 1, y - 18, 2, 3, light);
      rect(x, y - 15, 1, 15, light);
      rect(x + 3, y - 14, 1, 15, dark);
      rect(x - 3, y + 1, 10, 2, dark);
      rect(x - 3, y, 10, 1, light);
      break;
  }
}

/** Thumb-side grip, mirrored as a whole; the wrist trails down and outward. */
function drawHand(ctx: CanvasRenderingContext2D, mirror: boolean, id: string | undefined, bob: number): void {
  const origin = mirror ? W - 30 : 30;
  const bottom = H - 17 - bob;
  const rect: HandRect = (x, y, w, h, color) => {
    ctx.fillStyle = color;
    // Shear every scanline together so the head, shaft and fist share the tilt.
    for (let row = y; row < y + h; row++) {
      const inward = x - Math.floor(row / 2);
      ctx.fillRect(mirror ? origin - inward - w : origin + inward, bottom + row, w, 1);
    }
  };
  const tool = id ? toolOf(id) : undefined;
  // Cuff and forearm continue beyond the frame even at the top of a blow.
  rect(-7, 16, 13, 28, "#39352c");
  rect(-7, 16, 2, 28, "#272923");
  rect(4, 16, 2, 28, "#504735");
  rect(-7, 16, 13, 3, "#6b6048");
  rect(-6, 19, 11, 1, "#292b25");
  rect(-5, 8, 9, 8, "#71594a");
  rect(-5, 10, 2, 6, "#493b34");
  rect(2, 10, 2, 6, "#8a705b");
  // Narrow back of the fist behind the shaft; negative x is the outer side.
  rect(-5, -4, 8, 13, "#604b40");
  rect(-4, -5, 7, 2, "#8a705b");
  if (tool) drawHeldTool(rect, tool.kind, toolTones(id!));
  // Four curled fingers cover the handle, with knuckles down the outer edge.
  // An empty fist has loosely tucked fingertips instead of a gripping thumb.
  for (let finger = 0; finger < 4; finger++) {
    const y = -4 + finger * 3;
    const tip = tool ? 4 : 2;
    rect(-6, y, tip + 6, 3, "#71594a");
    rect(-6, y, 2, 2, "#8a705b");
    rect(-6, y + 2, 3, 1, "#493b34");
    rect(-3, y, tip + 2, 1, "#856957");
    rect(tip - 1, y + 1, 2, 2, "#604b40");
  }
  // Thumb starts toward the centre, then folds across the front of the handle.
  rect(tool ? 4 : 2, 0, 3, 6, "#856957");
  rect(tool ? 4 : 2, 0, 2, 4, "#a0876d");
  rect(1, -2, tool ? 5 : 3, 3, "#8a705b");
  rect(0, -3, 3, 3, "#9b7d65");
  rect(0, 0, 4, 1, "#493b34");
}

/** A hash of a wall cell and a spot on its face, in 0..1. */
const grain = (cell: number, a: number, b: number): number =>
  ((Math.imul(cell ^ a, 2654435761) ^ Math.imul(b + 0x9e37, 83492791)) >>> 0) / 4294967296;

/**
 * The tone of raw rock at texel (u, v) of a wall cell's 32×32 face: lumps at two sizes and grit, laid in
 * slanted beds whose tilt each cell picks, cut by the odd crack that wanders. No straight seams, so it reads as
 * rock and not as bricks.
 */
function rockTone(mx: number, my: number, u: number, v: number): number {
  const cell = Math.imul(mx, 73856093) ^ Math.imul(my, 19349663);
  const tilt = (grain(cell, 7, 7) - 0.5) * 1.2;
  const bed = Math.floor((v + u * tilt) / 6 + grain(cell, 9, 9) * 4);
  const lump = grain(cell, (u + bed) >> 2, v >> 2);
  const grit = grain(cell + 1, u, v);
  let tone = 38 + lump * 16 + grit * 7 + (bed & 1 ? 5 : 0);
  // A crack: a line that steps up or down every few texels, on about half the cells.
  const crackAt = Math.floor(grain(cell, 3, 3) * 26) + 3 + Math.floor(grain(cell, u >> 2, 5) * 3) - 1;
  if (grain(cell, 4, 4) < 0.5 && v === crackAt) tone = 24;
  return tone;
}
const PALETTES = {
  melee: [[0, 0, 0], [55, 27, 25], [106, 47, 35], [150, 65, 43], [191, 140, 77], [207, 171, 119]],
  ranged: [[0, 0, 0], [37, 25, 49], [77, 43, 94], [116, 64, 131], [179, 124, 177], [209, 167, 110]],
  yeti: [[0, 0, 0], [38, 40, 52], [132, 152, 178], [196, 212, 228], [236, 242, 250], [126, 206, 255]],
  deer: [[0, 0, 0], [40, 28, 20], [112, 72, 42], [156, 104, 60], [214, 184, 140], [232, 222, 196]],
};
/** A yeti stands taller and broader than anything in the caves; a deer is about a wolf's size, antlers above. */
const SIZE = { melee: [.72, .84], ranged: [.72, .84], yeti: [.95, 1.25], deer: [.8, .95] };

/** A deer side-on: brown back, pale belly and tail, a raised head with branching antlers; legs step by frame. */
function deerPixel(x: number, y: number, frame: number): number {
  const yy = y - (frame === 1 ? 1 : 0);
  let c = 0;
  // Legs: two pairs, front and back, stepping in turn.
  const step = frame === 0 ? 0 : frame === 1 ? 1 : -1;
  for (const [lx, way] of [[6, 1], [8, -1], [15, -1], [17, 1]]) if (Math.abs(x - (lx + (yy > 23 ? step * way : 0))) < 1 && yy >= 19 && yy <= 26) c = 2;
  // Body, a long oval, darker on the back and pale beneath.
  if ((((x - 11.5) / 7.5) ** 2 + ((yy - 16) / 3.6) ** 2) < 1) c = yy < 15 ? 2 : yy > 17 ? 4 : 3;
  // Tail, a pale flash at the rump.
  if (x >= 3 && x <= 4 && yy >= 13 && yy <= 15) c = 4;
  // Neck up and forward, then the head with a dark eye and nose.
  if (x >= 16 && x <= 18 && yy >= 9 && yy <= 14 && x - 16 >= (14 - yy) / 3) c = 3;
  if ((((x - 19.5) / 2.6) ** 2 + ((yy - 8.5) / 1.8) ** 2) < 1) c = 3;
  if (x === 20 && yy === 8) c = 1;
  if (x === 22 && yy === 9) c = 1;
  // Antlers: a beam up and back from the head with tines off it.
  if (yy >= 2 && yy <= 6 && x === 18 - Math.floor((6 - yy) / 2)) c = 5;
  if ((yy === 3 && (x === 18 || x === 19)) || (yy === 5 && x === 19) || (yy === 1 && x === 16)) c = 5;
  return c;
}

/** White shaggy fur over pale blue shade, a dark face with pale eyes; arms and legs swing by frame. */
function yetiPixel(x: number, y: number, frame: number): number {
  const a = Math.abs(x - 11.5);
  const yy = y - (frame === 1 ? 1 : 0);
  const left = x < 12;
  const swing = frame === 0 ? 0 : frame === 1 ? 1 : -1;
  let c = 0;
  // Legs, stepping in turn.
  if (yy >= 22 && yy <= 27 - (left ? Math.max(0, swing) : Math.max(0, -swing)) && a > 2 && a < 7) c = 2;
  // Arms hang long at the sides.
  const arm = yy - (left ? swing : -swing);
  if (arm >= 9 && arm <= 21 && a >= 8 && a < 11.5 - (arm > 18 ? 1 : 0)) c = 3;
  // The body: a broad mound of fur.
  if (yy >= 7 && yy <= 23 && (a / 8.5) ** 2 + ((yy - 15) / 9) ** 2 < 1) c = 3;
  // Head, then the dark face set in it.
  if (yy >= 1 && yy <= 9 && (a / 5) ** 2 + ((yy - 5) / 4.5) ** 2 < 1) c = 3;
  if (yy >= 4 && yy <= 8 && a < 3 - (yy === 8 ? 1 : 0)) c = 1;
  if (yy === 5 && a >= 1 && a < 2) c = 5;
  // Shaggy shading: lighter tufts on top, bluer shade below.
  if (c === 3 && (x * 5 + yy * 3) % 13 < 2) c = 4;
  if (c === 3 && yy > 17 && (x * 3 + yy * 7) % 9 < 3) c = 2;
  return c;
}

/** Tiny indexed sprites, generated once; transparent pixels stay zero. */
function sprite(kind: Mob["kind"], frame: number): Uint8Array {
  const pixels = new Uint8Array(SW * SH);
  if (kind === "yeti" || kind === "deer") {
    const pixel = kind === "yeti" ? yetiPixel : deerPixel;
    for (let y = 0; y < SH; y++) for (let x = 0; x < SW; x++) pixels[y * SW + x] = pixel(x, y, frame);
    return pixels;
  }
  for (let y = 0; y < SH; y++) for (let x = 0; x < SW; x++) {
    const a = Math.abs(x - 11.5);
    const yy = y - (frame === 1 ? 1 : 0);
    let c = 0;
    if (kind === "melee") {
      if (yy >= 12 && yy <= 23 && a < 8 - (yy - 12) * .22) c = 2;
      if (yy >= 2 && yy <= 10 && a > 4 && a < 9 && yy > (9 - a) * 1.5) c = 3;
      if (yy >= 7 && yy <= 18 && a < 10 - Math.max(0, yy - 11) * .8) c = 3;
      if (yy >= 14 && yy <= 20 && a < 4) c = 2;
      if (yy >= 16 && yy <= 18 && a < 2) c = 1;
      if (yy === 11 && a >= 4 && a <= 6) c = 5;
      if (yy >= 20 && yy <= 25 + ((x < 12 ? frame : 2 - frame) % 2) && a > 3 && a < 7) c = 2;
      if (yy === 19 && (a < 1 || (a > 2 && a < 4))) c = 5;
    } else {
      if (yy >= 3 && yy < 15 && a < 2 && yy % 4 !== 0) c = 4;
      if (yy >= 10 && yy <= 22 && a < 8 && (a / 8) ** 2 + ((yy - 16) / 8) ** 2 < 1.3) c = 2;
      if (yy >= 8 && yy <= 16 && a < 8 - Math.abs(yy - 12) * .6) c = 3;
      if (yy >= 13 && yy <= 21 && yy % 4 < 2 && a >= 8 && a < 12 - yy % 4) c = 4;
      if (yy >= 21 && yy <= 25 && a > 4 && a < 9 + (frame === 2 ? 1 : 0)) c = 2;
      if (yy === 11 && a >= 3 && a <= 5) c = 5;
      if (yy === 16 && a < 4) c = 1;
    }
    if (c === 2 && (x * 3 + yy * 5) % 11 < 3) c = 1;
    pixels[y * SW + x] = c;
  }
  return pixels;
}
const SPRITES = {
  melee: [sprite("melee", 0), sprite("melee", 1), sprite("melee", 2)],
  ranged: [sprite("ranged", 0), sprite("ranged", 1), sprite("ranged", 2)],
  yeti: [sprite("yeti", 0), sprite("yeti", 1), sprite("yeti", 2)],
  deer: [sprite("deer", 0), sprite("deer", 1), sprite("deer", 2)],
};

/** Visible map samples are cached so rays and pixels never regenerate terrain. */
interface SurfaceCell {
  x: number; y: number; r: number; g: number; b: number;
  height: number; water: boolean; ice: boolean; snow: boolean;
  plant: number; z: number; lateral: number;
}

export class FightPanel {
  readonly root = document.createElement("div");
  private readonly head = document.createElement("div");
  private readonly title = document.createElement("strong");
  private readonly status = document.createElement("span");
  private readonly key = keyHint("F", "", "off");
  private readonly near = keyHint("C", "", "off");
  /** What the idle view was last drawn for, so standing still with nothing in sight costs nothing. */
  private idle = "";
  private readonly canvas = document.createElement("canvas");
  private readonly ctx: CanvasRenderingContext2D;
  private readonly frame = new ImageData(W, H);
  private readonly walls = new Float32Array(W);
  private readonly depth = new Float32Array(W * H);
  private readonly picks = new Int32Array(W * H);
  private readonly motion = matchMedia("(prefers-reduced-motion: reduce)");
  private surfaceKey = "";
  private surfaceRadius = 0;
  /** How far the player sees on the map now, in cells: the fog begins past it. */
  private sightReach = 5;
  private surfaceX = 0;
  private surfaceY = 0;
  private surface: (SurfaceCell | undefined)[] = [];
  private readonly plants: SurfaceCell[] = [];
  private angle = 0;
  private last = 0;
  /** The layer last drawn: the view snaps round when the player changes layer. */
  private z = 0;
  private hit = { id: -1, at: -Infinity };
  /** A blow pressed for before the weapon was ready, and how long it waits for it. */
  private queued: { id: number; until: number } | null = null;

  constructor(private readonly game: () => GameState, private readonly changed: () => void) {
    // Always on screen: the view the way the player faces, with creatures in it when there are any.
    this.root.className = "box fight-panel";
    this.head.className = "fight-head";
    this.canvas.className = "fight-view";
    this.canvas.width = W;
    this.canvas.height = H;
    this.canvas.tabIndex = 0;
    this.canvas.setAttribute("role", "button");
    this.ctx = this.canvas.getContext("2d", { alpha: false })!;
    // F and C, always in the header so nothing shifts: F lit when a creature is in reach, C when one is seen out of it.
    this.title.textContent = tr("시야");
    this.head.append(this.title, this.key, this.near, this.status);
    this.root.append(this.head, this.canvas);
    // On press, not release: a click only fires when the button comes back up, which feels late in a fight.
    this.canvas.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      const rect = this.canvas.getBoundingClientRect();
      const x = Math.floor((event.clientX - rect.left) * W / rect.width);
      const y = Math.floor((event.clientY - rect.top) * H / rect.height);
      if (x >= 0 && x < W && y >= 0 && y < H) this.strike(this.picks[y * W + x]);
    });
    this.canvas.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        this.strike(this.picks[(H / 2) * W + W / 2]);
      }
    });
  }

  /** Whether a creature is in sight, so F fights. */
  get showing(): boolean { return creaturesInSight(this.game()).length > 0; }

  /** F: the same as pressing the nearest creature in reach, so it is buffered and flashes too. F never walks. */
  strikeNearest(): boolean {
    const s = this.game();
    const target = creaturesInSight(s)[0];
    if (!target || steps8(target, s.player) > weaponOf(s).range) return false;
    this.strike(target.id);
    return true;
  }

  /** C: walks up to the nearest creature in sight that is out of reach. */
  approachNearest(): boolean {
    const s = this.game();
    const target = creaturesInSight(s)[0];
    if (!target || steps8(target, s.player) <= weaponOf(s).range) return false;
    walkTo(s, { x: target.x, y: target.y });
    this.changed();
    return true;
  }

  private strike(id: number): void {
    if (!this.showing || this.game().z !== this.z) return;
    const s = this.game();
    const mob = s.mobs.find((m) => m.id === id);
    if (!mob || !mobVisible(s, mob)) return;
    // A blow asked for while the weapon is still coming back is kept, and lands the moment it is ready,
    // rather than being lost: pressing a little early is how people fight.
    if (!canStrike(s) && steps8(mob, s.player) <= weaponOf(s).range) {
      this.queued = { id, until: performance.now() + BUFFER_MS };
      return;
    }
    this.queued = null;
    if (attack(s, id)) {
      SOUND.good();
      this.hit = { id, at: performance.now() };
    } else if (steps8(mob, s.player) > weaponOf(s).range && canStrike(s)) {
      walkTo(s, { x: mob.x, y: mob.y });
    }
    this.changed();
    this.draw();
  }

  private pixel(x: number, y: number, r: number, g: number, b: number): void {
    const i = (y * W + x) * 4;
    const data = this.frame.data;
    data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = 255;
  }

  /**
   * The ground the view draws, sampled again only when the player moves or turns. The view is the player's eyes,
   * not the map: it draws the land ahead some cells past what the map counts as seen (VIEW_EXTRA), fading into
   * haze, so a forest shows its trees even where sight on the map is short. Behind the player only what is in
   * sight is drawn; the view never looks back anyway.
   */
  private sampleSurface(s: GameState): void {
    this.sightReach = visionAt(s, s.player);
    const radius = Math.ceil(this.sightReach) + VIEW_EXTRA;
    const key = `${s.seed},${s.player.x},${s.player.y},${s.facing?.x},${s.facing?.y},${radius}`;
    if (key === this.surfaceKey) return;
    this.surfaceKey = key;
    this.surfaceRadius = radius;
    this.surfaceX = s.player.x - radius;
    this.surfaceY = s.player.y - radius;
    const size = radius * 2 + 1;
    this.surface.length = size * size;
    this.surface.fill(undefined);
    this.plants.length = 0;
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const wx = this.surfaceX + x, wy = this.surfaceY + y;
      const ahead = s.facing ? (wx - s.player.x) * s.facing.x + (wy - s.player.y) * s.facing.y : 1;
      if (!isVisible(s, wx, wy) && (ahead <= 0 || Math.hypot(wx - s.player.x, wy - s.player.y) > radius)) continue;
      const [glyph, cls, height] = terrain(wx, wy, s.seed);
      const id = biomeAt(wx, wy, s.seed), biome = BIOMES[id];
      const color = parseInt(biome.ground.slice(1), 16);
      const cell: SurfaceCell = {
        x: wx, y: wy, r: (color >> 16) * .8, g: ((color >> 8) & 255) * .8, b: (color & 255) * .8,
        height: cls === "t-hill" ? height * .4 : 0,
        water: cls === "t-water", ice: cls === "t-ice", snow: id === "snow" || id === "mountain",
        plant: glyph === "T" ? 2 : glyph === "t" ? 1 : id === "marsh" && glyph === '"' ? 3 : 0,
        z: 0, lateral: 0,
      };
      this.surface[y * size + x] = cell;
      if (cell.plant && (wx !== s.player.x || wy !== s.player.y)) this.plants.push(cell);
    }
  }

  private surfaceAt(x: number, y: number): SurfaceCell | undefined {
    x -= this.surfaceX; y -= this.surfaceY;
    const size = this.surfaceRadius * 2 + 1;
    return x >= 0 && y >= 0 && x < size && y < size ? this.surface[y * size + x] : undefined;
  }

  /** One haze colour joins the sky, unknown ground and distant silhouettes. */
  /**
   * One haze colour joins the sky, unknown ground and distant silhouettes. Past the player's sight on the map
   * (sightReach) the land sinks into fog within FOG_DEPTH cells: what the map can't see, the view can only make out
   * as shapes, then not at all.
   */
  private surfacePixel(x: number, y: number, r: number, g: number, b: number, distance: number): void {
    const beyond = Math.max(0, distance - this.sightReach) / FOG_DEPTH;
    const light = Math.max(0, 1 - beyond) / (1 + distance * distance * .045);
    this.pixel(x, y, 70 + (r - 70) * light, 80 + (g - 80) * light, 92 + (b - 92) * light);
  }

  /** Floor and hill projection share the creatures' half-cell eye height. */
  private paintOpen(s: GameState, px: number, py: number, dx: number, dy: number): void {
    this.sampleSurface(s);
    for (let y = 0; y < H; y++) {
      if (y < H / 2) {
        const fade = (y / (H / 2)) ** 2;
        for (let x = 0; x < W; x++) this.pixel(x, y, 24 + 46 * fade, 30 + 50 * fade, 44 + 48 * fade);
        continue;
      }
      const row = FOCAL * .5 / (y + .5 - H / 2);
      for (let x = 0; x < W; x++) {
        const plane = (x + .5 - W / 2) / FOCAL;
        const gx = px + (dx - dy * plane) * row, gy = py + (dy + dx * plane) * row;
        const cell = this.surfaceAt(Math.floor(gx), Math.floor(gy));
        if (!cell) { this.pixel(x, y, 70, 80, 92); continue; }
        const hash = (Math.imul(Math.floor(gx * 12), 73856093) ^ Math.imul(Math.floor(gy * 12), 19349663)) >>> 0;
        const fleck = hash % 17 < 2 ? -10 : hash % 29 === 0 ? 7 : 0;
        if (cell.water || cell.ice) {
          const glint = (Math.floor(gy * 18) + Math.floor(gx * 3)) % 7 === 0 ? 17 : 0;
          this.surfacePixel(x, y, (cell.ice ? 133 : 32) + glint, (cell.ice ? 153 : 52) + glint, (cell.ice ? 166 : 61) + glint, row);
        } else this.surfacePixel(x, y, cell.r + fleck, cell.g + fleck, cell.b + fleck, row);
      }
    }
    // Keep stepping past low blocks so farther peaks rise over them.
    for (let x = 0; x < W; x++) {
      const plane = (x + .5 - W / 2) / FOCAL;
      const rx = dx - dy * plane, ry = dy + dx * plane;
      let mx = Math.floor(px), my = Math.floor(py);
      const sx = rx < 0 ? -1 : 1, sy = ry < 0 ? -1 : 1;
      const ddx = Math.abs(1 / rx), ddy = Math.abs(1 / ry);
      let tx = ddx * .5, ty = ddy * .5;
      for (let step = 0; step < this.surfaceRadius * 4; step++) {
        let entry: number, side: number;
        if (tx < ty) { entry = tx; tx += ddx; mx += sx; side = 0; }
        else { entry = ty; ty += ddy; my += sy; side = 1; }
        const cell = this.surfaceAt(mx, my);
        if (!cell) break;
        if (!cell.height) continue;
        const exit = Math.min(tx, ty);
        const front = H / 2 + (.5 - cell.height) * FOCAL / entry;
        const back = H / 2 + (.5 - cell.height) * FOCAL / exit;
        const bottom = H / 2 + .5 * FOCAL / entry;
        for (let y = Math.max(0, Math.ceil(Math.min(front, back) - .5)); y + .5 < Math.min(H, bottom); y++) {
          const slope = (y + .5 - H / 2) / FOCAL;
          const top = y + .5 < front;
          const z = top ? (.5 - cell.height) / slope : entry;
          if (z < entry || z > exit || z >= this.depth[y * W + x]) continue;
          const wx = px + rx * z, wy = py + ry * z;
          // The same raw rock as cave walls, so a hill up close is stone and not a checkerboard: across the face
          // and up its height on a side, across the ground on top.
          const across = Math.floor((top || side === 1 ? wx : wy) * 32) & 31;
          const up = Math.floor((top ? wy : .5 - slope * z) * 32) & 31;
          const grain = (rockTone(cell.x, cell.y, across, up) - 46) * .8;
          const cap = cell.snow && (top || .5 - slope * z > cell.height - .09);
          const shade = top ? 1.08 : side === 0 ? .64 : .82;
          this.surfacePixel(x, y, (cap ? 173 : cell.r + 14) * shade + grain, (cap ? 185 : cell.g + 8) * shade + grain, (cap ? 194 : cell.b) * shade + grain, z);
          this.depth[y * W + x] = z;
        }
      }
    }
    this.paintPlants(px, py, dx, dy);
  }

  /** Static layered silhouettes leave gaps; only opaque pixels write depth. */
  private paintPlants(px: number, py: number, dx: number, dy: number): void {
    for (const cell of this.plants) {
      const ax = cell.x + .5 - px, ay = cell.y + .5 - py;
      cell.z = ax * dx + ay * dy;
      cell.lateral = -ax * dy + ay * dx;
    }
    this.plants.sort((a, b) => b.z - a.z);
    for (const cell of this.plants) {
      const z = cell.z;
      if (z <= .08) continue;
      const reed = cell.plant === 3;
      const scale = FOCAL / z;
      const width = scale * (reed ? .55 : cell.plant === 2 ? .95 : .75);
      const height = scale * (reed ? .38 : cell.plant === 2 ? 1.65 : 1.3);
      const left = W / 2 + cell.lateral * scale - width / 2;
      const bottom = H / 2 + scale / 2, top = bottom - height;
      for (let x = Math.max(0, Math.ceil(left)); x < Math.min(W, left + width); x++) {
        const u = Math.floor((x - left) / width * 24), a = Math.abs(u - 11.5);
        for (let y = Math.max(0, Math.ceil(top)); y < Math.min(H, bottom); y++) {
          const v = Math.floor((y - top) / height * 28), p = y * W + x;
          if (z >= this.depth[p]) continue;
          let trunk = false, leaf = false;
          if (reed) trunk = (u % 5 === 1 && v > 4 + u % 7) || (v > 14 && v < 19 && (u + v) % 7 === 0);
          else {
            trunk = a < 1.7 && v > 15;
            leaf = cell.snow
              ? v >= 1 && v < 22 && a < Math.min(v * .65, 3 + (v - 1) % 7)
              : (v >= 2 && v < 10 && a < 5 + Math.min(v - 2, 9 - v)) || (v >= 8 && v < 17 && a < 8 + Math.min(v - 8, 16 - v) * .6) || (v >= 16 && v < 22 && a < 9 - (v - 16));
          }
          if (!trunk && !leaf) continue;
          const shade = ((u * 3 + v * 5) % 11 < 3 ? -9 : 0) + (u < 10 ? 7 : 0);
          const snow = leaf && cell.snow && v % 7 < 2;
          this.surfacePixel(x, y, (snow ? 163 : leaf ? 43 : reed ? 92 : 70) + shade, (snow ? 178 : leaf ? 71 : reed ? 91 : 53) + shade, (snow ? 186 : leaf ? 49 : reed ? 57 : 39) + shade, z);
          this.depth[p] = z;
        }
      }
    }
  }

  draw(): void {
    const s = this.game();
    // Underground casts rock walls; the surface casts visible terrain and plants.
    const cave = s.z < 0;
    const seen = creaturesInSight(s);
    const weapon = weaponOf(s);
    const now = performance.now();
    const bob = this.motion.matches ? 0 : Math.round(Math.sin(Math.min(1, (now - this.hit.at) / 240) * Math.PI) * 5);
    // While a dig, felling or picking goes on, the hand with the tool for it (the right one when bare) swings over
    // and over: up slowly, down fast, a stroke every SWING_MS.
    const site = s.dig ? harvestTarget(s)?.site : undefined;
    const working = site ? toolFor(s, jobOf(site))?.hand ?? "right" : null;
    const phase = (now % SWING_MS) / SWING_MS;
    const swing = working && !this.motion.matches ? Math.round((phase < 0.7 ? phase / 0.7 : (1 - phase) / 0.3) * 7) : 0;
    const inReach = seen.some((m) => steps8(m, s.player) <= weapon.range);
    // The key hints say what F and C would do right now; with nothing in sight both are dim.
    setKeyHint(this.key, "F", tr("공격"), inReach && canStrike(s) ? "on" : "off");
    setKeyHint(this.near, "C", tr("다가가기"), seen.length && !inReach ? "on" : "off");
    this.status.textContent = `${tr("사거리")} ${weapon.range}${tr("칸")}`;
    const wasIdle = !!this.idle;
    if (!seen.length) {
      this.queued = null;
      // Nothing in sight: the view looks the way the player faces, and is drawn again only when that changes.
      const facing = s.facing ?? { x: 0, y: 1 };
      const idle = `${s.z},${s.player.x},${s.player.y},${facing.x},${facing.y},${s.gear.left?.id},${s.gear.right?.id},${bob},${working},${swing}`;
      if (idle === this.idle) return;
      this.idle = idle;
      this.angle = Math.atan2(facing.y, facing.x);
      this.canvas.setAttribute("aria-label", tr("시야"));
    } else {
      this.idle = "";
    }
    // A blow pressed early lands as soon as the weapon is ready, if it is still wanted.
    if (this.queued && (now > this.queued.until || !s.mobs.some((m) => m.id === this.queued!.id))) this.queued = null;
    if (this.queued && canStrike(s)) {
      const id = this.queued.id;
      this.queued = null;
      this.strike(id);
      return;
    }
    // With a creature in sight the view turns to the nearest, quickly the first time and smoothly after.
    const target = seen[0];
    if (target) {
      const desired = Math.atan2(target.y - s.player.y, target.x - s.player.x);
      if (wasIdle || this.z !== s.z) this.angle = desired;
      const delta = Math.atan2(Math.sin(desired - this.angle), Math.cos(desired - this.angle));
      this.angle += delta * (1 - Math.exp(-Math.min(150, now - this.last) / 180));
      this.canvas.setAttribute("aria-label", `${tr("시야")}: ${seen.map((m) => `${tr(creatureInfo(m.kind).name)} ${m.hp}/${creatureInfo(m.kind).hp}`).join(", ")}`);
    }
    this.last = now;
    this.z = s.z;
    this.picks.fill(-1);
    this.depth.fill(Infinity);
    const px = s.player.x + .5, py = s.player.y + .5;
    const dx = Math.cos(this.angle), dy = Math.sin(this.angle);
    if (cave) {
      for (let y = 0; y < H; y++) {
        const fade = Math.abs(y - H / 2) / (H / 2);
        const tone = 7 + Math.floor(fade * (y < H / 2 ? 10 : 20));
        for (let x = 0; x < W; x++) this.pixel(x, y, tone, tone + 3, tone + 6);
      }
    } else {
      this.walls.fill(Infinity);
      // Surface silhouettes have varying heights and gaps, so they use per-pixel depth.
      this.paintOpen(s, px, py, dx, dy);
    }
    // DDA ray lengths are perpendicular camera depths, shared with billboard projection.
    for (let x = 0; cave && x < W; x++) {
      const plane = (x + .5 - W / 2) / FOCAL;
      const rx = dx - dy * plane, ry = dy + dx * plane;
      let mx = Math.floor(px), my = Math.floor(py);
      const sx = rx < 0 ? -1 : 1, sy = ry < 0 ? -1 : 1;
      const ddx = Math.abs(1 / rx), ddy = Math.abs(1 / ry);
      let tx = (rx < 0 ? px - mx : mx + 1 - px) * ddx;
      let ty = (ry < 0 ? py - my : my + 1 - py) * ddy;
      let distance = 1, side = 0;
      // Creatures are only shown within sight, so a ray need never run far before the dark ends it.
      for (let step = 0; step < RAY_STEPS; step++) {
        if (tx < ty) { distance = tx; tx += ddx; mx += sx; side = 0; }
        else { distance = ty; ty += ddy; my += sy; side = 1; }
        if (underCell(mx, my, s.seed) === ROCK) break;
      }
      distance = Math.max(.01, distance);
      this.walls[x] = distance;
      const height = FOCAL / distance;
      const top = H / 2 - height / 2;
      const u = Math.floor(((side === 0 ? py + distance * ry : px + distance * rx) % 1 + 1) % 1 * 32);
      const light = (side === 0 ? .68 : .9) / (1 + distance * .15);
      for (let y = Math.max(0, Math.ceil(top)); y < Math.min(H, top + height); y++) {
        const v = Math.floor((y - top) / height * 32);
        const tone = rockTone(mx, my, u, v);
        this.pixel(x, y, tone * light, (tone + 7) * light, (tone + 13) * light);
      }
    }
    const projected = seen.map((mob) => {
      const ax = mob.x + .5 - px, ay = mob.y + .5 - py;
      return { mob, z: ax * dx + ay * dy, lateral: -ax * dy + ay * dx };
    }).sort((a, b) => b.z - a.z);
    for (const { mob, z, lateral } of projected) {
      if (z <= .08) continue;
      const scale = FOCAL / z;
      const width = scale * SIZE[mob.kind][0], height = scale * SIZE[mob.kind][1];
      const left = W / 2 + lateral * FOCAL / z - width / 2;
      const bottom = H / 2 + scale / 2;
      const top = bottom - height;
      const phase = this.motion.matches ? 0 : Math.floor(now / 240 + mob.id) % 3;
      const art = SPRITES[mob.kind][phase];
      const palette = PALETTES[mob.kind];
      const light = 1 / (1 + z * .09);
      const flash = this.hit.id === mob.id && now - this.hit.at < HIT_MS;
      const inReach = steps8(mob, s.player) <= weapon.range;
      const barY = Math.max(1, Math.floor(top) - 4);
      for (let x = Math.max(0, Math.ceil(left)); x < Math.min(W, left + width); x++) {
        if (z >= this.walls[x]) continue;
        const u = Math.min(SW - 1, Math.floor((x - left) / width * SW));
        for (let y = Math.max(0, Math.ceil(top)); y < Math.min(H, bottom); y++) {
          const v = Math.min(SH - 1, Math.floor((y - top) / height * SH));
          const color = art[v * SW + u];
          if (!color) continue;
          const p = y * W + x;
          if (z > this.depth[p]) continue;
          const rgb = palette[color];
          this.pixel(x, y, rgb[0] * light + (flash ? 65 : 0), rgb[1] * light + (flash ? 48 : 0), rgb[2] * light + (flash ? 32 : 0));
          this.depth[p] = z;
          this.picks[p] = mob.id;
        }
        // Bars and reach marks obey the same occlusion as the creature.
        for (let y = barY; y < Math.min(H, barY + 2); y++) {
          if (!cave && z >= this.depth[y * W + x]) continue;
          const filled = (x - left) / width <= mob.hp / creatureInfo(mob.kind).hp;
          this.pixel(x, y, filled ? 121 : 29, filled ? 75 : 27, filled ? 68 : 31);
          this.depth[y * W + x] = z;
          this.picks[y * W + x] = mob.id;
        }
        const foot = Math.floor(bottom + 1);
        if (inReach && foot < H && (u < 5 || u > 18) && (cave || z < this.depth[foot * W + x])) {
          this.pixel(x, foot, 113, 111, 78);
          this.depth[foot * W + x] = z;
          this.picks[foot * W + x] = mob.id;
        }
      }
    }
    for (const shot of s.shots) {
      const ax = shot.x + .5 - px, ay = shot.y + .5 - py;
      const z = ax * dx + ay * dy;
      if (z <= .08) continue;
      const cx = Math.round(W / 2 + (-ax * dy + ay * dx) * FOCAL / z);
      const radius = Math.min(2, Math.max(0, Math.floor(1.5 / z)));
      for (let x = Math.max(0, cx - radius); x <= Math.min(W - 1, cx + radius); x++) {
        for (let y = H / 2 - radius; y <= H / 2 + radius; y++) {
          if (z < this.walls[x] && z < this.depth[y * W + x]) this.pixel(x, y, 192, 155, 199);
        }
      }
    }
    this.ctx.putImageData(this.frame, 0, 0);
    // Dim, small overlay; only a successful hit moves the striking hand.
    const striking = weapon.hand ?? "right";
    const lift = (hand: string) => (striking === hand ? bob : 0) + (working === hand ? swing : 0);
    drawHand(this.ctx, false, s.gear.left?.id, lift("left"));
    drawHand(this.ctx, true, s.gear.right?.id, lift("right"));
    // How long until the next blow: a thin bar under the hand that shrinks to nothing when ready.
    const wait = Math.max(0, (s.strikeReady ?? 0) - s.time);
    if (wait > 0) {
      const span = Math.max(1, Math.round((W * 0.3 * wait) / weapon.cooldown));
      this.ctx.fillStyle = "#6b5a44";
      this.ctx.fillRect(Math.round(W / 2 - span / 2), H - 2, span, 1);
    }
    // The crosshair turns amber while a blow pressed early is waiting to land.
    this.ctx.fillStyle = this.queued ? "#c9963f" : "#747a76";
    this.ctx.fillRect(W / 2 - 3, H / 2, 2, 1);
    this.ctx.fillRect(W / 2 + 2, H / 2, 2, 1);
    this.ctx.fillRect(W / 2, H / 2 - 3, 1, 2);
  }
}
