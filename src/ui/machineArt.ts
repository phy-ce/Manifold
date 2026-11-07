// Shows machine art through the GPU. Each frame is printed once, kept as a texture, and swapped in after that.
import { Application, CanvasSource, Sprite, Texture, Ticker } from "pixi.js";
import { Status } from "../engine/game";
import { ROWS, COLS, artRuns } from "./art";
import { GLYPH, GLYPH_ASPECT } from "./theme";

/** Scene steps in one animation loop. Holds whole cycles of the art's 4-step poses and 10-step smoke. */
const LOOP_STEPS = 20;
const CELL_W = GLYPH.machine * GLYPH_ASPECT;
const CELL_H = GLYPH.machine;
const WIDTH = Math.ceil(COLS * CELL_W);
const HEIGHT = ROWS * CELL_H;
const FONT = `700 ${GLYPH.machine}px "JetBrains Mono", Consolas, monospace`;

export class MachineArt {
  readonly root = document.createElement("div");
  private readonly app = new Application();
  private readonly sprite = new Sprite();
  private readonly frames = new Map<string, Texture>();
  private started = false;
  private ready = false;
  private type = "";
  private wanted: [string, Status, number] | null = null;

  constructor() {
    this.root.className = "art";
    this.root.setAttribute("aria-hidden", "true");
  }

  /** Starts on first use, so screens without a machine pay nothing. */
  private async start(): Promise<void> {
    await document.fonts.load(FONT);
    await this.app.init({
      width: WIDTH,
      height: HEIGHT,
      resolution: devicePixelRatio,
      autoDensity: true,
      backgroundAlpha: 0,
      autoStart: false,
      preference: "webgl",
    });
    // Frames are drawn on demand. Pixi's own timers would otherwise run on every screen.
    this.app.ticker.stop();
    Ticker.system.stop();
    this.sprite.setSize(WIDTH, HEIGHT);
    this.app.stage.addChild(this.sprite);
    this.root.append(this.app.canvas);
    this.ready = true;
    if (this.wanted) this.show(...this.wanted);
  }

  /** Draws one scene. The game's frame counter is folded into a loop so frames can be reused. */
  show(type: string, mode: Status, frame: number): void {
    if (!this.ready) {
      this.wanted = [type, mode, frame];
      if (!this.started) void this.start();
      this.started = true;
      return;
    }
    if (type !== this.type) this.forget(type);
    const step = mode === "run" ? (frame >> 1) % LOOP_STEPS : 0;
    const key = `${mode}|${step}`;
    let texture = this.frames.get(key);
    if (!texture) {
      texture = bake(type, mode, step * 2);
      this.frames.set(key, texture);
    }
    this.sprite.texture = texture;
    this.sprite.setSize(WIDTH, HEIGHT);
    this.app.render();
  }

  /** Only the open machine's frames stay in memory. */
  private forget(type: string): void {
    this.sprite.texture = Texture.EMPTY;
    this.frames.forEach((texture) => texture.destroy(true));
    this.frames.clear();
    this.type = type;
  }
}

function bake(type: string, mode: Status, frame: number): Texture {
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(WIDTH * devicePixelRatio);
  canvas.height = Math.ceil(HEIGHT * devicePixelRatio);
  const ctx = canvas.getContext("2d")!;
  ctx.scale(devicePixelRatio, devicePixelRatio);
  ctx.font = FONT;
  ctx.textBaseline = "top";
  for (const run of artRuns(type, mode, frame)) {
    ctx.fillStyle = run.color;
    ctx.fillText(run.text, run.col * CELL_W, run.row * CELL_H);
  }
  return new Texture({ source: new CanvasSource({ resource: canvas, scaleMode: "nearest" }) });
}
