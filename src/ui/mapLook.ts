// What the map shares with its gathering panel and its finder: the glyph colours and how a site is named.
import { tr } from "../i18n";
import { CAVE, WATER, itemName } from "../content";
import { GameState, canHarvest } from "../engine/game";
import { Site, emptiedOn, waterKind } from "../engine/world";

export const COLOR: Record<string, string> = {
  "t-plain": "#3c4955", "t-hill1": "#7c8b9b", "t-hill2": "#a9b6c2", "t-hill3": "#e6ebef", "t-water": "#4d8fc4", "t-ice": "#a9d4ec",
  player: "#8fd16f", base: "#dfe5ea", path: "#ffb238", remembered: "#3a4552", memoryBg: "#141a22", seenBg: "#1d2631",
  cave: "#c9a27a", rock: "#2b3541", probe: "#ffb238", wolf: "#ff5f56", spitter: "#c678dd", yeti: "#8fe3ff", deer: "#e0a868", corpse: "#b0705a", shot: "#ff8c5a",
  stone: "#5b6670",
};

/**
 * The map's neutral colours are not its own: each is one of the age's theme tokens (style.css), or a mix of two,
 * so the map turns with the age as every box does. [token, other token or colour, how much of the other].
 * The glyph colours above that mean something (water, the player, creatures) stay as they are.
 */
const NEUTRAL: Record<string, [string, string?, number?]> = {
  memoryBg: ["--bg", "--fg", 0.02],
  seenBg: ["--bg", "--fg", 0.07],
  rock: ["--bg", "--fg", 0.12],
  remembered: ["--faint"],
  "t-plain": ["--faint"],
  stone: ["--bg", "--fg", 0.33],
  base: ["--fg"],
  "t-hill1": ["--dim"],
  "t-hill2": ["--dim", "--fg", 0.45],
  "t-hill3": ["--fg", "#ffffff", 0.4],
};
const hexRgb = (hex: string): number[] => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const mixHex = (a: string, b: string, t: number): string =>
  "#" + hexRgb(a).map((v, i) => Math.round(v + (hexRgb(b)[i] - v) * t).toString(16).padStart(2, "0")).join("");
let themed = "";

/**
 * Takes the map's neutral colours from the age's tokens now on the page. True when they changed, so the map
 * redraws everything it cached in the old ones.
 */
export function syncMapTheme(): boolean {
  const css = getComputedStyle(document.body);
  const token = (name: string) => (name.startsWith("#") ? name : css.getPropertyValue(name).trim());
  const key = ["--bg", "--fg", "--dim", "--faint"].map(token).join();
  if (key === themed || !token("--bg").startsWith("#")) return false;
  themed = key;
  for (const [name, [a, b, t]] of Object.entries(NEUTRAL)) COLOR[name] = b ? mixHex(token(a), token(b), t ?? 0) : token(a);
  return true;
}

/** A water site by the kind of water it draws from (mapView names open water itself the same way). */
const WATER_SITE = { river: tr("강가"), pond: tr("저수지"), oasis: tr("오아시스"), ice: tr("얼음 구멍") };

export const siteName = (s: GameState, site: Site): string =>
  site.ore === CAVE ? tr("자연 동굴") : site.ore === WATER ? `${WATER_SITE[waterKind(site.x, site.y, s.seed)]} ${site.code ?? ""}`.trim() : itemName(site.ore) + (emptiedOn(site, s.z) ? tr(" (고갈됨)") : canHarvest(s, site) ? "" : tr(" (수확 불가)"));
