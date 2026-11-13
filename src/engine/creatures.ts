// Creatures: the cave's beasts, the snowfield's yeti and the deer of the plains, how they move, and fighting them.
import { YETI, DEER, CAVES, STAGES } from "../content";
import { AROUND, CELL_ASPECT, CHUNK, HABITAT, Point, ROCK, hash, nearEntrance, rngFrom, chunkOf, safePath, terrain, biomeAt, underCell } from "./world";
import { STEP_MS, GameState, Mob, Corpse } from "./state";
import { rockAt } from "./under";
import { chosenGather } from "./gather";
import { heldTools, wearTool } from "./inventory";
import { isVisible, isWeak, hurt } from "./game";

const MOBS = CAVES.creatures;
const SHOT_LIFE = 30;
export const steps8 = (a: Point, b: Point) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

/** Whether nothing but open underground lies between two cells. */
export function clearLine(seed: number, a: Point, b: Point): boolean {
  const n = steps8(a, b);
  for (let i = 1; i < n; i += 1) {
    const x = Math.round(a.x + ((b.x - a.x) * i) / n);
    const y = Math.round(a.y + ((b.y - a.y) * i) / n);
    if (underCell(x, y, seed) === ROCK) return false;
  }
  return true;
}

/** Whether a cell lies in the chunks around the player (three by three): only there does underground life go on. */
export const nearPlayer = (s: GameState, at: Point): boolean =>
  Math.abs(chunkOf(at.x) - chunkOf(s.player.x)) <= 1 && Math.abs(chunkOf(at.y) - chunkOf(s.player.y)) <= 1;

/** Den cells in the chunks around the player. */
function densAround(s: GameState): Point[] {
  const dens: Point[] = [];
  const cx = chunkOf(s.player.x);
  const cy = chunkOf(s.player.y);
  for (let y = (cy - 1) * CHUNK; y < (cy + 2) * CHUNK; y += 1) {
    for (let x = (cx - 1) * CHUNK; x < (cx + 2) * CHUNK; x += 1) if (underCell(x, y, s.seed) === HABITAT) dens.push({ x, y });
  }
  return dens;
}

/** Whether a cell is near enough a stair to be safe ground: creatures never come out or step there. */
const byStair = (s: GameState, at: Point, reach: number): boolean => nearEntrance(s.seed, at.x, at.y, reach);

/** Dens a creature may come out of now: far enough off, out of the player's sight, away from the stairs, and free. */
function openDens(s: GameState): Point[] {
  const rule = MOBS.spawn;
  return densAround(s).filter((at) =>
    steps8(at, s.player) >= rule.minAway && !byStair(s, at, MOBS.safeRadius + 4) &&
    !(steps8(at, s.player) <= MOBS.sight && clearLine(s.seed, at, s.player)) &&
    !s.mobs.some((m) => m.x === at.x && m.y === at.y));
}

/** A creature's name and full health, by kind. */
export function creatureInfo(kind: Mob["kind"]): { name: string; hp: number } {
  return kind === "yeti" ? YETI : kind === "deer" ? DEER : MOBS[kind];
}

/** Whether a creature is a beast to hunt, never a danger: it doesn't stop F working the ground until it is in reach. */
export const isPrey = (mob: Mob): boolean => mob.kind === "deer";

/**
 * Whether the player can see or hear a creature: near enough, with open cave between. The surface is open
 * ground with nothing to hide behind, so there it is only a matter of distance.
 */
export function mobVisible(s: GameState, mob: Mob): boolean {
  if (mob.kind === "yeti") return s.z === 0 && steps8(mob, s.player) <= YETI.sight;
  if (mob.kind === "deer") return s.z === 0 && steps8(mob, s.player) <= DEER.sight;
  return s.z < 0 && steps8(mob, s.player) <= MOBS.sight && clearLine(s.seed, mob, s.player);
}

/** A few creatures come out of the dens around the player as they come down, out of sight and never by a stair. */
export function spawnMobs(s: GameState): void {
  const rng = rngFrom(Math.imul(s.seed + 3, 2654435761) ^ Math.imul(s.player.x + 101, 40503) ^ Math.imul(s.player.y + 7, 19349663) ^ Math.floor(s.time / 1000));
  s.mobs = [];
  s.shots = [];
  const dens = openDens(s);
  const [fewest, most] = MOBS.count;
  const count = fewest + Math.floor(rng() * (most - fewest + 1));
  for (let i = 0; i < count && dens.length; i += 1) {
    const [at] = dens.splice(Math.floor(rng() * dens.length), 1);
    const kind = rng() < MOBS.rangedShare ? "ranged" : "melee";
    s.mobs.push({ id: i, kind, ...at, wait: 0, cool: 1000, hp: MOBS[kind].hp });
  }
}

