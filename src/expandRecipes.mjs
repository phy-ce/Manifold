// Parts are metal x form, not hand-listed items. This turns the process templates
// into concrete items and recipes. Shared by the game and tools/validate-recipes.mjs.
// Players never pick these recipes: they set a form, and the input metal decides the rest.

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

  return { items, variants, recipes: [...generated, ...era.recipes] };
}
