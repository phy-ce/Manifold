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

/** A water site by the kind of water it draws from (mapView names open water itself the same way). */
const WATER_SITE = { river: tr("강가"), pond: tr("저수지"), oasis: tr("오아시스"), ice: tr("얼음 구멍") };

export const siteName = (s: GameState, site: Site): string =>
  site.ore === CAVE ? tr("자연 동굴") : site.ore === WATER ? `${WATER_SITE[waterKind(site.x, site.y, s.seed)]} ${site.code ?? ""}`.trim() : itemName(site.ore) + (emptiedOn(site, s.z) ? tr(" (고갈됨)") : canHarvest(s, site) ? "" : tr(" (수확 불가)"));