/**
 * While the player stays in, creatures keep coming out, always somewhere out of sight and well away. Every
 * so often a den is tried: likelier the longer the player has been in, and likelier still just after a noise,
 * when the den nearest the noise is picked. Never more than a few at once; those left far behind are forgotten.
 */
function comeOut(s: GameState): void {
  const rule = MOBS.spawn;
  s.mobs = s.mobs.filter((m) => steps8(m, s.player) <= rule.forgetAway);
  if (s.time % rule.everyMs !== 0 || s.mobs.length >= rule.cap) return;
  const rng = rngFrom(Math.imul(s.seed + 7, 2654435761) ^ Math.floor(s.time / 100));
  const minutes = (s.time - (s.caveSince ?? s.time)) / 60000;
  const noisy = !!s.noise && s.time - s.noise.at <= rule.noiseMs;
  const chance = Math.min(rule.most, rule.chance + rule.perMinute * minutes + (noisy ? rule.noiseBonus : 0));
  if (rng() >= chance) return;
  const dens = openDens(s);
  if (!dens.length) return;
  const at = noisy
    ? dens.sort((a, b) => steps8(a, s.noise!) - steps8(b, s.noise!))[0]
    : dens[Math.floor(rng() * dens.length)];
  const kind = rng() < MOBS.rangedShare ? "ranged" : "melee";
  const id = s.mobs.reduce((top, m) => Math.max(top, m.id), -1) + 1;
  // It stops in its den mouth for a moment before setting off.
  s.mobs.push({ id, kind, ...at, wait: 1000, cool: 1000, hp: MOBS[kind].hp });
}

/** A cell a creature may step onto: open, free, and outside the safe ground round a stair. */
function mobCanStand(s: GameState, mob: Mob, x: number, y: number): boolean {
  if (rockAt(s, x, y) || byStair(s, { x, y }, MOBS.safeRadius)) return false;
  if (x === s.player.x && y === s.player.y) return false;
  return !s.mobs.some((other) => other !== mob && other.x === x && other.y === y);
}

function mobStep(s: GameState, mob: Mob, way: "toward" | "away" | "wander"): void {
  let next: Point | undefined;
  if (way === "toward") {
    // The first step of the way round the rock to the player.
    next = safePath(mob, s.player, () => 0, (x, y) => rockAt(s, x, y))[0];
  } else if (way === "away") {
    const dx = s.player.x - mob.x;
    const dy = s.player.y - mob.y;
    next = { x: mob.x - Math.sign(dx), y: mob.y - Math.sign(dy) };
  }
  if (!next || !mobCanStand(s, mob, next.x, next.y)) {
    // Blocked or idle: shuffle to a neighbouring cell.
    const r = hash(mob.id * 31 + mob.x, mob.y, Math.floor(s.time / 100));
    const [dx, dy] = [[1, 0], [-1, 0], [0, 1], [0, -1]][Math.floor(r * 4)];
    next = { x: mob.x + dx, y: mob.y + dy };
    if (!mobCanStand(s, mob, next.x, next.y)) return;
  }
  mob.x = next.x;
  mob.y = next.y;
}

/** Bare hands, when no weapon is worn: weak, but never nothing. */
export const FISTS = { damage: 1, range: 1, cooldown: 900 };
/** A creature struck reels and holds still this long before it can move again. */
const STAGGER_MS = 300;

/** What the player fights with: whichever tool in hand strikes hardest, or bare fists. */
export function weaponOf(s: GameState): { damage: number; range: number; cooldown: number; hand?: string } {
  const best = heldTools(s).sort((a, b) => b.stats.damage - a.stats.damage || b.stats.range - a.stats.range)[0];
  return best ? { damage: best.stats.damage, range: best.stats.range, cooldown: best.stats.cooldown, hand: best.hand } : FISTS;
}

/** Whether the player's next blow is ready. */
export const canStrike = (s: GameState): boolean => s.time >= (s.strikeReady ?? 0);

/**
 * Strikes a creature within the weapon's reach. A blow takes its damage (half while weak), staggers the
 * creature, and the weapon needs its cooldown before the next. At no health the creature dies.
 */
