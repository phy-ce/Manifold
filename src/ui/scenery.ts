// The backdrop: the biome the player stands in, as a landscape in coloured ASCII behind the whole screen.
// The pictures are made ahead of time (tools/scenery/build.mjs) and shipped in public/scenery, so the
// game only shows them (WebP). Walking into another biome, the old picture fades out under the new one; underground
// there is none. The player can never touch it: no pointer, no selection, no drag.

/** Biomes with a picture of their own. */
const PICTURES = new Set(["plains", "forest", "desert", "snow", "marsh", "mountain"]);

export class Scenery {
  readonly root = document.createElement("div");
  private readonly layers: [HTMLImageElement, HTMLImageElement];
  private front = 0;
  private shown: string | null = null;

  constructor() {
    this.root.className = "scenery";
    this.root.setAttribute("aria-hidden", "true");
    const layer = () => {
      const img = document.createElement("img");
      img.alt = "";
      img.draggable = false;
      img.decoding = "async";
      this.root.append(img);
      return img;
    };
    this.layers = [layer(), layer()];
  }

  /** Shows a biome's picture, or none (underground). Changing it fades the new one in over the old. */
  show(biome: string | null): void {
    const want = biome && PICTURES.has(biome) ? biome : null;
    if (want === this.shown) return;
    this.shown = want;
    const leaving = this.layers[this.front];
    this.front = 1 - this.front;
    const coming = this.layers[this.front];
    leaving.classList.remove("on");
    if (!want) return;
    coming.src = `${import.meta.env.BASE_URL}scenery/${want}.webp`;
    // Fade in once loaded, so a slow load never flashes an empty frame.
    if (coming.complete && coming.naturalWidth) coming.classList.add("on");
    else coming.onload = () => { if (this.shown === want) coming.classList.add("on"); };
  }
}
