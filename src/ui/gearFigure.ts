// The player as a small pixel figure, front on, for the equipment window: the gear slots sit on it where each
// thing is worn or held. Drawn once on a tiny canvas and shown scaled up with crisp pixels.

/** The figure's size in pixels; the window shows it FIGURE_SCALE times larger. */
export const FIGURE_W = 32;
export const FIGURE_H = 56;
export const FIGURE_SCALE = 4;

/**
 * Where each slot's centre sits on the figure, in figure pixels. Seen front on, the player's right hand is on the
 * viewer's left, as in a mirror turned round: it reads as the player's own body.
 */
export const SLOT_AT: Record<string, [number, number]> = {
  right: [3, 33],
  left: [29, 33],
  back: [27, 14],
  feet: [16, 53],
};

const SKIN = ["#e0b08a", "#c9966f", "#a8785a"];
const HAIR = ["#5a4030", "#3a2a1e"];
const HIDE = ["#a07c54", "#8a6a48", "#6e5236"];
const BELT = "#4a3828";
const LEGS = ["#6a5a48", "#5a4a3a", "#463a2e"];
const SHOE = ["#4a3a2c", "#2e241c"];
const EYE = "#241a14";

/** Draws the figure on a fresh canvas the size of FIGURE_W x FIGURE_H. */
export function drawFigure(): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = FIGURE_W;
  canvas.height = FIGURE_H;
  const g = canvas.getContext("2d")!;
  const r = (color: string, x: number, y: number, w: number, h: number) => {
    g.fillStyle = color;
    g.fillRect(x, y, w, h);
  };
  // Head: lit from the upper left, hair on top and at the sides, two eyes.
  r(SKIN[1], 12, 4, 8, 9);
  r(SKIN[0], 12, 5, 3, 6);
  r(SKIN[2], 19, 5, 1, 8);
  r(HAIR[0], 11, 2, 10, 3);
  r(HAIR[1], 11, 4, 1, 5);
  r(HAIR[1], 20, 4, 1, 4);
  r(HAIR[0], 13, 1, 6, 1);
  r(EYE, 14, 8, 1, 1);
  r(EYE, 17, 8, 1, 1);
  r(SKIN[2], 15, 11, 2, 1);
  // Neck.
  r(SKIN[2], 14, 13, 4, 2);
  // Hide tunic: shoulders, body, a ragged hem, a belt.
  r(HIDE[1], 9, 15, 14, 16);
  r(HIDE[0], 9, 15, 5, 14);
  r(HIDE[2], 21, 15, 2, 16);
  r(HIDE[2], 9, 15, 14, 1);
  for (let x = 9; x < 23; x += 2) r(HIDE[2], x, 31, 1, 1);
  r(BELT, 9, 26, 14, 2);
  r("#8a7050", 15, 26, 2, 2);
  // Arms down at the sides, sleeves to the elbow, bare forearms, fists at the hands' slots.
  r(HIDE[1], 6, 16, 3, 8);
  r(HIDE[1], 23, 16, 3, 8);
  r(HIDE[0], 6, 16, 1, 8);
  r(HIDE[2], 25, 16, 1, 8);
  r(SKIN[1], 6, 24, 3, 6);
  r(SKIN[1], 23, 24, 3, 6);
  r(SKIN[0], 6, 24, 1, 6);
  r(SKIN[2], 25, 24, 1, 6);
  r(SKIN[1], 5, 30, 4, 3);
  r(SKIN[1], 23, 30, 4, 3);
  r(SKIN[2], 5, 32, 4, 1);
  r(SKIN[2], 23, 32, 4, 1);
  // Legs apart, trousers, shoes.
  r(LEGS[1], 11, 32, 4, 16);
  r(LEGS[1], 17, 32, 4, 16);
  r(LEGS[0], 11, 32, 1, 16);
  r(LEGS[2], 14, 32, 1, 16);
  r(LEGS[2], 20, 32, 1, 16);
  r(SHOE[0], 10, 48, 5, 3);
  r(SHOE[0], 17, 48, 5, 3);
  r(SHOE[1], 10, 50, 5, 1);
  r(SHOE[1], 17, 50, 5, 1);
  return canvas;
}
