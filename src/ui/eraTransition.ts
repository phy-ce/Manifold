// The turn of an age, played once when S0 gives way to S1 during play (never on loading a save). From the steam
// engine, or the middle of the screen, a circle of square blocks spreads until it covers everything; under it the
// screen takes the new age's tones; then the blocks fall away in a dithered order while the title stands in the
// middle: "증기시대". A click skips it; nothing else does, and the click goes no further.
import { tr } from "../i18n";
import { CLICK, keyHintHtml } from "./keyHint";

/** Block and dot size: two units and half a unit (theme.ts), so the picture is on the game's grid. */
const BLOCK = 16;
const DOT = 4;
/** When each part happens, in ms. */
const T = { hold: 160, cover: 1300, titleIn: 1360, reveal: [1700, 2800], titleOut: [2800, 3200], end: 3200 };
const STILL_MS = 1200;
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
/** The cover's colours: the S1 back, and brass dots on the blocks at its edge. */
const COVER = "#10151c";
const BRASS = "#b99862";

export class EraTransition {
  readonly root = document.createElement("div");
  private readonly canvas = document.createElement("canvas");
  private readonly ctx = this.canvas.getContext("2d")!;
  private readonly title = document.createElement("div");
  private start = 0;
  private raf = 0;
  private origin = { x: 0, y: 0 };
  private swapped = false;
  private swap: () => void = () => undefined;
  private done: () => void = () => undefined;
  private readonly still = matchMedia("(prefers-reduced-motion: reduce)").matches;

  constructor() {
    this.root.className = "era-turn";
    this.root.hidden = true;
    this.title.className = "era-title";
    this.title.innerHTML = `<span>${tr("증기시대")}</span><small>${keyHintHtml(CLICK(), tr("건너뛰기"), "off")}</small>`;
    this.root.append(this.canvas, this.title);
    // A click skips; it is taken here so it never reaches the game underneath.
    this.root.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.finish();
    });
  }

  get running(): boolean { return !this.root.hidden; }

  /**
   * Plays it from a point on screen. `swap` turns the screen to the new age (called once, under full cover or at
   * once with reduced motion); `done` runs when it is over or skipped.
   */
  play(origin: { x: number; y: number }, swap: () => void, done: () => void): void {
    this.origin = origin;
    this.swap = swap;
    this.done = done;
    this.swapped = false;
    this.root.hidden = false;
    this.canvas.width = innerWidth;
    this.canvas.height = innerHeight;
    this.start = performance.now();
    if (this.still) {
      this.turn();
      this.title.style.opacity = "1";
      this.raf = window.setTimeout(() => this.finish(), STILL_MS);
      return;
    }
    this.title.style.opacity = "0";
    const tick = () => {
      if (this.draw(performance.now() - this.start)) this.raf = requestAnimationFrame(tick);
      else this.finish();
    };
    this.raf = requestAnimationFrame(tick);
  }

  private turn(): void {
    if (this.swapped) return;
    this.swapped = true;
    this.swap();
  }

  private finish(): void {
    if (!this.running) return;
    cancelAnimationFrame(this.raf);
    clearTimeout(this.raf);
    this.turn();
    this.root.hidden = true;
    this.done();
  }

  /** One frame; false once it is over. */
  private draw(t: number): boolean {
    const g = this.ctx;
    const [w, h] = [this.canvas.width, this.canvas.height];
    g.clearRect(0, 0, w, h);
    const far = Math.hypot(Math.max(this.origin.x, w - this.origin.x), Math.max(this.origin.y, h - this.origin.y)) + BLOCK * 2;
    // How far the circle has spread (0..1, in steps so it moves block by block), and how much of it has fallen away.
    const spread = t < T.hold ? 0.02 : Math.min(1, (t - T.hold) / (T.cover - T.hold));
    const radius = Math.ceil((spread * far) / BLOCK) * BLOCK;
    const gone = t < T.reveal[0] ? 0 : Math.min(1, (t - T.reveal[0]) / (T.reveal[1] - T.reveal[0]));
    if (t >= T.cover) this.turn();
    for (let by = 0; by * BLOCK < h; by += 1) {
      for (let bx = 0; bx * BLOCK < w; bx += 1) {
        const cx = bx * BLOCK + BLOCK / 2;
        const cy = by * BLOCK + BLOCK / 2;
        const d = Math.hypot(cx - this.origin.x, cy - this.origin.y);
        if (d > radius) continue;
        // Blocks fall away in a dithered order, the far ones a little first, so the new screen shows through evenly.
        const order = (BAYER[(by % 4) * 4 + (bx % 4)] + 0.5) / 16 * 0.75 + (1 - d / far) * 0.25;
        if (order < gone) continue;
        g.fillStyle = COVER;
        g.fillRect(bx * BLOCK, by * BLOCK, BLOCK, BLOCK);
        // The rim of the circle, or a block about to go: brass dots on a checker, the dithered edge.
        const rim = radius - d < BLOCK * 1.5 && spread < 1;
        if (rim || order - gone < 0.06) {
          g.fillStyle = BRASS;
          for (let y = 0; y < BLOCK; y += DOT * 2) for (let x = (y / DOT) % 4 ? DOT : 0; x < BLOCK; x += DOT * 2) g.fillRect(bx * BLOCK + x, by * BLOCK + y, DOT / 2, DOT / 2);
        }
      }
    }
    // The title comes in once the screen is covered and goes in steps at the end, like everything else here.
    const shown = t < T.titleIn ? 0 : t < T.titleOut[0] ? 1 : Math.max(0, 1 - (t - T.titleOut[0]) / (T.titleOut[1] - T.titleOut[0]));
    this.title.style.opacity = String(Math.round(shown * 4) / 4);
    return t < T.end;
  }
}
