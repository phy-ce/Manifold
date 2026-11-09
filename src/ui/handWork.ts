// Hand work on screen: the beat lane for rhythm machines, and small sparks drawn as characters.
// Strikes are judged by the time of the input event itself, so a slow frame never moves the beat.
// The beat runs on the game's clock: at 2x it comes twice as fast, and paused it stands still. The judging
// windows stay in real milliseconds, so a faster game is harder but its work is done sooner.

/** How close to a beat a strike must land, in ms either side. */
export const EXACT_MS = 70;
export const GOOD_MS = 150;
/** Work, in seconds, that a strike is worth. Every fifth exact strike in a row adds a little. */
const EXACT_WORK = 1.2;
const GOOD_WORK = 1;
const STREAK = 5;
const STREAK_BONUS = 0.5;
/** Time before the first beat reaches the line, so the player sees it coming. */
const LEAD_MS = 1500;
/** How fast beats slide left, in px per ms, and where the strike line stands. */
const SPEED = 0.2;
const LINE_X = 64;

export type Verdict = "exact" | "good" | "miss";
export interface Strike {
  verdict: Verdict;
  /** Seconds of work the strike is worth. */
  seconds: number;
  /** Exact strikes in a row, this one included. */
  streak: number;
}

const calm = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export class RhythmLane {
  readonly root = document.createElement("div");
  private readonly line = document.createElement("div");
  private readonly notes: HTMLSpanElement[] = [];
  /** Gaps between beats, in ms, repeated. */
  private pattern = [700];
  /** When beat 0 reaches the line, on the performance.now() clock that event timeStamps share. */
  private zero = 0;
  /** Game time in ms as the beat sees it: real time scaled by the game speed, and when it was last read. */
  private clock = 0;
  private clockAt = 0;
  private readonly judged = new Set<number>();
  private streak = 0;
  private raf = 0;

  /** `rate` is the game speed: 0 paused, 1 normal, 2 and 4 faster. */
  constructor(private readonly rate: () => number = () => 1) {
    this.root.className = "lane";
    this.root.setAttribute("aria-hidden", "true");
    this.line.className = "lane-line";
    this.root.append(this.line);
  }

  /** Starts the beat over for a machine, and keeps it moving every frame while shown. */
  start(pattern: number[]): void {
    this.pattern = pattern.length ? pattern : [700];
    this.tickClock(performance.now());
    this.zero = this.clock + LEAD_MS;
    this.judged.clear();
    this.streak = 0;
    if (!this.raf) this.raf = requestAnimationFrame(this.frame);
  }

  stop(): void {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  private get cycle(): number {
    return this.pattern.reduce((sum, gap) => sum + gap, 0);
  }

  /** When beat i reaches the line. */
  private beatAt(i: number): number {
    const whole = Math.floor(i / this.pattern.length);
    let t = this.zero + whole * this.cycle;
    for (let k = 0; k < i - whole * this.pattern.length; k += 1) t += this.pattern[k];
    return t;
  }

  /** The beat nearest a moment, and how far off it is. */
  private nearest(time: number): [number, number] {
    const len = this.pattern.length;
    const from = Math.max(0, (Math.floor((time - this.zero) / this.cycle) - 1) * len);
    let best = -1;
    let off = Infinity;
    for (let i = from; i < from + len * 3; i += 1) {
      const d = Math.abs(time - this.beatAt(i));
      if (d < off) [best, off] = [i, d];
    }
    return [best, off];
  }

  /**
   * Judges a strike made at `time`, which should be the input event's own timeStamp. A beat can be
   * struck once; striking where there is no beat, or one already struck, is a miss.
   */
  judge(time: number): Strike {
    if (!this.rate()) return { verdict: "miss", seconds: 0, streak: this.streak };
    // The strike on the game's clock; how far off it was, back in real ms.
    const [i, gameOff] = this.nearest(this.gameTime(time));
    const off = gameOff / this.rate();
    if (i < 0 || this.judged.has(i) || off > GOOD_MS) {
      this.streak = 0;
      return { verdict: "miss", seconds: 0, streak: 0 };
    }
    this.judged.add(i);
    for (const old of this.judged) if (old < i - 8) this.judged.delete(old);
    const exact = off <= EXACT_MS;
    this.streak = exact ? this.streak + 1 : 0;
    const bonus = exact && this.streak % STREAK === 0 ? STREAK_BONUS : 0;
    this.line.classList.add("lit");
    setTimeout(() => this.line.classList.remove("lit"), 90);
    return { verdict: exact ? "exact" : "good", seconds: (exact ? EXACT_WORK : GOOD_WORK) + bonus, streak: this.streak };
  }

  /** Moves the game clock up to a real moment. */
  private tickClock(real: number): void {
    if (this.clockAt) this.clock += (real - this.clockAt) * this.rate();
    this.clockAt = real;
  }

  /** A real moment, such as an input event's timeStamp, on the game clock. */
  private gameTime(real: number): number {
    return this.clock + (real - this.clockAt) * this.rate();
  }

  private readonly frame = (real: number): void => {
    this.tickClock(real);
    const now = this.clock;
    this.raf = requestAnimationFrame(this.frame);
    if (!this.root.isConnected || this.root.hidden) return;
    const width = this.root.clientWidth;
    const [first] = this.nearest(now - LINE_X / SPEED);
    let shown = 0;
    for (let i = Math.max(0, first - 2); i < first + 64; i += 1) {
      const x = LINE_X + (this.beatAt(i) - now) * SPEED;
      if (x > width + 16) break;
      if (x < -16) continue;
      let note = this.notes[shown];
      if (!note) {
        note = document.createElement("span");
        this.root.append(note);
        this.notes.push(note);
      }
      const struck = this.judged.has(i);
      note.className = `lane-beat ${struck ? "done" : this.beatAt(i) < now - GOOD_MS * Math.max(1, this.rate()) ? "missed" : ""}`;
      note.textContent = struck ? "·" : "▼";
      note.style.transform = `translateX(${Math.round(x)}px)`;
      note.hidden = false;
      shown += 1;
    }
    for (let k = shown; k < this.notes.length; k += 1) this.notes[k].hidden = true;
  };
}

/** Sparks as characters, flying out of a point over the machine art and fading. */
export function sparks(layer: HTMLElement, x: number, y: number, color: string, count: number, spread: number, chars = "*·+"): void {
  if (calm()) return;
  for (let i = 0; i < count; i += 1) {
    const spark = document.createElement("span");
    spark.className = "spark";
    spark.textContent = chars[Math.floor(Math.random() * chars.length)];
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.3;
    const reach = spread * (0.4 + Math.random() * 0.7);
    spark.style.left = `${x}px`;
    spark.style.top = `${y}px`;
    spark.style.color = color;
    spark.style.setProperty("--dx", `${Math.round(Math.cos(angle) * reach)}px`);
    spark.style.setProperty("--dy", `${Math.round(Math.sin(angle) * reach + 8)}px`);
    layer.append(spark);
    setTimeout(() => spark.remove(), 400);
  }
}

/** Restarts a one-shot CSS animation class on an element. */
export function replay(el: HTMLElement, cls: string): void {
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
}