export function attack(s: GameState, mobId: number): boolean {
  const mob = s.mobs.find((m) => m.id === mobId);
  const weapon = weaponOf(s);
  if (!mob || !canStrike(s) || steps8(mob, s.player) > weapon.range || !mobVisible(s, mob)) return false;
  s.strikeReady = s.time + weapon.cooldown;
  if (weapon.hand) wearTool(s, weapon.hand);
  // No weapon of the early age wounds a yeti: the blow only makes it reel.
  if (mob.kind !== "yeti" || !YETI.immune) mob.hp -= isWeak(s) ? Math.max(1, Math.floor(weapon.damage / 2)) : weapon.damage;
  mob.wait = Math.max(mob.wait, STAGGER_MS);
  if (mob.hp <= 0) {
    s.mobs = s.mobs.filter((m) => m !== mob);
    leaveCorpse(s, mob);
  }
  return true;
}

/** Strikes the nearest creature in reach, if there is one. */
export function attackNearest(s: GameState): boolean {
  const reach = weaponOf(s).range;
  const target = s.mobs.filter((m) => steps8(m, s.player) <= reach && mobVisible(s, m)).sort((a, b) => steps8(a, s.player) - steps8(b, s.player))[0];
  return !!target && attack(s, target.id);
}

/**
 * One step of underground life: creatures move, bite and shoot, and spines fly. Only creatures in the chunks
 * around the player act; any further off hold still until the player comes near or they are forgotten.
 */
export function creatures(s: GameState): void {
  comeOut(s);
  for (const mob of s.mobs) {
    if (!nearPlayer(s, mob)) continue;
    mob.wait = Math.max(0, mob.wait - STEP_MS);
    mob.cool = Math.max(0, mob.cool - STEP_MS);
    // They smell the player round corners within hunting range; shooting needs a clear line.
    const aware = mobVisible(s, mob);
    const near = steps8(mob, s.player);
    const hunting = near <= MOBS.hunt;
    if (mob.kind === "melee") {
      if (near <= 1 && mob.cool <= 0) {
        mob.cool = MOBS.melee.attackMs;
        hurt(s, MOBS.melee.damage, "melee");
        if (s.z === 0) return;
        continue;
      }
      if (mob.wait > 0 || near <= 1) continue;
      mob.wait = MOBS.melee.moveMs;
      mobStep(s, mob, hunting ? "toward" : "wander");
    } else {
      const { range, keep, fireMs, shotSpeed, moveMs } = MOBS.ranged;
      if (aware && near <= range && mob.cool <= 0) {
        mob.cool = fireMs;
        const dx = s.player.x - mob.x;
        const dy = s.player.y - mob.y;
        const len = Math.hypot(dx, dy) || 1;
        s.shots.push({ x: mob.x, y: mob.y, vx: (dx / len) * shotSpeed, vy: (dy / len) * shotSpeed, life: SHOT_LIFE });
      }
      if (mob.wait > 0) continue;
      mob.wait = moveMs;
      // Close in until in range with a clear shot, then hold off at a distance.
      if (hunting && (!aware || near > keep[1])) mobStep(s, mob, "toward");
      else if (aware && near < keep[0]) mobStep(s, mob, "away");
      else if (!hunting) mobStep(s, mob, "wander");
    }
  }
  // Spines fly straight until they hit rock or the player, or run out.
  s.shots = s.shots.filter((shot) => {
    shot.x += shot.vx;
    shot.y += shot.vy;
    shot.life -= 1;
    const x = Math.round(shot.x);
    const y = Math.round(shot.y);
    if (shot.life <= 0 || rockAt(s, x, y)) return false;
    if (x === s.player.x && y === s.player.y && s.z < 0) {
      hurt(s, MOBS.ranged.damage, "ranged");
      return false;
    }
    return true;
  });
}

// ---- The snowfield's yeti

/** The last stage at which yetis are still believed in, found by its id so new stages don't shift it. */
const YETI_LAST = STAGES.findIndex((m) => m.id === YETI.lastStage);
/** Perceptions change with the ages: once past the early age, the yeti is no longer seen. */
export const yetiBelieved = (s: GameState): boolean => s.stage <= YETI_LAST;
const inYetiLand = (s: GameState, at: Point): boolean => biomeAt(at.x, at.y, s.seed) === YETI.biome;

function yetiCanStand(s: GameState, mob: Mob, x: number, y: number): boolean {
  if (x === s.player.x && y === s.player.y) return false;
  return inYetiLand(s, { x, y }) && !s.mobs.some((other) => other !== mob && other.x === x && other.y === y);
}

