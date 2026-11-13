// A ~30-second teaser for the README, for tools/speedrun/record.mjs (SPEEDRUN_BOT=teaser). It plays a short
// run and marks in window.__keep only the moments worth showing; the recorder cuts the rest. Between those
// moments things are simply set up (a deer laid in front, the warehouse stocked), so nothing waits on luck.
async () => {
  const M = window.__manifold;
  const E = M.engine;
  const C = M.content;
  const W = M.world;
  const s = () => M.game();
  const wait = (ms) => new Promise((done) => setTimeout(done, ms));
  const note = (text) => {
    window.__speedrun = text;
  };
  window.__keep = [];
  let from = null;
  /** Starts or ends a stretch of film to keep. */
  const roll = () => {
    from = Date.now() / 1000;
  };
  const cut = () => {
    if (from !== null) window.__keep.push([from, Date.now() / 1000]);
    from = null;
  };
  const fed = () => {
    s().hp = E.MAX_VITAL;
    s().hunger = E.MAX_VITAL;
  };
  const key = (code) => window.dispatchEvent(new KeyboardEvent("keydown", { code, key: code.slice(3).toLowerCase(), bubbles: true }));
  const store = () => s().nodes.find((n) => n.type === "warehouse");
  const bagHas = (item) => s().inv.reduce((sum, slot) => sum + (slot && C.matches(slot.id, item) ? slot.n : 0), 0);
  const stock = (item, n) => E.addTo(store().store, item, n);
  const toBag = (item, n) => {
    let need = n - bagHas(item);
    store().store.forEach((slot, i) => {
      if (need <= 0 || !slot || !C.matches(slot.id, item)) return;
      const moved = E.addTo(s().inv, slot.id, Math.min(need, slot.n));
      slot.n -= moved;
      need -= moved;
      if (!slot.n) store().store[i] = null;
    });
  };
  const space = () => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Space", key: " ", bubbles: true }));
  const walk = async (to) => {
    E.walkTo(s(), to);
    while (s().path.length || s().halt) {
      fed();
      // Safe mode stops at a river or a climb; for the film, step across.
      if (s().halt) {
        const { target } = s().halt;
        E.setSafeWalk(s(), false);
        E.walkTo(s(), target);
      }
      await wait(50);
    }
    E.setSafeWalk(s(), true);
  };
  /** Holds F on the spot: digs or cuts one after another, the bar under the player and the hand swinging. */
  const dig = async (times) => {
    for (let i = 0; i < times; i += 1) {
      if (!E.startDig(s())) break;
      while (s().dig) {
        fed();
        await wait(60);
      }
      await wait(120);
    }
  };
  async function rhythm(ms) {
    const stop = performance.now() + ms;
    while (performance.now() < stop) {
      fed();
      await wait(Math.max(0, M.beatIn() - 4));
      space();
      await wait(80);
    }
  }
  /** Makes a machine on its bench; with `ms`, on camera with the window open for that long. */
  async function build(type, ms = 0) {
    note(`build ${type}`);
    const bench = s().nodes.find((n) => C.isBuilder(n.type) && C.machineForms(n.type).includes(type));
    // The bench takes the cost from the bag; the warehouse is stocked with it first, so nothing is short.
    for (const [id, n] of Object.entries(C.machineCost(type))) {
      stock(id, n);
      toBag(id, n);
    }
    E.setForm(s(), bench.id, type);
    E.fillFromBag(s(), bench.id, E.recipeOf(bench), 1);
    if (ms) {
      M.openMachine(bench.id);
      await wait(300);
      roll();
      await rhythm(ms);
      cut();
    }
    for (let i = 0; i < 2000 && !((bench.outs[type] ?? 0) > 0); i += 1) E.workMachine(s(), bench.id, 5);
    M.closeMachine();
    E.takeOutput(s(), bench.id, type);
    const at = E.nextSpot(s());
    const node = E.installMachine(s(), type, at.x, at.y);
    M.redraw();
    return node;
  }

  if (s().tutorial) s().tutorial.off = true;
  M.setSpeed(1);
  M.setScreen("map");
  await wait(800);

  // ---- The map: out to the clay by the base and dig it, the bar filling and the hands swinging.
  note("dig");
  s().gear.left = { id: "stone_axe", n: 1 };
  s().gear.right = { id: "stone_pick", n: 1 };
  const clay = s().sites.find((x) => C.matches(x.ore, "clay") && (x.z ?? 0) === 0);
  M.setSpeed(2);
  roll();
  await walk(clay);
  M.setSpeed(1);
  await dig(3);
  cut();

  // ---- A hunt: a spear in hand, a deer close by; then the carcass, cut up in the gathering window.
  note("hunt");
  s().gear.right = { id: "bone_spear", n: 1 };
  s().gear.left = { id: "stone_blade", n: 1 };
  const here = { ...s().player };
  // One cell off: the blade in the other hand hits harder, so it is the one that strikes, and it reaches one.
  const spot = { x: here.x + 1, y: here.y };
  s().facing = { x: 1, y: 0 };
  s().mobs = [{ id: 901, kind: "deer", ...spot, wait: 99999, cool: 0, hp: 4 }];
  M.redraw();
  await wait(300);
  roll();
  await wait(900);
  for (let i = 0; i < 12 && s().mobs.some((m) => m.id === 901); i += 1) {
    s().strikeReady = 0;
    E.attack(s(), 901);
    M.redraw();
    await wait(450);
  }
  await wait(500);
  await walk(spot);
  // The deer may lie on the clay too: then the window lists both, and the carcass is picked.
  const carcass = E.gathersHere(s()).find((g) => g.corpse);
  if (carcass && E.gathersHere(s()).length > 1) {
    M.redraw();
    await wait(900);
    E.pickGather(s(), carcass.key);
    M.redraw();
  }
  await wait(400);
  await dig(3);
  await wait(500);
  cut();

  // ---- The bag and the equipment, side by side.
  note("bag");
  roll();
  key("KeyI");
  await wait(400);
  key("KeyK");
  await wait(2200);
  key("KeyK");
  key("KeyI");
  cut();

  // ---- Home, and the workbench: striking on the beat to make a kiln.
  note("base");
  M.setSpeed(4);
  await walk(W.BASE);
  M.setSpeed(1);
  s().inv.forEach((_, i) => E.moveToNode(s(), i, store().id));
  M.setScreen("base");
  stock("brick", 32);
  stock("wood", 32);
  stock("stone", 32);
  await wait(500);
  await build("open_kiln", 3500);
  await build("tool_bench");
  await wait(300);
  roll();
  await wait(1500);
  cut();

  // ---- The item index: what a stick is for, turned page by page.
  M.index.show("stick", "uses");
  await wait(400);
  roll();
  await wait(2000);
  cut();
  note("done");
  return { stage: s().stage, kept: window.__keep.map(([a, b]) => Math.round((b - a) * 10) / 10) };
}
