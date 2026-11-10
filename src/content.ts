// Typed access to the JSON game data.
import { localize, tr } from "./i18n";
import eraData from "../data/steam-era.json";
import oreJson from "../data/ores.json";
import biomeJson from "../data/biomes.json";
import displayData from "../data/display.json";
import materialData from "../data/materials.json";
import { BUILDERS, CONSTRUCTION, WORKBENCH, expandRecipes } from "./expandRecipes.mjs";

export { CONSTRUCTION, WORKBENCH };
/** Whether a machine's forms are other machines: the workbench and the construction bench. */
export const isBuilder = (type: string): boolean => BUILDERS.includes(type);

// The language is set before this file loads, so all data can be translated once here.
const era = localize(eraData);
const oreData = localize(oreJson);
const materials = localize(materialData);

export interface Recipe {
  id: string;
  machine: string;
  form?: string;
  time: number;
  in: Record<string, number>;
  out: Record<string, number>;
  alt?: boolean;
  disposal?: boolean;
}

interface Ore {
  name: string;
  elements: string;
  family: string;
  /** The shallowest and deepest layers this ore turns up in. */
  layers: number[];
  /** Finer groups a recipe can ask for, such as oxide or sulfide copper ore. */
  groups?: string[];
  color: string;
}

interface Variant {
  metal: string;
  form: string;
  code: string;
  color: string;
}

const expanded = expandRecipes(era, materials) as unknown as {
  items: Record<string, string>;
  variants: Record<string, Variant>;
  recipes: Recipe[];
};
const itemNames = expanded.items;
const variants = expanded.variants;
const forms: Record<string, { label: string }> = materials.forms;
const ores: Record<string, Ore> = oreData.ores;
const display: Record<string, { code: string; color: string }> = displayData;
const machines: Record<string, { name: string; cost?: Record<string, number>; work?: number; byproductSlots?: number; manual?: string; rhythm?: number[]; difficulty?: number; power?: number; powerOut?: number; steamReady?: boolean; burn?: number; tier?: string }> = era.machines;

const food: Record<string, { hunger: number; hp: number }> = era.food;

/** Foraged foods and how much a vein of them holds. */
export const FORAGE: string[] = oreData.forage.ids;
export const FORAGE_SIZE: number[] = oreData.forage.size;
const forageSeasonList: Record<string, number[]> = oreData.forage.seasons;

/** Seasons a food can be picked in, or nothing if it isn't seasonal. */
export const forageSeasons = (id: string): number[] | undefined => forageSeasonList[id];

/** What eating an item restores, if it is food. */
export const foodEffect = (id: string): { hunger: number; hp: number } | undefined => food[id];

export const MAX_PORTS = era.rules.basePorts;
export const MILESTONE = era.milestones[0];
export const SURFACE = oreData.layers[0];
export const WAREHOUSE = "warehouse";
export const MOTOR = "spring_motor";
export const ENGINE = "steam_engine";
/** Stores coal tar. What happens when it fills up is the player's choice. */
export const TANK = "tar_tank";
export const TAR = "coal_tar";
/** Passes power on from one line to many. */
export const MANIFOLD = "steam_manifold";
/** Holds a little of anything and passes it on along its lines in turn. */
export const SPLITTER = "item_splitter";
/** Runs a belt network: every item line joined to it through machines moves on its power. */
export const BELT_DRIVE = "belt_drive";
/** The line that joins a belt drive to a network. It carries nothing. */
export const DRIVE = "drive";
/** Runs a fluid network the same way: every pipe joined to it through machines moves on its power. */
export const PRESSURE_PUMP = "pressure_pump";
/** The line that joins a pressure pump to a fluid network. It carries nothing. */
export const PRESS = "press";
export const PUMP = "drainage_pump";
/** Boils water into steam for steam engines. One feeds two engines, and it pushes its own steam out. */
export const BOILER = "steam_boiler";
/** Machines that push their own fluid out along their pipes, needing no pressure pump. */
export const SELF_PUSHING = [PUMP, BOILER];
export const WATER = "water";
/** The empty drum, what it holds, and the full item for each fluid. */
export const DRUM: { empty: string; liters: number; fills: Record<string, string> } = era.drum;
const kinds: Record<string, string> = era.kinds;
/** Liquids and gases can't be carried by hand, only along lines or in a container. */
export const isFluid = (id: string): boolean => id in kinds;
export const kindOf = (id: string): string => kinds[id] ?? "item";
/** The unit shown after an amount. */
export const unitOf = (id: string): string => (kinds[id] === "liquid" ? "L" : "");
/** Vein grades and their sizes. Each layer sets its own odds, so deeper ones usually hold more. */
export const RICHNESS: { id: string; name: string; size: number[] }[] = oreData.richness;
export const LAYERS: { depth: number; name: string; richness: Record<string, number> }[] = oreData.layers;
/** How much a riverbank holds, and how often it gains 1 back. */
export const RIVER: { reserve: number; regenMs: number } = oreData.river;
/** How often each raw family turns up among veins, relative to the others. */
export const FAMILY_WEIGHT: Record<string, number> = oreData.familyWeight;

