// Validates data/steam-era.json and prints the machines each milestone needs.
// Usage: node tools/validate-recipes.mjs [path-to-data.json]
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { expandRecipes } from "../src/expandRecipes.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const data = JSON.parse(readFileSync(process.argv[2] ?? resolve(root, "data/steam-era.json"), "utf8"));
const materials = JSON.parse(readFileSync(resolve(root, "data/materials.json"), "utf8"));
const { items, variants, recipes } = expandRecipes(data, materials);
const { rules, sources, machines, milestones } = data;

const errors = [];
const name = (id) => items[id] ?? machines[id]?.name ?? id;

// Recipes can ask for a finer group than a family, such as sulfide copper ore. A group is
// at hand once its family is, if one of its ores can be dug without drilling (layers 0 and 1).
const ores = JSON.parse(readFileSync(resolve(root, "data/ores.json"), "utf8")).ores;
const groupFamily = {};
for (const ore of Object.values(ores)) {
  if (ore.layers[0] > 1) continue;
  for (const group of ore.groups ?? []) groupFamily[group] = ore.family;
}
const withGroups = (ids) => new Set([...ids, ...Object.keys(groupFamily).filter((g) => ids.has(groupFamily[g]))]);

function recipePorts(recipe) {
  const machine = machines[recipe.machine];
  const usesPower = machine.power || machine.powerOut ? 1 : 0;
  return Object.keys(recipe.in).length + Object.keys(recipe.out).length + usesPower;
}

// Reference integrity.
for (const recipe of recipes) {
  if (!machines[recipe.machine]) errors.push(`${recipe.id}: 없는 기계 ${recipe.machine}`);
  for (const id of [...Object.keys(recipe.in), ...Object.keys(recipe.out)]) {
    if (!items[id] && !machines[id]) errors.push(`${recipe.id}: 없는 재료 ${id}`);
  }
}
for (const [id, machine] of Object.entries(machines)) {
  for (const item of Object.keys(machine.cost ?? {})) {
    if (!items[item]) errors.push(`${id}: 비용에 없는 재료 ${item}`);
  }
}

// Items reachable from a set of sources and machines.
function reachable(sourceIds, machineIds) {
  const found = withGroups(new Set(sourceIds));
  let changed = true;
  while (changed) {
    changed = false;
    for (const recipe of recipes) {
      if (!machineIds.has(recipe.machine)) continue;
      if (!Object.keys(recipe.in).every((id) => found.has(id))) continue;
      for (const id of Object.keys(recipe.out)) {
        if (!found.has(id)) {
          found.add(id);
          changed = true;
        }
      }
    }
  }
  return found;
}

