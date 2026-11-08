// Typed access to the JSON game data.
import { localize, tr } from "./i18n";
import eraData from "../data/steam-era.json";
import oreJson from "../data/ores.json";
import displayData from "../data/display.json";
import materialData from "../data/materials.json";
import { expandRecipes } from "./expandRecipes.mjs";

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
const machines: Record<string, { name: string; cost?: Record<string, number>; work?: number; byproductSlots?: number; manual?: string; difficulty?: number; power?: number; powerOut?: number; steamReady?: boolean }> = era.machines;

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
export const PUMP = "drainage_pump";
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
export const richnessName = (id: string | undefined): string => RICHNESS.find((r) => r.id === id)?.name ?? "";
/** How much a riverbank holds, and how often it gains 1 back. */
export const RIVER: { reserve: number; regenMs: number } = oreData.river;
/** How often each raw family turns up among veins, relative to the others. */
export const FAMILY_WEIGHT: Record<string, number> = oreData.familyWeight;
/** The chance a chunk also holds a patch of food, apart from its ore. */
export const FORAGE_CHANCE: number = oreData.forageChance;
/** A cave entrance on the map. It is a site, but nothing is mined from it. */
export const CAVE = "cave";
/** Natural caves: one layer down, small, with veins found by prospecting. */
export const CAVES: {
  layer: number; width: number; height: number; sites: number[]; habitats: number[];
  damage: number; probeMs: number; probeRadius: number; chunkChance: number; near: number[];
} = oreData.cave;
/** What a power line carries. Not an item: it drives other lines. */
export const POWER = "power";
/** Route channels. Filters that pick a single item come later, in the electric age. */
export const ALL = "all";
export const MAIN = "main";
export const BYPRODUCT = "byproduct";

/** What an input slot is for, whatever fills it. */
export const inputRole = (key: string): string => (era.fuels.includes(key) ? tr("연료") : tr("재료"));
/** What an output slot is for: the first holds the product, the rest by-products. */
export const outputRole = (index: number): string => (index === 0 ? tr("결과") : tr("부산물"));

export const STAGES = era.milestones;
/** Stages with their content built so far. */
export const PLAYABLE_STAGES = 3;

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
  /** How much one strike takes from a vein. */
  mine?: number;
}
const gear: Record<string, Gear> = era.gear;
export const gearOf = (id: string): Gear | undefined => gear[id];
/** Equipment slots and what each is called. */
export const GEAR_SLOTS: [string, string][] = [["feet", tr("발")], ["back", tr("등")], ["hand", tr("손")]];
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
export const isPassive = (type: string): boolean => isStore(type) || type === MANIFOLD || type === TANK;

/** Parts of later milestones that share a machine with this one. */
const LATER_ITEMS = new Set(["port_flange"]);
const machineRecipes = (type: string): Recipe[] =>
  expanded.recipes.filter((r) => r.machine === type && !r.alt && !Object.keys(r.out).some((id) => LATER_ITEMS.has(id)));

/** Forms a machine can be set to. Empty when the input alone decides the result. */
export const machineForms = (type: string): string[] =>
  [...new Set(machineRecipes(type).flatMap((r) => (r.form ? [r.form] : [])))];

export const formLabel = (form: string): string => forms[form].label.trim();

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
const allSurfaceOres = Object.keys(ores).filter((id) => ores[id].layers[0] === 0);
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
/** How an unpowered machine is worked by hand: "click", "keys", or nothing if it runs itself. */
export const machineManual = (type: string): string | undefined => machines[type]?.manual;
export const machineWork = (type: string): number => machines[type].work ?? 1;
export const machineName = (type: string): string => machines[type].name;
/** How harshly a machine punishes mistakes, from 1 upward. */
export const machineDifficulty = (type: string): number => machines[type]?.difficulty ?? 1;
export const itemName = (id: string): string =>
  ores[id] ? `${ores[id].name} (${ores[id].elements})` : itemNames[id] ?? machines[id]?.name ?? id;
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

/** True when an item can fill a recipe ingredient, directly or through its ore family. */
export const matches = (item: string, ingredient: string): boolean =>
  item === ingredient || ores[item]?.family === ingredient;

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

const knownRecipes = (stage: number): Recipe[] => machinesAt(stage).flatMap(machineRecipes).filter((r) => !r.disposal);

/** The ores that fill a family such as "coal". */
export const familyMembers = (id: string): string[] => allSurfaceOres.filter((ore) => ores[ore].family === id);

/** Every item the player can meet right now, so later tiers stay a surprise. */
export function indexItems(stage = 0): string[] {
  const seen = new Set<string>([...stageOres(stage), ...FORAGE]);
  for (const recipe of knownRecipes(stage)) {
    for (const id of [...Object.keys(recipe.in), ...Object.keys(recipe.out)]) {
      if (!familyMembers(id).length) seen.add(id);
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