/** What a biome changes: its look, its water, how likely each ore and food is, and rules for whoever walks it. */
export interface Biome {
  id: string;
  name: string;
  ground: string;
  glyphs: string;
  /** "river" lets rivers run through; "pond", "oasis" and "ice" make still water of their own. Nothing: dry. */
  water?: "river" | "pond" | "oasis" | "ice";
  /** How high the land must rise, 0..1, to make a hill here: lower is hillier, above 1 none at all. The default is 0.8. */
  hills?: number;
  /** The tallest a hill gets here, 1 to 3. Only mountains reach 3. The default is 1. */
  maxHeight?: number;
  family?: Record<string, number>;
  ores?: Record<string, number>;
  /** Ores found on the surface here though they lie deeper elsewhere. */
  extraOres?: string[];
  forage: string[];
  forageChance?: number;
  caves?: number;
  /** How much likelier a rich vein is. */
  rich?: number;
  rules?: { walk?: number; hunger?: number; winterHunger?: number; vision?: number };
}
const biomeData = localize(biomeJson) as unknown as {
  climateScale: number; regionSize: number; regionWarp: number; lakeScale: number; temperateRadius: number; starterRadius: number;
  biomes: Record<string, Omit<Biome, "id">>;
  yeti: Yeti;
};
/**
 * The yeti of the snowfield: a belief of the early age, so it comes out only up to `lastStage`. While the
 * player is in its biome one may come out every `everyMs` with `chance`, between `away` cells off and out of
 * sight. It notices the player within `sight`, never leaves its biome, and gives up after `giveUpMs` with the
 * player out of the biome or beyond `forgetAway`. `immune`: blows land and stagger it but take no health, so
 * the only way to live through one is to leave its biome.
 */
export interface Yeti {
  name: string; biome: string; lastStage: string;
  everyMs: number; chance: number; away: number[]; sight: number; forgetAway: number; giveUpMs: number;
  moveMs: number; attackMs: number; damage: number; hp: number; immune?: boolean;
}
export const YETI: Yeti = biomeData.yeti;
export const BIOMES: Record<string, Biome> = Object.fromEntries(Object.entries(biomeData.biomes).map(([id, b]) => [id, { id, ...b } as Biome]));
export const BIOME_WORLD = {
  climateScale: biomeData.climateScale, regionSize: biomeData.regionSize, regionWarp: biomeData.regionWarp, lakeScale: biomeData.lakeScale,
  temperateRadius: biomeData.temperateRadius, starterRadius: biomeData.starterRadius,
};
/**
 * How veins are laid out over cells. Ore sizes are the grade's size times `sizeScale`. A chunk gets one ore
 * vein with the first chance of `perChunk` and two with the second. A strand's cells hold shares weighted
 * from 1 at its ends up to `coreWeight` at its middle. Lengths are per grade, rich ones longest; in a cave the
 * strand picks floor, exposed wall and buried rock by `caveWeights`.
 */
