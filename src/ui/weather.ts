// Weather: blown sand in the desert, falling snow on the snowfield, as faint characters over the whole screen,
// panels and the map included (keepClear can still leave a box clear). Under the panels it
// could hardly be seen. Only on the surface map, never underground or on the base board. The player can never
// touch it: no pointer, no selection, no drag.
// One canvas, its own loop at 20 frames a second, stopped while the tab is hidden; none at all with reduced motion.

/** One kind of weather. Speeds in units (8px) a second; counts are for a 1920×1080 screen and scale with area. */
interface Kind {
  glyphs: string[];
  color: string;
  count: number;
  alpha: [number, number];
  /** Sideways and downward drift, each a range in units a second. */
  dx: [number, number];
  dy: [number, number];
}
const KINDS: Record<string, Kind> = {
  desert: { glyphs: [".", ":", "'"], color: "#c9aa73", count: 70, alpha: [0.18, 0.35], dx: [2, 4], dy: [-0.5, 0.5] },
  snow: { glyphs: [".", "*", "+"], color: "#c9d8e5", count: 50, alpha: [0.25, 0.5], dx: [-0.5, 0.5], dy: [1, 2] },
};
const UNIT = 8;
const FRAME_MS = 50;
/** Matches the landscape's cross-fade (.scenery img in style.css). */
const FADE_MS = 2200;

interface Mote { x: number; y: number; vx: number; vy: number; a: number; ch: string }
/** A kind of weather on screen, with how strongly it shows (0..1) and which way that is going. */
interface Front { kind: string; motes: Mote[]; level: number; target: number }

export class Weather {
  readonly canvas = document.createElement("canvas");
  private readonly ctx = this.canvas.getContext("2d")!;
  private fronts: Front[] = [];
  private want: string | null = null;
  private timer = 0;
  private last = 0;
  private readonly still = matchMedia("(prefers-reduced-motion: reduce)").matches;

  /** keepClear: the box nothing is drawn over (the map), or null. */
  constructor(private readonly keepClear: () => DOMRect | null) {
    this.canvas.className = "weather";
    this.canvas.setAttribute("aria-hidden", "true");
    this.canvas.draggable = false;
    addEventListener("resize", () => this.size());
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) this.stop();
      else this.run();
    });
    this.size();
  }

  /** The biome to show weather for, or null (underground, on the board, or a biome without weather). */
  show(biome: string | null): void {
    const want = !this.still && biome && KINDS[biome] ? biome : null;
    if (want === this.want) return;
    this.want = want;
    for (const f of this.fronts) f.target = f.kind === want ? 1 : 0;
    if (want && !this.fronts.some((f) => f.kind === want)) this.fronts.push({ kind: want, motes: this.spawn(want), level: 0, target: 1 });
    this.run();
  }

  /** Hides it at once, with no fade: going underground or onto the board leaves no trace behind. */
  clear(): void {
    if (!this.want && !this.fronts.length) return;
    this.want = null;
    this.fronts = [];
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.stop();
  }

  private size(): void {
    const scale = Math.min(1.5, devicePixelRatio || 1);
    this.canvas.width = Math.round(innerWidth * scale);
    this.canvas.height = Math.round(innerHeight * scale);
    this.ctx.setTransform(scale, 0, 0, scale, 0, 0);
    this.ctx.font = "12px GalmuriMono11, monospace";
    this.ctx.textBaseline = "middle";
  }

  private spawn(kind: string): Mote[] {
    const k = KINDS[kind];
    const n = Math.round(k.count * Math.min(1, (innerWidth * innerHeight) / (1920 * 1080)));
    const pick = ([a, b]: [number, number]) => a + Math.random() * (b - a);
    return Array.from({ length: n }, () => ({
      x: Math.random() * innerWidth, y: Math.random() * innerHeight,
      vx: pick(k.dx) * UNIT, vy: pick(k.dy) * UNIT, a: pick(k.alpha),
      ch: k.glyphs[Math.floor(Math.random() * k.glyphs.length)],
    }));
  }

  private run(): void {
    if (this.timer || document.hidden || !this.fronts.length) return;
    this.last = performance.now();
    this.timer = window.setInterval(() => this.frame(), FRAME_MS);
  }

  private stop(): void {
    clearInterval(this.timer);
    this.timer = 0;
  }

  private frame(): void {
    const now = performance.now();
    const dt = Math.min(0.2, (now - this.last) / 1000);
    this.last = now;
    const g = this.ctx;
    const [w, h] = [innerWidth, innerHeight];
    g.clearRect(0, 0, w, h);
    // Everything but the map.
    const clear = this.keepClear();
    g.save();
    if (clear && clear.width) {
      g.beginPath();
      g.rect(0, 0, w, h);
      g.rect(clear.left, clear.top, clear.width, clear.height);
      g.clip("evenodd");
    }
    for (const f of this.fronts) {
      // Fade toward the target at the landscape's pace, carrying on from wherever it is.
      const step = (dt * 1000) / FADE_MS;
      f.level = f.target > f.level ? Math.min(f.target, f.level + step) : Math.max(f.target, f.level - step);
      g.fillStyle = KINDS[f.kind].color;
      for (const m of f.motes) {
        m.x = (m.x + m.vx * dt + w) % w;
        m.y = (m.y + m.vy * dt + h) % h;
        g.globalAlpha = m.a * f.level;
        g.fillText(m.ch, Math.round(m.x), Math.round(m.y));
      }
    }
    g.globalAlpha = 1;
    g.restore();
    this.fronts = this.fronts.filter((f) => f.level > 0 || f.target > 0);
    if (!this.fronts.length) this.stop();
  }
}