// Steady-state rates for a goal, in items per second.
function solve(goal, activeMachines, drained) {
  const active = recipes.filter((r) => activeMachines.has(r.machine) && !r.alt && !r.disposal);
  const producer = {};
  for (const recipe of active) {
    for (const id of Object.keys(recipe.out)) producer[id] = recipe; // later recipes replace earlier ones
  }
  const engine = active.find((r) => machines[r.machine].powerOut);
  const pumps = activeMachines.has("drainage_pump") ? 1 : 0;
  let rates = {};
  let power = 0;

  for (let pass = 0; pass < 100; pass += 1) {
    const demand = { [goal.item]: goal.perMinute / 60 };
    for (const recipe of active) {
      for (const [id, qty] of Object.entries(recipe.in)) {
        demand[id] = (demand[id] ?? 0) + (rates[recipe.id] ?? 0) * qty;
      }
    }
    const next = {};
    for (const [id, rate] of Object.entries(demand)) {
      const recipe = producer[id];
      if (recipe) next[recipe.id] = Math.max(next[recipe.id] ?? 0, rate / recipe.out[id]);
    }
    power = pumps * machines.drainage_pump.power;
    for (const [id, rate] of Object.entries(next)) {
      const recipe = recipes.find((r) => r.id === id);
      power += Math.ceil(rate * recipe.time - 1e-9) * (machines[recipe.machine].power ?? 0);
    }
    if (engine) next[engine.id] = Math.ceil(power / machines[engine.machine].powerOut) / engine.time;
    const stable = Object.keys({ ...rates, ...next }).every(
      (id) => Math.abs((rates[id] ?? 0) - (next[id] ?? 0)) < 1e-9,
    );
    rates = next;
    if (stable) break;
  }

  const balance = {};
  for (const recipe of active) {
    const rate = rates[recipe.id] ?? 0;
    for (const [id, qty] of Object.entries(recipe.in)) balance[id] = (balance[id] ?? 0) - rate * qty;
    for (const [id, qty] of Object.entries(recipe.out)) balance[id] = (balance[id] ?? 0) + rate * qty;
  }
  balance[goal.item] = (balance[goal.item] ?? 0) - goal.perMinute / 60;
  // A group is dug from its family's veins.
  for (const [group, family] of Object.entries(groupFamily)) {
    if (!balance[group]) continue;
    balance[family] = (balance[family] ?? 0) + balance[group];
    delete balance[group];
  }

  const counts = {};
  for (const [id, rate] of Object.entries(rates)) {
    const recipe = recipes.find((r) => r.id === id);
    counts[recipe.machine] = (counts[recipe.machine] ?? 0) + Math.ceil(rate * recipe.time - 1e-9);
  }
  if (pumps) counts.drainage_pump = pumps;

  // Surplus by-products go to disposal machines, which also count.
  for (const recipe of recipes.filter((r) => r.disposal && activeMachines.has(r.machine))) {
    const [id] = Object.keys(recipe.in);
    const rate = balance[id] ?? 0;
    if (rate > 1e-9) counts[recipe.machine] = Math.ceil((rate * recipe.time) / recipe.in[id] - 1e-9);
  }
  for (const id of Object.keys(counts)) {
    if (counts[id] === 0) delete counts[id];
  }

  const raw = {};
  for (const [id, source] of Object.entries(sources)) {
    const rate = -(balance[id] ?? 0);
    if (rate > 1e-9) {
      const perNode = drained && source.drainedRate ? source.drainedRate : source.rate;
      raw[id] = { rate, nodes: Math.ceil(rate / perNode - 1e-9) };
    }
  }
  const surplus = Object.entries(balance).filter(([id, rate]) => rate > 1e-9 && !sources[id]);
  return { counts, raw, surplus, power };
}

// Walk the milestones in order.
// Wood and stone are gathered from the ground, and a deer leaves what it drops: all there from the start.
const oreFile = JSON.parse(readFileSync(resolve(root, "data/ores.json"), "utf8"));
const biomeFile = JSON.parse(readFileSync(resolve(root, "data/biomes.json"), "utf8"));
const seenSources = new Set([...Object.keys(oreFile.gather?.size ?? {}), ...Object.keys(biomeFile.deer?.drops ?? {})]);
const seenMachines = new Set();
let available = new Set();
const extension = rules.portExtension;
const report = [];

