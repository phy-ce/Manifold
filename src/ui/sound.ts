// Small sounds made on the spot: dull knocks and thuds, never beeps, quiet by default.
// Whether sound is on is a browser setting, kept out of the save.

const KEY = "modpack-simulator-sound";
/** Everything plays at this fraction of full loudness. */
const VOLUME = 0.3;

function stored(): boolean {
  try {
    return localStorage.getItem(KEY) !== "off";
  } catch {
    return true;
  }
}

let on = stored();
let audio: AudioContext | null = null;

export const soundOn = (): boolean => on;

export function setSound(value: boolean): void {
  on = value;
  try {
    localStorage.setItem(KEY, value ? "on" : "off");
  } catch {
    // Without storage the setting lasts until the page closes.
  }
}

/** A burst of filtered noise that dies away: a knock when bright and short, a thud when dark and long. */
function knock(cutoff: number, seconds: number, gain: number): void {
  if (!on) return;
  try {
    audio ??= new AudioContext();
  } catch {
    return;
  }
  // Browsers hold sound until the player has touched the page; every caller here follows a click or a key.
  if (audio.state === "suspended") void audio.resume();
  const length = Math.floor(audio.sampleRate * seconds);
  const buffer = audio.createBuffer(1, length, audio.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 3;
  const source = audio.createBufferSource();
  const filter = audio.createBiquadFilter();
  const level = audio.createGain();
  filter.type = "lowpass";
  filter.frequency.value = cutoff;
  level.gain.value = gain * VOLUME;
  source.buffer = buffer;
  source.connect(filter).connect(level).connect(audio.destination);
  source.start();
}

export const SOUND = {
  /** A strike right on the beat, a good one, and one off it. */
  exact: () => knock(2200, 0.09, 0.5),
  good: () => knock(1400, 0.08, 0.4),
  miss: () => knock(220, 0.08, 0.4),
  /** A pump of the bellows. */
  bellows: () => knock(380, 0.22, 0.35),
  /** A furnace blown past its top. */
  burst: () => knock(260, 0.5, 0.8),
  /** Something finished coming out of a machine. */
  done: () => knock(700, 0.18, 0.6),
};
