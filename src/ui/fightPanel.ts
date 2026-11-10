import { tr } from "../i18n";
import { GameState, Mob, attack, canStrike, creatureInfo, creaturesInSight, mobVisible, walkTo, weaponOf } from "../engine/game";
import { BIOMES } from "../content";
import { biomeAt, underCell, ROCK } from "../engine/world";
import { SOUND } from "./sound";
import { keyHint, setKeyHint } from "./keyHint";

const W = 192, H = 108, SW = 24, SH = 28;
const FOCAL = W / (2 * Math.tan(33 * Math.PI / 180));
const HIT_MS = 180;
/** How long a blow pressed early waits for the weapon to come ready, in ms. */
const BUFFER_MS = 450;
/** The most cells a wall ray crosses underground. */
const RAY_STEPS = 48;
const steps8 = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
const PALETTES = {
  melee: [[0, 0, 0], [55, 27, 25], [106, 47, 35], [150, 65, 43], [191, 140, 77], [207, 171, 119]],
  ranged: [[0, 0, 0], [37, 25, 49], [77, 43, 94], [116, 64, 131], [179, 124, 177], [209, 167, 110]],
  yeti: [[0, 0, 0], [38, 40, 52], [132, 152, 178], [196, 212, 228], [236, 242, 250], [126, 206, 255]],
};
/** A yeti stands taller and broader than anything in the caves. */
const SIZE = { melee: [.72, .84], ranged: [.72, .84], yeti: [.95, 1.25] };

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
  if (kind === "yeti") {
    for (let y = 0; y < SH; y++) for (let x = 0; x < SW; x++) pixels[y * SW + x] = yetiPixel(x, y, frame);
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
};

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
      if (event.key === "Enter" || event.key === " ") {
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
   * Open ground, nothing to cast against: a dim sky over the biome's ground (`near`, its colour close by), both
   * fading into haze toward the horizon. Flecks are fixed to the ground, so they slide as the view turns.
   */
  private paintOpen(px: number, py: number, dx: number, dy: number, near: [number, number, number]): void {
    const haze = [92, 100, 112];
    for (let y = 0; y < H; y++) {
      const fade = Math.abs(y - H / 2 + .5) / (H / 2);
      if (y < H / 2) {
        const r = 24 + (haze[0] - 24) * (1 - fade) ** 2, g = 30 + (haze[1] - 30) * (1 - fade) ** 2, b = 44 + (haze[2] - 44) * (1 - fade) ** 2;
        for (let x = 0; x < W; x++) this.pixel(x, y, r, g, b);
        continue;
      }
      // A floor row's distance; nearer rows are brighter snow.
      const row = (H / 2) / Math.max(.5, y - H / 2 + .5);
      const close = Math.min(1, fade * 1.6);
      const base = [0, 1, 2].map((i) => haze[i] + (near[i] - haze[i]) * close);
      for (let x = 0; x < W; x++) {
        const plane = (x + .5 - W / 2) / FOCAL;
        const gx = Math.floor((px + (dx - dy * plane) * row) * 4), gy = Math.floor((py + (dy + dx * plane) * row) * 4);
        const fleck = ((Math.imul(gx, 73856093) ^ Math.imul(gy, 19349663)) >>> 0) % 23 === 0 ? 14 * close : 0;
        this.pixel(x, y, base[0] - fleck, base[1] - fleck, base[2] - fleck * .6);
      }
    }
  }

  draw(): void {
    const s = this.game();
    // Underground the walls are the rock around; on the surface there is nothing to cast against.
    const cave = s.z < 0;
    const seen = creaturesInSight(s);
    const weapon = weaponOf(s);
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
      const idle = `${s.z},${s.player.x},${s.player.y},${facing.x},${facing.y}`;
      if (idle === this.idle) return;
      this.idle = idle;
      this.angle = Math.atan2(facing.y, facing.x);
      this.canvas.setAttribute("aria-label", tr("시야"));
    } else {
      this.idle = "";
    }
    const now = performance.now();
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
      const ground = BIOMES[biomeAt(s.player.x, s.player.y, s.seed)].ground;
      const near: [number, number, number] = [1, 3, 5].map((i) => parseInt(ground.slice(i, i + 2), 16)) as [number, number, number];
      this.paintOpen(px, py, dx, dy, near);
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
        const hash = (Math.imul(mx, 73856093) ^ Math.imul(my, 19349663) ^ Math.imul(u >> 1, 83492791) ^ Math.imul(v >> 1, 2654435761)) >>> 0;
        const seam = v % 8 === 0 || (u + ((v >> 3) % 2) * 8) % 16 === 0;
        const tone = seam ? 30 : 49 + (hash % 4) * 8;
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
          const filled = (x - left) / width <= mob.hp / creatureInfo(mob.kind).hp;
          this.pixel(x, y, filled ? 121 : 29, filled ? 75 : 27, filled ? 68 : 31);
          this.depth[y * W + x] = z;
          this.picks[y * W + x] = mob.id;
        }
        const foot = Math.floor(bottom + 1);
        if (inReach && foot < H && (u < 5 || u > 18)) {
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
    // Dim, small overlay; only a successful hit moves the hand.
    const bob = this.motion.matches ? 0 : Math.round(Math.sin(Math.min(1, (now - this.hit.at) / 240) * Math.PI) * 5);
    const handY = H - 11 - bob;
    this.ctx.fillStyle = "#493e38";
    this.ctx.fillRect(W / 2 + 3, handY, 9, 14);
    this.ctx.fillStyle = "#6b5950";
    this.ctx.fillRect(W / 2 + 2, handY, 7, 5);
    if (weapon.range > 1 || s.gear.weapon) {
      this.ctx.fillStyle = "#555d61";
      this.ctx.fillRect(W / 2 + 5, handY - (weapon.range > 1 ? 18 : 11), 3, weapon.range > 1 ? 21 : 14);
      this.ctx.fillStyle = "#777b78";
      this.ctx.fillRect(W / 2 + 5, handY - (weapon.range > 1 ? 20 : 13), 2, 4);
    }
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