/** Now and then, while the player is in the snow, one comes out somewhere a fair way off and out of sight. */
function yetiComesOut(s: GameState): void {
  if (s.time % YETI.everyMs !== 0 || s.mobs.some(isYeti) || !inYetiLand(s, s.player)) return;
  const rng = rngFrom(Math.imul(s.seed + 13, 2654435761) ^ Math.floor(s.time / 100));
  if (rng() >= YETI.chance) return;
  const [near, far] = YETI.away;
  // A handful of tries around the player is enough; it is no matter if none fits this time.
  for (let tries = 0; tries < 60; tries += 1) {
    const angle = rng() * Math.PI * 2;
    const reach = near + rng() * (far - near);
    const at = { x: Math.round(s.player.x + Math.cos(angle) * reach), y: Math.round(s.player.y + Math.sin(angle) * reach) };
    const d = steps8(at, s.player);
    if (d < Math.max(near, YETI.sight + 1) || d > far || isVisible(s, at.x, at.y) || !inYetiLand(s, at)) continue;
    s.mobs.push({ id: newMobId(s), kind: "yeti", ...at, wait: 1000, cool: 1000, hp: YETI.hp });
    return;
  }
}

/** One step toward the player, or a shuffle, never off the snow. Next to the edge it just stands. */
function yetiStep(s: GameState, mob: Mob, chase: boolean): void {
  if (chase) {
    const span = (p: Point) => Math.hypot(p.x - s.player.x, p.y - s.player.y);
    const best = AROUND.map(([dx, dy]) => ({ x: mob.x + dx, y: mob.y + dy }))
      .filter((p) => yetiCanStand(s, mob, p.x, p.y))
      .sort((a, b) => span(a) - span(b))[0];
    if (best && span(best) < span(mob)) {
      mob.x = best.x;
      mob.y = best.y;
    }
    return;
  }
  const r = hash(mob.id * 31 + mob.x, mob.y, Math.floor(s.time / 100));
  const [dx, dy] = [[1, 0], [-1, 0], [0, 1], [0, -1]][Math.floor(r * 4)];
  if (yetiCanStand(s, mob, mob.x + dx, mob.y + dy)) {
    mob.x += dx;
    mob.y += dy;
  }
}

/**
 * Surface life: the yeti roams its snowfield, hunts the player once it notices them, and strikes at a player
 * in the snow beside it. It never leaves the snow, so getting out of it is the way to escape: with the player
 * out of the snow or far off long enough, it gives up and is gone.
 */
function yetis(s: GameState): void {
  if (!yetiBelieved(s)) {
    if (s.mobs.some(isYeti)) s.mobs = s.mobs.filter((m) => !isYeti(m));
    return;
  }
  yetiComesOut(s);
  if (!s.mobs.some(isYeti)) return;
  const home = inYetiLand(s, s.player);
  for (const mob of s.mobs.filter(isYeti)) {
    mob.wait = Math.max(0, mob.wait - STEP_MS);
    mob.cool = Math.max(0, mob.cool - STEP_MS);
    const near = steps8(mob, s.player);
    if (home && near <= YETI.sight) mob.hunting = true;
    mob.lost = home && near <= YETI.forgetAway ? 0 : (mob.lost ?? 0) + STEP_MS;
    if (home && near <= 1 && mob.cool <= 0) {
      mob.cool = YETI.attackMs;
      hurt(s, YETI.damage, "yeti");
      // A collapse sends the player home and clears the surface.
      if (!s.mobs.includes(mob)) return;
      continue;
    }
    if (mob.wait > 0 || near <= 1) continue;
    mob.wait = YETI.moveMs;
    yetiStep(s, mob, !!mob.hunting);
  }
  s.mobs = s.mobs.filter((m) => !isYeti(m) || (m.lost ?? 0) < YETI.giveUpMs);
}

const isYeti = (mob: Mob): boolean => mob.kind === "yeti";
export const isDeer = (mob: Mob): boolean => mob.kind === "deer";
/** A number no creature on this layer has yet. */
export const newMobId = (s: GameState): number => s.mobs.reduce((top, m) => Math.max(top, m.id), -1) + 1;

// ---- Deer of the plains and forests

const inDeerLand = (s: GameState, at: Point): boolean => DEER.biomes.includes(biomeAt(at.x, at.y, s.seed));

/** Open ground of its own biomes, not water nor a hill, with nothing else on it. */
export function deerCanStand(s: GameState, mob: Mob | null, x: number, y: number): boolean {
  if (x === s.player.x && y === s.player.y) return false;
  const [, kind] = terrain(x, y, s.seed);
  return inDeerLand(s, { x, y }) && kind !== "t-water" && kind !== "t-hill" && !s.mobs.some((other) => other !== mob && other.x === x && other.y === y);
}

