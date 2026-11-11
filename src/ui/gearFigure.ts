// The player as a figure for the equipment window: an ASCII-style picture made once at a high resolution and kept
// as a PNG (public/art/figure.png, from tools/figure/figure.html), so it can be redrawn and swapped any time.
// The gear slots sit on it where each thing is worn or held.

/** The picture, and the size it is shown at in the window (its own is 640 x 1120, the same shape). */
export const FIGURE_SRC = `${import.meta.env.BASE_URL}art/figure.png`;
export const FIGURE_W = 230;
export const FIGURE_H = 402;

/**
 * Where each slot's centre sits, as fractions of the picture's width and height (figure.html's FIGURE_SLOTS).
 * Seen front on, the player's right hand is on the viewer's left: it reads as the player's own body.
 */
export const SLOT_AT: Record<string, [number, number]> = {
  head: [0.5, 0.1],
  body: [0.5, 0.3],
  waist: [0.5, 0.46],
  legs: [0.5, 0.66],
  feet: [0.5, 0.91],
  right: [0.217, 0.545],
  left: [0.783, 0.545],
  back: [0.84, 0.2],
  // Trinkets beside the shins, one on each side.
  acc1: [0.13, 0.8],
  acc2: [0.87, 0.8],
};