for (const milestone of milestones) {
  const before = available;
  milestone.unlockSources.forEach((id) => seenSources.add(id));
  milestone.unlockMachines.forEach((id) => seenMachines.add(id));

  for (const id of milestone.unlockMachines) {
    if (!machines[id]) errors.push(`${milestone.id}: 없는 기계 ${id}`);
  }

  // Bootstrapping: each machine built may pay for the next one.
  const buildable = new Set();
  available = withGroups(new Set(seenSources));
  let grew = true;
  while (grew) {
    grew = false;
    for (const id of seenMachines) {
      if (buildable.has(id) || !machines[id]) continue;
      if (Object.keys(machines[id].cost ?? {}).every((item) => available.has(item))) {
        buildable.add(id);
        grew = true;
      }
    }
    available = reachable(seenSources, buildable);
  }
  for (const id of milestone.unlockMachines) {
    if (machines[id] && !buildable.has(id)) errors.push(`${milestone.id}: ${machines[id].name}을(를) 지을 재료를 만들 수 없음`);
  }
  if (!available.has(milestone.goal.item)) errors.push(`${milestone.id}: 목표 ${name(milestone.goal.item)}에 도달할 수 없음`);

  // Port budget, with the extension only once it has been produced.
  const flangeReady = before.has(extension.item);
  const limit = rules.basePorts + (flangeReady ? extension.portsPerItem * extension.maxPerMachine : 0);
  const needsFlange = [];
  for (const recipe of recipes.filter((r) => milestone.unlockMachines.includes(r.machine))) {
    const ports = recipePorts(recipe);
    if (ports > limit) errors.push(`${milestone.id}: ${recipe.id} 포트 ${ports}개, 허용 ${limit}개 초과`);
    if (ports > rules.basePorts) needsFlange.push(`${machines[recipe.machine].name} ${ports}포트`);
  }

  // Every by-product must have somewhere to go by the milestone that creates it.
  for (const recipe of recipes.filter((r) => seenMachines.has(r.machine))) {
    for (const id of Object.keys(recipe.out).slice(1)) {
      const sink = data.stockpiled?.includes(id) || recipes.some((r) => seenMachines.has(r.machine) && r.in[id]);
      if (!sink) errors.push(`${milestone.id}: 부산물 ${name(id)}의 소비처나 폐기 경로가 없음`);
    }
  }

  report.push({ milestone, needsFlange, ...solve(milestone.goal, seenMachines, seenMachines.has("drainage_pump")) });
}

// Every produced item must be used by something.
for (const id of Object.keys(items)) {
  const asked = (key) => recipes.some((r) => r.in[key]) || Object.values(machines).some((m) => m.cost?.[key]);
  // A family is used when a recipe asks for it or for one of its groups.
  const used = asked(id) || Object.entries(groupFamily).some(([group, family]) => family === id && asked(group));
  const isGoal = milestones.some((m) => m.goal.item === id);
  if (!used && !isGoal && !variants[id] && !data.food?.[id] && !data.stockpiled?.includes(id) && !data.awaitingUse?.includes(id) && !data.gear?.[id] && !data.ruleItems?.includes(id) && !["power", "all", "main", "byproduct"].includes(id)) errors.push(`쓰이지 않는 재료: ${name(id)}`);
}

for (const { milestone, counts, raw, surplus, power, needsFlange } of report) {
  const total = Object.values(counts).reduce((sum, n) => sum + n, 0);
  console.log(`\n${milestone.id} ${milestone.name}: ${name(milestone.goal.item)} ${milestone.goal.perMinute}/분, 납품 ${milestone.goal.amount}`);
  console.log(`  기계 ${total}대: ${Object.entries(counts).map(([id, n]) => `${machines[id].name} ${n}`).join(", ")}`);
  console.log(`  광맥: ${Object.entries(raw).map(([id, r]) => `${name(id)} ${(r.rate * 60).toFixed(1)}/분 (${r.nodes}곳)`).join(", ")}`);
  console.log(`  증기 동력: ${power}`);
  console.log(`  잉여와 부산물: ${surplus.map(([id, rate]) => `${name(id)} ${(rate * 60).toFixed(1)}/분`).join(", ") || "없음"}`);
  if (needsFlange.length) console.log(`  플랜지 필요: ${needsFlange.join(", ")}`);
}

console.log(`\n재료 ${Object.keys(items).length}종, 기계 ${Object.keys(machines).length}종, 레시피 ${recipes.length}개`);
if (errors.length) {
  console.error(`\n오류 ${errors.length}건`);
  errors.forEach((e) => console.error(`  - ${e}`));
  process.exit(1);
}
console.log("검사 통과");