export const VEINS: {
  sizeScale: number; perChunk: number[]; coreWeight: number;
  /** The one vein of each family S0 cannot do without, laid somewhere around the base, not right beside it. */
  starter: { families: string[]; distance: number[] };
  surfaceCells: Record<string, number[]>; caveCells: Record<string, number[]>;
  caveWeights: { floor: number; wall: number; buried: number };
  /**
   * Surface veins that run on underground: the share of them that do, how many branches spread out below the
   * outcrop, and each branch's cells by grade. The vein's one total covers the outcrop and its branches.
   */
  below: { chance: number; branches: number[]; cells: Record<string, number[]> };
  /** The chance an underground chunk holds a vein of its own, never seen from the surface. */
  underChunk: number;
} = oreData.veins;
/** The chance a chunk also holds a patch of food, apart from its ore. */
export const FORAGE_CHANCE: number = oreData.forageChance;
/** A cave entrance on the map. It is a site, but nothing is mined from it. */
export const CAVE = "cave";
/** The underground: one endless layer under the surface, entered by cave entrances, with veins found by prospecting. */
export const CAVES: {
  layer: number;
  probeMs: number; probeRadius: number; chunkChance: number; near: number[];
  /**
   * How the underground is laid out. Caverns open where a slow noise (`cavernScale` cells across) rises past
   * `cavern`; tunnels run where one noise (`tunnelScale`) lies within `tunnel` of its middle and a broader one
   * within `tunnelSpread`. A chunk has a den with the chance `dens`. Each entrance opens a chamber `chamber`
   * cells round and is joined to the nearest open area of at least `joinSize` cells within `reach`.
   */
  under: { cavernScale: number; cavern: number; tunnelScale: number; tunnel: number; tunnelSpread: number; dens: number; chamber: number; reach: number; joinSize: number };
  creatures: {
    count: number[]; rangedShare: number; sight: number; hunt: number; safeRadius: number;
    /** Creatures that come out while the player is in: how often a den is tried, the odds and how they grow with time and noise, the most alive at once, and how far away they come out and are forgotten. */
    spawn: { everyMs: number; chance: number; perMinute: number; most: number; cap: number; minAway: number; forgetAway: number; noiseMs: number; noiseBonus: number };
    melee: { name: string; moveMs: number; attackMs: number; damage: number; hp: number };
    ranged: { name: string; moveMs: number; fireMs: number; damage: number; hp: number; range: number; keep: number[]; shotSpeed: number };
  };
} = oreData.cave;
/** What a power line carries. Not an item: it drives other lines. */
export const POWER = "power";
/** Route channels. Filters that pick a single item come later, in the electric age. */
export const ALL = "all";
export const MAIN = "main";
export const BYPRODUCT = "byproduct";

/** What an input slot is for, whatever fills it. */
export const inputRole = (_key: string): string => tr("재료");

// ---- Fuel and power tiers

/** Heat each fuel gives when burned. Only these can go in a fuel slot. */
const FUEL: Record<string, number> = era.fuels;
export const fuelValue = (id: string): number => FUEL[id] ?? 0;
export const isFuel = (id: string): boolean => id in FUEL;
export const FUELS: string[] = Object.keys(FUEL);
/** Heat a machine burns per second while it works. Zero for machines without a firebox. */
export const machineBurn = (type: string): number => machines[type]?.burn ?? 0;
/** Power tiers, weakest first: a source drives machines of its own tier or below. */
export const TIERS: string[] = era.tiers;
export const tierRank = (tier: string): number => TIERS.indexOf(tier);
/** The tier a source gives, or a machine needs. Powered machines default to low-pressure steam. */
export const machineTier = (type: string): string => machines[type]?.tier ?? (machines[type]?.power || machines[type]?.powerOut ? "low" : TIERS[0]);
/** What an output slot is for: the first holds the product, the rest by-products. */
export const outputRole = (index: number): string => (index === 0 ? tr("결과") : tr("부산물"));

export const STAGES = era.milestones;
/** Stages with their content built so far. */
export const PLAYABLE_STAGES = 4;
/** The stage that opens a raw source, such as water and its riverbanks. */
export const stageOpening = (source: string): number => STAGES.findIndex((s) => s.unlockSources.includes(source));

/** Machines open at a stage, counting every stage before it. */
export const machinesAt = (stage: number): string[] =>
  STAGES.slice(0, Math.min(stage, PLAYABLE_STAGES - 1) + 1).flatMap((s) => s.unlockMachines);

