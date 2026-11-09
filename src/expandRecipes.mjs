// Parts are metal x form, not hand-listed items. This turns the process templates
// into concrete items and recipes. Shared by the game and tools/validate-recipes.mjs.
// Players never pick these recipes: they set a form, and the input metal decides the rest.

/** The machine that makes machines. */
export const CONSTRUCTION = "construction_bench";
/** The hand-work bench the game starts with. It makes the first stage's machines, the construction bench among them. */
export const WORKBENCH = "workbench";
/** Machines whose forms are other machines. */
export const BUILDERS = [WORKBENCH, CONSTRUCTION];

export function expandRecipes(era, materials) {
  const items = { ...era.items };
  const variants = {};
  const generated = [];

  for (const template of era.recipeTemplates) {
    const form = materials.forms[template.form];
    for (const metalId of template.metals) {
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
        in: { [metalId]: template.in },
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
      time: machine.work ?? 10,
      in: { ...machine.cost },
      out: { [type]: 1 },
    }));

  return { items, variants, recipes: [...generated, ...era.recipes, ...builds] };
}
