// Parts are metal x form, not hand-listed items. This turns the process templates
// into concrete items and recipes. Shared by the game and tools/validate-recipes.mjs.
// Players never pick these recipes: they set a form, and the input metal decides the rest.

/** The machine that makes machines. */
export const CONSTRUCTION = "construction_bench";
/** The hand-work bench the game starts with. It makes the first stage's machines, the construction bench among them. */
export const WORKBENCH = "workbench";
/** Machines whose forms are other machines. */
export const BUILDERS = [WORKBENCH, CONSTRUCTION];
/** The bench where tools are put together from a head and a handle. */
export const TOOL_BENCH = "tool_bench";

export function expandRecipes(era, materials) {
  const items = { ...era.items };
  const variants = {};
  const generated = [];

  for (const template of era.recipeTemplates) {
    const form = materials.forms[template.form];
    // A metal that is a kind of another, as pig iron is a kind of iron, gets that metal's parts too: each one a kind of
    // the parent's part. Tools and products stay the parent's own.
    const kin = ["gear", "product"].includes(form.category) ? [] : Object.keys(materials.metals).filter((id) => template.metals.includes(materials.metals[id].extends) && !template.metals.includes(id));
    for (const metalId of [...template.metals, ...kin]) {
      const metal = materials.metals[metalId];
      const id = `${metalId}_${template.form}`;
      items[id] = metal.name + form.name;
      variants[id] = {
        metal: metalId,
        form: template.form,
        code: metal.code + form.code,
        color: metal.color,
      };
      // Several machines can share a form, each with its own template; later ones name their machine.
      const base = `${template.form}_${metalId}`;
      generated.push({
        id: generated.some((r) => r.id === base) ? `${base}_${template.machine}` : base,
        machine: template.machine,
        form: template.form,
        // Harder metals take longer to work.
        time: Math.max(1, Math.round(template.time * metal.hardness)),
        // Gear takes finished parts besides the metal: rivets for boots, rods for a spear's shaft.
        in: { [metalId]: template.in, ...(template.extra ?? {}) },
        out: { [id]: template.out },
      });
    }
  }

  // Every machine is made on a bench: its cost goes in, the machine item comes out. The machine to
  // make is the bench's form, picked like a shape on the forming bench. The first stage's machines
  // are made by hand on the workbench, and everything after on the construction bench.
  const firstStage = era.milestones[0].unlockMachines;
  const builds = Object.entries(era.machines)
    .filter(([, machine]) => machine.cost)
    .map(([type, machine]) => ({
      id: `build_${type}`,
      machine: firstStage.includes(type) ? WORKBENCH : CONSTRUCTION,
      form: type,
      // The construction bench works in a team's time: half what the machine's own work says.
      time: firstStage.includes(type) ? machine.work ?? 10 : Math.ceil((machine.work ?? 10) / 2),
      in: { ...machine.cost },
      out: { [type]: 1 },
    }));

  // Tools are a material and a kind, as parts are a metal and a form: a stone axe, an iron pick. All are put
  // together on the tool bench, its form the kind and what goes in the material: a head and a handle of sticks.
  // Wood, stone and bone go in as they are; a metal goes in as a head already shaped on the 가공대 or 성형대.
  const tools = [];
  for (const [materialId, material] of Object.entries(era.toolMaterials ?? {})) {
    const metal = materials.metals[materialId];
    for (const [kindId, kind] of Object.entries(era.toolKinds)) {
      const form = materials.forms[kindId];
      const id = `${materialId}_${kindId}`;
      items[id] = material.name + form.name;
      variants[id] = { metal: materialId, form: kindId, code: (material.code ?? metal.code) + form.code, color: material.color ?? metal.color };
      const head = material.head ? { [`${materialId}_${kindId}_head`]: 1 } : { [materialId]: kind.head };
      tools.push({ id: `tool_${id}`, machine: TOOL_BENCH, form: kindId, time: era.toolWork ?? 4, in: { ...head, stick: kind.handle }, out: { [id]: 1 } });
    }
  }

  return { items, variants, recipes: inherit(era.machines, [...generated, ...era.recipes, ...builds, ...tools]) };
}

/**
 * A machine that `inherits` another does all its work too, in half the time: the construction bench builds the
 * first age's machines as well as its own, the forming bench shapes what the 가공대 does by hand. A recipe the
 * heir already has for the same form and product is left as its own.
 */
function inherit(machines, recipes) {
  const out = [...recipes];
  const done = new Set();
  const resolve = (type) => {
    if (done.has(type)) return;
    done.add(type);
    const parent = machines[type]?.inherits;
    if (!parent) return;
    resolve(parent);
    const own = (r) => out.some((o) => o.machine === type && o.form === r.form && Object.keys(o.out).join() === Object.keys(r.out).join());
    for (const r of out.filter((o) => o.machine === parent)) {
      if (own(r)) continue;
      out.push({ ...r, id: `${r.id}_${type}`, machine: type, time: Math.max(1, Math.ceil(r.time / 2)) });
    }
  };
  Object.keys(machines).forEach(resolve);
  return out;
}