export interface Gear {
  slot: string;
  note: string;
  /** Multiplies the time a step takes. */
  walk?: number;
  /** Adds to how much the player can carry. */
  carry?: number;
  /** A weapon: health taken from a creature per blow, how many cells away it reaches, and ms between blows. */
  damage?: number;
  range?: number;
  cooldown?: number;
}
const gear: Record<string, Gear> = era.gear;
export const gearOf = (id: string): Gear | undefined => gear[id];
/** Equipment slots and what each is called. */
export const GEAR_SLOTS: [string, string][] = [["feet", tr("발")], ["back", tr("등")], ["hand", tr("손")], ["weapon", tr("무기")]];
/** The items that fit a slot. */
export const gearFor = (slot: string): string[] => Object.keys(gear).filter((id) => gear[id].slot === slot);

/** Machines of the first stage. */
export const MACHINE_TYPES: string[] = machinesAt(0);

/** Force a machine uses each second, if it can run on power. */
export const machinePower = (type: string): number => machines[type].power ?? 0;
/** Force a steam engine gives each second. */
export const machinePowerOut = (type: string): number => machines[type].powerOut ?? 0;
export const isPowerSource = (type: string): boolean => type === MOTOR || type === ENGINE;
/** Fitted to a machine so it can take steam power. */
export const MODULE = "steam_module";
/** Machines built for steam, with no module to fit. */
export const isSteamReady = (type: string): boolean => machines[type]?.steamReady ?? false;
/** Nodes that hold items in slots and send them on without a recipe. */
export const isStore = (type: string): boolean => type === WAREHOUSE || type === SPLITTER;
/** Nodes with no recipe of their own. */
export const isPassive = (type: string): boolean => isStore(type) || type === MANIFOLD || type === TANK || type === BELT_DRIVE || type === PRESSURE_PUMP;

/** Parts of later milestones that share a machine with this one. */
const LATER_ITEMS = new Set(["port_flange"]);
const machineRecipes = (type: string): Recipe[] =>
  expanded.recipes.filter((r) => r.machine === type && !r.alt && !Object.keys(r.out).some((id) => LATER_ITEMS.has(id)));

/** Forms a machine can be set to. Empty when the input alone decides the result. */
export const machineForms = (type: string): string[] =>
  [...new Set(machineRecipes(type).flatMap((r) => (r.form ? [r.form] : [])))];

/** A shape's name, or, on the construction bench, the machine it makes. */
export const formLabel = (form: string): string => forms[form]?.label.trim() ?? machineName(form);
/** Shapes are grouped for picking: parts that go into other things, gear to wear, finished goods. */
export const FORM_CATEGORIES: [string, string][] = Object.entries(materials.categories as Record<string, string>);
export const formCategory = (form: string): string =>
  (materials.forms as Record<string, { category?: string }>)[form]?.category ?? FORM_CATEGORIES[0][0];

/**
 * How a machine's forms are grouped in its picker, as [label, forms]. Shapes go by category;
 * a bench's machines go by the stage that opens them, up to the stage reached.
 */
export function formGroups(type: string, forms: string[], stage: number): [string, string[]][] {
  if (isBuilder(type)) {
    return STAGES.slice(0, Math.min(stage, PLAYABLE_STAGES - 1) + 1)
      .map((s): [string, string[]] => [s.id, s.unlockMachines.filter((m: string) => forms.includes(m))])
      .filter(([, list]) => list.length);
  }
  return FORM_CATEGORIES.map(([category, label]): [string, string[]] => [label, forms.filter((form) => formCategory(form) === category)])
    .filter(([, list]) => list.length);
}

export interface Process {
  recipes: Recipe[];
  slots: { key: string; accepts: string[] }[];
  outputs: string[];
  /** Output slots by role: main product first, then by-products. Each lists what it can hold. */
  outSlots: string[][];
}

/** What a machine does at a form: the input slots and every possible output. */
export function processOf(type: string, form: string): Process {
  const key = `${type}|${form}`;
  let process = processes.get(key);
  if (!process) {
    process = buildProcess(type, form);
    processes.set(key, process);
  }
  return process;
}

/** Processes never change, and the game asks for them constantly. */
const processes = new Map<string, Process>();