/** Now and then, in the plains and forests, a deer turns up a fair way off and out of sight. */
function deerComeOut(s: GameState): void {
  if (s.time % DEER.everyMs !== 0 || s.mobs.filter(isDeer).length >= DEER.cap || !inDeerLand(s, s.player)) return;
  const rng = rngFrom(Math.imul(s.seed + 17, 2654435761) ^ Math.floor(s.time / 100));
  if (rng() >= DEER.chance) return;
  const [near, far] = DEER.away;
  for (let tries = 0; tries < 60; tries += 1) {
    const angle = rng() * Math.PI * 2;
    const reach = near + rng() * (far - near);
    const at = { x: Math.round(s.player.x + Math.cos(angle) * reach), y: Math.round(s.player.y + (Math.sin(angle) * reach) / CELL_ASPECT) };
    const d = steps8(at, s.player);
    if (d < near || d > far || isVisible(s, at.x, at.y) || !deerCanStand(s, null, at.x, at.y)) continue;
    s.mobs.push({ id: newMobId(s), kind: "deer", ...at, wait: 1000, cool: 0, hp: DEER.hp });
    return;
  }
}

/** A deer grazes about, and runs from a player who comes close: always to the open cell furthest from them. */
function deer(s: GameState): void {
  deerComeOut(s);
  s.mobs = s.mobs.filter((m) => !isDeer(m) || steps8(m, s.player) <= DEER.forgetAway);
  for (const mob of s.mobs.filter(isDeer)) {
    mob.wait = Math.max(0, mob.wait - STEP_MS);
    if (mob.wait > 0) continue;
    const fleeing = steps8(mob, s.player) <= DEER.flee;
    mob.wait = fleeing ? DEER.fleeMs : DEER.moveMs;
    const options = AROUND.map(([dx, dy]) => ({ x: mob.x + dx, y: mob.y + dy })).filter((p) => deerCanStand(s, mob, p.x, p.y));
    if (!options.length) continue;
    let to: Point | undefined;
    if (fleeing) {
      const span = (p: Point) => Math.hypot(p.x - s.player.x, (p.y - s.player.y) * CELL_ASPECT);
      to = options.sort((a, b) => span(b) - span(a))[0];
      if (span(to) <= span(mob)) to = undefined; // cornered: it stands
    } else if (hash(mob.id * 17 + mob.x, mob.y, Math.floor(s.time / 100)) < 0.5) {
      to = options[Math.floor(hash(mob.id, mob.x + mob.y, Math.floor(s.time / 100) + 1) * options.length)];
    }
    if (to) {
      mob.x = to.x;
      mob.y = to.y;
    }
  }
}

/** Surface life: the yeti in its snowfield, and deer in the plains and forests. */
export function surfaceLife(s: GameState): void {
  yetis(s);
  deer(s);
}

/** A killed beast that has anything to give stays where it fell. Several can lie on one cell. */
function leaveCorpse(s: GameState, mob: Mob): void {
  if (!isDeer(mob)) return;
  const corpses = (s.corpses ??= []);
  const id = corpses.reduce((top, c) => Math.max(top, c.id), 0) + 1;
  corpses.push({ id, kind: mob.kind, x: mob.x, y: mob.y, z: s.z, left: DEER.butcher.cuts });
}

/** The corpses lying under the player, oldest first. */
export const corpsesHere = (s: GameState): Corpse[] =>
  (s.corpses ?? []).filter((c) => c.x === s.player.x && c.y === s.player.y && c.z === s.z);

/** The live creatures the player can see now, nearest first. */
export function creaturesInSight(s: GameState): Mob[] {
  return s.mobs.filter((m) => m.hp > 0 && mobVisible(s, m) && isVisible(s, m.x, m.y))
    .sort((a, b) => steps8(a, s.player) - steps8(b, s.player) || a.id - b.id);
}

/**
 * What F is for right now, the one place this is decided: with a creature in sight F only fights, and working
 * the ground waits; otherwise it works the place underfoot. C closes in on a creature, so F never walks.
 */
export function actionKey(s: GameState): "fight" | "work" | "none" {
  // A deer is no danger: grazing nearby, it leaves F to the ground underfoot until it is within a blow.
  const reach = weaponOf(s).range;
  if (creaturesInSight(s).some((m) => !isPrey(m) || steps8(m, s.player) <= reach)) return "fight";
  // Several things underfoot and none picked yet: F waits for the pick.
  return chosenGather(s) ? "work" : "none";
}
