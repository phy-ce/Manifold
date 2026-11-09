// A ~30-second teaser for the README, for tools/speedrun/record.mjs (SPEEDRUN_BOT=teaser). It plays a short
// run and marks in window.__keep only the moments worth showing; the recorder cuts the rest. Between those
// moments the warehouse is simply stocked, so nothing waits on digging.
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
  const store = () => s().nodes.find((n) => n.type === "warehouse");
  const oreOf = (family) => s().sites.find((x) => C.matches(x.ore, family))?.ore ?? family;
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
    while (s().path.length) {
      fed();
      await wait(50);
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
    for (const [id, n] of Object.entries(C.machineCost(type))) toBag(id, n);
    E.setForm(s(), bench.id, type);
    E.fillFromBag(s(), bench.id, E.recipeOf(bench), 1);
    if (ms) {
      M.openMachine(bench.id);
      await wait(300);
      roll();
      await rhythm(ms);
      cut();
    }
    while (!((bench.outs[type] ?? 0) > 0)) E.workMachine(s(), bench.id, 5);
    M.closeMachine();
    E.takeOutput(s(), bench.id, type);
    const placed = s().nodes.find((n) => n.type === type);
    if (type === "construction_bench" && placed) return placed;
    const at = E.nextSpot(s());
    const node = E.installMachine(s(), type, at.x, at.y);
    if (!node) throw new Error(`could not set down ${type}`);
    M.redraw();
    return node;
  }

  M.setSpeed(2);
  M.setScreen("base");
  await wait(1500);

  // ---- The map: out to clay and dig.
  note("map");
  M.setScreen("map");
  await wait(400);
  roll();
  await walk(s().sites.find((x) => C.matches(x.ore, "clay") && x.cave === undefined));
  for (let i = 0; i < 8 && E.mine(s()); i += 1) await wait(110);
  cut();
  await walk(W.BASE);
  s().inv.forEach((_, i) => E.moveToNode(s(), i, store().id));
  M.setScreen("base");
  stock(oreOf("clay"), 120);
  stock(oreOf("coal"), 120);
  stock(oreOf("iron_ore"), 120);
  stock("brick", 40);
  stock("bloom", 10);
  stock("iron", 20);

  // ---- S0 hand work: a rhythm on the workbench, then the bloomery's bellows.
  M.setSpeed(1);
  await build("open_kiln", 3500);
  const bloomery = await build("bloomery");
  toBag("iron_ore", 12);
  toBag("coal", 6);
  E.fillFromBag(s(), bloomery.id, E.recipeOf(bloomery), 4);
  M.openMachine(bloomery.id);
  await wait(300);
  note("bellows");
  roll();
  const stop = performance.now() + 4000;
  while (performance.now() < stop) {
    fed();
    if ((bloomery.blast ?? 0) < E.BLAST.low + 15) space();
    await wait(140);
  }
  cut();
  M.closeMachine();
  await build("hand_forge");
  await build("construction_bench");
  while (s().stage < 1) await wait(100);
  s().announced = null;
  M.redraw();

  // ---- The cave near the base: in among the creatures, dig a vein, and out.
  note("cave");
  M.setSpeed(4);
  M.setScreen("map");
  const door = s().sites.find((x) => x.ore === C.CAVE);
  await walk(door);
  E.enterCave(s());
  M.redraw();
  roll();
  M.setSpeed(2);
  const near = (a) => Math.abs(a.x - s().player.x) + Math.abs(a.y - s().player.y);
  for (let k = 0; k < 2; k += 1) {
    const veins = s().sites.filter((x) => x.cave === door.id && x.left > 0 && near(x) > 0).sort((a, b) => near(a) - near(b));
    if (!veins.length) break;
    await walk(veins[0]);
    for (let i = 0; i < 6 && E.mine(s()); i += 1) await wait(160);
  }
  await wait(600);
  cut();
  M.setSpeed(4);
  await walk(E.currentCave(s()).map.entry);
  E.leaveCave(s());
  await walk(W.BASE);
  s().inv.forEach((_, i) => E.moveToNode(s(), i, store().id));
  M.setScreen("base");

  // ---- A first small line: the warehouse feeds a smelter and a brick kiln, a belt drive turns the belts.
  note("factory");
  M.setSpeed(2);
  // Set down beside the warehouse, in the space below the S0 benches.
  const SPOTS = { smelter: [300, 330], brick_kiln: [300, 454], warehouse: [560, 392], belt_drive: [40, 330], spring_motor: [40, 454] };
  const place = (type) => {
    const [x, y] = SPOTS[type];
    const node = E.placeMachine(s(), type, x, y);
    M.redraw();
    return node;
  };
  const look = (label) => [...document.querySelectorAll(".modes button")].find((b) => b.textContent === label)?.click();
  look("Shapes");
  await wait(300);
  roll();
  const home = store();
  const smelter = place("smelter");
  await wait(400);
  const kiln = place("brick_kiln");
  await wait(400);
  const yard = place("warehouse");
  await wait(400);
  const motor = place("spring_motor");
  await wait(300);
  const drive = place("belt_drive");
  await wait(300);
  for (const [a, b, kind] of [[home.id, smelter.id, "all"], [home.id, kiln.id, "all"], [smelter.id, yard.id, "main"], [kiln.id, yard.id, "main"], [motor.id, drive.id, "power"], [drive.id, home.id, "drive"]]) {
    E.connect(s(), a, b, kind);
    M.redraw();
    await wait(350);
  }
  const run = async (ms) => {
    const end = performance.now() + ms;
    while (performance.now() < end) {
      fed();
      motor.energy = Math.max(motor.energy ?? 0, 5000);
      await wait(250);
    }
  };
  await run(6000);
  cut();

  // ---- The item index: every way to get iron, grouped by machine.
  M.index.show("iron");
  await wait(400);
  roll();
  await run(3500);
  cut();
  note("done");
  return { stage: s().stage, kept: window.__keep.map(([a, b]) => Math.round((b - a) * 10) / 10) };
}