function buildProcess(type: string, form: string): Process {
  const recipes = machineRecipes(type).filter((r) => !form || r.form === form);
  const first = Object.keys(recipes[0].in);
  const widest = Math.max(...recipes.map((r) => Object.keys(r.out).length));
  const count = widest ? Math.max(widest, 1 + (machines[type].byproductSlots ?? 0)) : 0;
  const outSlots = Array.from({ length: count }, (_, i) =>
    [...new Set(recipes.flatMap((r) => Object.keys(r.out).slice(i, i + 1)))]);
  return {
    recipes,
    // A slot is keyed by its first ingredient and accepts that position in every recipe.
    slots: first.map((key, i) => ({ key, accepts: [...new Set(recipes.map((r) => Object.keys(r.in)[i]))] })),
    outputs: [...new Set(recipes.flatMap((r) => Object.keys(r.out)))],
    outSlots,
  };
}

/** Surface ores that supply each raw family used in this milestone. */
export const SURFACE_ORES: string[] = Object.keys(ores).filter(
  (id) => ores[id].layers[0] === 0 && MILESTONE.unlockSources.includes(ores[id].family),
);
/** Ores found on the surface: those of the top layer, and those a biome lays there too (magnetite on the snow,
 * pyrite in the mountains), so the index lists them and says where they come from. */
const biomeSurfaceOres = Object.values(BIOMES).flatMap((b) => b.extraOres ?? []);
const allSurfaceOres = Object.keys(ores).filter((id) => ores[id].layers[0] === 0 || biomeSurfaceOres.includes(id));
/** Whether an ore turns up in a layer. */
export const inLayer = (id: string, layer: number): boolean => !!ores[id] && ores[id].layers[0] <= layer && layer <= ores[id].layers[1];
/** Ores of the opened families that turn up in a layer. */
export function layerOres(layer: number, stage: number): string[] {
  const opened = STAGES.slice(0, Math.min(stage, PLAYABLE_STAGES - 1) + 1).flatMap((s) => s.unlockSources);
  return Object.keys(ores).filter((id) => inLayer(id, layer) && opened.includes(ores[id].family));
}
export const familyOf = (id: string): string | undefined => ores[id]?.family;

/** Surface ores open at a stage, counting every stage before it. */
export function stageOres(stage: number): string[] {
  const opened = STAGES.slice(0, Math.min(stage, PLAYABLE_STAGES - 1) + 1).flatMap((s) => s.unlockSources);
  return allSurfaceOres.filter((id) => opened.includes(ores[id].family));
}
/** Ores that arrive after the start, so they aren't in the first veins laid out. */
export const laterOres = (stage: number): string[] => stageOres(stage).filter((id) => !SURFACE_ORES.includes(id));

export const machineCost = (type: string): Record<string, number> => machines[type].cost ?? {};
/** How an unpowered machine is worked by hand: "rhythm" (strike on the beat), "bellows", "keys", "click", or nothing if it runs itself. */
export const machineManual = (type: string): string | undefined => machines[type]?.manual;
/** The beat a rhythm machine is struck to: the gaps between beats in ms, repeated. */
export const machineRhythm = (type: string): number[] => machines[type]?.rhythm ?? [700];
export const machineWork = (type: string): number => machines[type].work ?? 1;
export const machineName = (type: string): string => machines[type].name;
/** How harshly a machine punishes mistakes, from 1 upward. */
export const machineDifficulty = (type: string): number => machines[type]?.difficulty ?? 1;
export const itemName = (id: string): string =>
  ores[id] ? `${ores[id].name} (${ores[id].elements})` : id === FUEL_GROUP ? tr("연료") : id === DRIVE ? tr("구동") : id === PRESS ? tr("압송") : itemNames[id] ?? machines[id]?.name ?? id;
/** A finished machine is an item until it is installed. */
export const isMachine = (id: string): boolean => id in machines;
export const itemCode = (id: string): string => variants[id]?.code ?? display[id]?.code ?? id.slice(0, 2);
export const itemColor = (id: string): string => variants[id]?.color ?? display[id]?.color ?? "#dfe5ea";
export const formOf = (id: string): string | undefined => variants[id]?.form;

const weights: Record<string, number> = era.weights;
const metals: Record<string, { weight: number }> = materials.metals;
const formWeights: Record<string, { weight: number }> = materials.forms;

/** Every machine weighs the same to carry. */
const MACHINE_WEIGHT = 10;

/** Weight of one item. A part weighs its metal times how much metal its form uses. */
export function itemWeight(id: string): number {
  const variant = variants[id];
  if (variant) return metals[variant.metal].weight * formWeights[variant.form].weight;
  if (machines[id]) return MACHINE_WEIGHT;
  return weights[id] ?? metals[id]?.weight ?? 1;
}

/**
 * What an item is a kind of, one step up: pig iron is a kind of iron, so a pig iron plate is a kind of iron plate.
 * The metal table says which metal extends which; parts follow their metal.
 */
export function parentOf(id: string): string | undefined {
  const metals = materials.metals as Record<string, { extends?: string }>;
  if (metals[id]?.extends) return metals[id].extends;
  const variant = variants[id];
  const up = variant && metals[variant.metal]?.extends;
  return up ? `${up}_${variant.form}` : undefined;
}

/** An item, then each thing it is a kind of, nearest first. */
export function lineage(id: string): string[] {
  const out = [id];
  for (let up = parentOf(id); up && !out.includes(up); up = parentOf(up)) out.push(up);
  return out;
}

/** Fits by the item itself: the same id, or an ore's family or group. */
/** True when an ingredient names this very item or a group of it, finer than its family: pyrite, not iron ore. */
export const namesItem = (item: string, ingredient: string): boolean => item === ingredient || !!ores[item]?.groups?.includes(ingredient);
const fitsAsIs = (item: string, ingredient: string): boolean =>
  item === ingredient || ores[item]?.family === ingredient || !!ores[item]?.groups?.includes(ingredient);

/**
 * True when an item can fill a recipe ingredient: directly, through its ore family, or as a kind of what is asked
 * for. A pig iron plate fills an iron plate's place; an iron plate never fills a pig iron plate's.
 * `inherit` false checks the item as it is, without its parents.
 */
export const matches = (item: string, ingredient: string, inherit = true): boolean =>
  (inherit ? lineage(item) : [item]).some((kind) => fitsAsIs(kind, ingredient));
/** Every ore a family or group takes in, shallowest first. */
export const groupMembers = (id: string): string[] =>
  Object.keys(ores).filter((ore) => ores[ore].family === id || ores[ore].groups?.includes(id)).sort((a, b) => ores[a].layers[0] - ores[b].layers[0]);

/** Stands for whatever burns, like an ore family stands for its ores. Never held, only shown. */
export const FUEL_GROUP = "fuel";

/**
 * The names a raw item can be found by besides its own: its ore family and groups (점토, 구리광, 산화 구리광),
 * and whether it is fuel or food. Map search uses these, so "점토" finds every clay vein.
 */
export function categoryNames(id: string): string[] {
  const ids = [familyOf(id), ...(ores[id]?.groups ?? [])].filter((x): x is string => !!x);
  const names = ids.map((x) => itemName(x));
  if (isFuel(id)) names.push(tr("연료"));
  if (FORAGE.includes(id)) names.push(tr("음식"));
  return names;
}
/**
 * Whether an item answers a search: by its name or code, or by a category it belongs to, so "점토" finds kaolin
 * and "연료" every coal. The one rule for every search box (the map's and the index's); `query` is lowercased.
 */
export function itemMatches(id: string, query: string, extra: string[] = []): boolean {
  if (!query) return true;
  return [itemName(id), itemCode(id), ...categoryNames(id), ...extra].some((t) => t.toLowerCase().includes(query));
}

/** The items a group stands for: an ore family or group, or every fuel. Empty for a plain item. */
export const membersOf = (id: string): string[] => (id === FUEL_GROUP ? FUELS : groupMembers(id));
export const isGroup = (id: string): boolean => membersOf(id).length > 0;
/** Machines open by a stage that burn fuel while they work. */
export const burners = (stage = 0): string[] => machinesAt(stage).filter((type) => machineBurn(type) > 0);

// ---- Item order

const rawItems = [...Object.keys(ores), WATER, ...FORAGE];
const metalOrder = Object.keys(materials.metals);
const formOrder = ["ingot", ...Object.keys(materials.forms)];

/** Recipe steps between an item and raw material, by its shortest route. */
function processingDepth(id: string, visiting = new Set<string>()): number {
  if (visiting.has(id)) return Infinity;
  const makers = expanded.recipes.filter((r) => id in r.out && !r.alt);
  if (!makers.length) return 0;
  const path = new Set(visiting).add(id);
  return Math.min(...makers.map((r) => 1 + Math.max(0, ...Object.keys(r.in).map((key) => processingDepth(key, path)))));
}

const ranks = new Map<string, number[]>();

/** Raw materials, then metal parts by form and metal, then everything else by how processed it is. */
function itemRank(id: string): number[] {
  let rank = ranks.get(id);
  if (!rank) {
    const raw = rawItems.indexOf(id);
    const metal = metalOrder.includes(id) ? id : variants[id]?.metal;
    const form = metalOrder.includes(id) ? "ingot" : variants[id]?.form;
    if (raw >= 0) rank = [0, raw, 0];
    else if (metal) rank = [1, formOrder.indexOf(form), metalOrder.indexOf(metal)];
    else if (id in machines) rank = [3, Object.keys(machines).indexOf(id), 0];
    else rank = [2, processingDepth(id), 0];
    ranks.set(id, rank);
  }
  return rank;
}

/** Sort order for stacks. Ores and metals follow their order in the data files: iron, copper, then the rest. */
export function compareItems(a: string, b: string): number {
  const x = itemRank(a);
  const y = itemRank(b);
  return x[0] - y[0] || x[1] - y[1] || x[2] - y[2] || a.localeCompare(b);
}

// ---- Item index

/**
 * Recipes the player can actually run by a stage: on an open machine, with every input
 * obtainable by then. A machine open early can't leak a later material, such as steel on the plate hammer.
 */
const knownCache = new Map<number, Recipe[]>();
function knownRecipes(stage: number): Recipe[] {
  const cached = knownCache.get(stage);
  if (cached) return cached;
  // A bench only makes machines that are open by this stage.
  const opened = machinesAt(stage);
  const open = opened.flatMap(machineRecipes).filter((r) => !r.disposal && (!isBuilder(r.machine) || opened.includes(r.form!)));
  // Caves are open from the start, so their layer counts too.
  const have = new Set<string>([...stageOres(stage), ...layerOres(1, stage), ...FORAGE]);
  const obtainable = (key: string) => [...have].some((id) => matches(id, key));
  const known: Recipe[] = [];
  for (let grew = true; grew;) {
    grew = false;
    for (const recipe of open) {
      if (known.includes(recipe) || !Object.keys(recipe.in).every(obtainable)) continue;
      known.push(recipe);
      Object.keys(recipe.out).forEach((id) => have.add(id));
      grew = true;
    }
  }
  // Keep the data's order, so lists read the same as before.
  const ordered = open.filter((r) => known.includes(r));
  knownCache.set(stage, ordered);
  return ordered;
}

/** The ores that fill a family such as "coal". */
export const familyMembers = (id: string): string[] => allSurfaceOres.filter((ore) => ores[ore].family === id);

/** Every item the player can meet right now, so later tiers stay a surprise. */
export function indexItems(stage = 0): string[] {
  const seen = new Set<string>([...stageOres(stage), ...layerOres(1, stage), ...FORAGE]);
  for (const recipe of knownRecipes(stage)) {
    for (const id of [...Object.keys(recipe.in), ...Object.keys(recipe.out)]) {
      if (!groupMembers(id).length) seen.add(id);
    }
  }
  if (seen.has(WATER)) Object.values(DRUM.fills).forEach((id) => seen.add(id));
  return [...seen];
}

export const recipesFor = (id: string, stage = 0): Recipe[] => knownRecipes(stage).filter((r) => id in r.out);
export const usesOf = (id: string, stage = 0): Recipe[] =>
  knownRecipes(stage).filter((r) => Object.keys(r.in).some((key) => matches(id, key)));

/** Machines that take this item as a building material. */
export const buildUses = (id: string, stage = 0): [string, Record<string, number>][] =>
  machinesAt(stage).filter((type) => Object.keys(machineCost(type)).some((key) => matches(id, key)))
    .map((type) => [type, machineCost(type)]);

/** Where a raw item comes from, for items no machine makes. */
export function itemSource(id: string): string | null {
  if (allSurfaceOres.includes(id)) return tr("지도의 광맥에서 캡니다");
  if (FORAGE.includes(id)) return tr("지도에서 채집합니다");
  if (id === WATER) return tr("강가에서 펌프로 끌어옵니다");
  if (Object.values(DRUM.fills).includes(id)) return tr("빈 드럼통을 들고 펌프의 출력을 눌러 채웁니다");
  return null;
}
