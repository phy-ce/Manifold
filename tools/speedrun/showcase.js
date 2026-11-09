// A short tour of the game for a promo video, for tools/speedrun/record.mjs to film (SPEEDRUN_BOT=showcase).
// Unlike bot.js it does not play the whole way: it digs once on the map, then stocks the warehouse and
// shows each hand-work minigame with its window open, struck on the beat with the real Space key, then
// lays out an S1-1 factory and runs it in both node looks, and ends in the item index.
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
  const end = (ms) => performance.now() + ms;

  /** Strikes the open rhythm machine on its beats, for a while or until a test passes. */
  async function rhythm(ms, done = () => false) {
    const stop = end(ms);
    while (performance.now() < stop && !done()) {
      fed();
      await wait(Math.max(0, M.beatIn() - 4));
      space();
      await wait(80);
    }
  }

  /** Keeps the open bellows in its zone by pumping when it sags. */
  async function bellows(node, ms, done = () => false) {
    const stop = end(ms);
    while (performance.now() < stop && !done()) {
      fed();
      if ((node.blast ?? 0) < E.BLAST.low + 15) space();
      await wait(140);
    }
  }

  /** Makes a machine on the bench with its window open, then sets it down. */
  async function build(type, ms) {
    note(`build ${type}`);
    const bench = s().nodes.find((n) => C.isBuilder(n.type) && C.machineForms(n.type).includes(type));
    for (const [id, n] of Object.entries(C.machineCost(type))) toBag(id, n);
    E.setForm(s(), bench.id, type);
    E.fillFromBag(s(), bench.id, E.recipeOf(bench), 1);
    M.openMachine(bench.id);
    const made = () => (bench.outs[type] ?? 0) > 0;
    if (ms) await rhythm(ms, made);
    // Off camera the rest goes quickly.
    while (!made()) E.workMachine(s(), bench.id, 5);
    M.closeMachine();
    E.takeOutput(s(), bench.id, type);
    const placed = s().nodes.find((n) => n.type === type);
    if (type === "construction_bench" && placed) return placed;
    const at = E.nextSpot(s());
    const node = E.installMachine(s(), type, at.x, at.y);
    if (!node) throw new Error(`could not set down ${type}`);
    M.redraw();
    await wait(600);
    return node;
  }

  M.setSpeed(2);
  M.setScreen("base");
  await wait(2500);

  // ---- 1. Out on the map: walk to clay, dig, come home.
  note("map");
  M.setScreen("map");
  await wait(1200);
  const site = s().sites.find((x) => C.matches(x.ore, "clay") && x.cave === undefined);
  M.setSpeed(4);
  E.walkTo(s(), site);
  while (s().path.length) {
    fed();
    await wait(60);
  }
  for (let i = 0; i < 12 && E.mine(s()); i += 1) await wait(120);
  await wait(800);
  E.walkTo(s(), W.BASE);
  while (s().path.length) {
    fed();
    await wait(60);
  }
  s().inv.forEach((_, i) => E.moveToNode(s(), i, store().id));
  M.setScreen("base");
  await wait(1500);

  // From here the warehouse is stocked, so the video shows the work rather than the digging.
  stock(oreOf("clay"), 120);
  stock(oreOf("coal"), 120);
  stock(oreOf("iron_ore"), 120);
  M.redraw();

  // ---- 2. S0 hand work.
  M.setSpeed(1);
  const kiln = await build("open_kiln", 12000);
  note("open kiln");
  toBag("clay", 12);
  toBag("coal", 6);
  E.fillFromBag(s(), kiln.id, E.recipeOf(kiln), 6);
  M.setSpeed(2);
  M.openMachine(kiln.id);
  await wait(9000);
  M.closeMachine();
  E.takeOutput(s(), kiln.id, "brick");
  // Bricks the kiln had no time to fire on camera.
  stock("brick", 40);

  M.setSpeed(1);
  const bloomery = await build("bloomery", 6000);
  note("bloomery");
  toBag("iron_ore", 12);
  toBag("coal", 6);
  E.fillFromBag(s(), bloomery.id, E.recipeOf(bloomery), 4);
  M.openMachine(bloomery.id);
  await bellows(bloomery, 16000);
  M.closeMachine();
  E.takeOutput(s(), bloomery.id, "bloom");
  E.takeOutput(s(), bloomery.id, "slag");
  stock("bloom", 10);

  const forge = await build("hand_forge", 0);
  note("hand forge");
  toBag("bloom", 6);
  E.fillFromBag(s(), forge.id, E.recipeOf(forge), 6);
  M.openMachine(forge.id);
  await rhythm(12000);
  M.closeMachine();
  E.takeOutput(s(), forge.id, "iron");
  s().inv.forEach((slot, i) => {
    if (slot) E.moveToNode(s(), i, store().id);
  });
  stock("iron", 20);

  await build("construction_bench", 10000);
  const stageUp = end(20000);
  while (s().stage < 1 && performance.now() < stageUp) await wait(200);
  M.redraw();
  await wait(3500);
  s().announced = null;
  M.redraw();

  // ---- 3. An S1-1 factory, from the engine playthrough test.
  note("factory");
  stock(oreOf("iron_ore"), 160);
  stock(oreOf("coal"), 120);
  stock(oreOf("clay"), 16);
  const place = (type) => {
    const at = E.nextSpot(s());
    const node = E.placeMachine(s(), type, at.x, at.y);
    M.redraw();
    return node;
  };
  M.setSpeed(4);
  const ids = [];
  for (const type of ["smelter", "smelter", "smelter", "brick_kiln", "plate_hammer", "forming_bench", "forming_bench", "forming_bench", "forming_bench", "forming_bench", "boiler_bench", "engine_bench", "warehouse", "warehouse"]) {
    ids.push(place(type).id);
    await wait(180);
  }
  const [bloom, parts, smelter, brickKiln, hammer, cast, tube, rivet, gear, rod, boiler, engine, yard, ores] = ids;
  E.setForm(s(), cast, "cylinder");
  E.setForm(s(), rivet, "rivet");
  E.setForm(s(), gear, "gear");
  E.setForm(s(), rod, "rod");
  E.addTo(E.nodeById(s(), ores).store, oreOf("copper_ore"), 16);
  E.addTo(E.nodeById(s(), ores).store, oreOf("coal"), 16);
  const home = store().id;
  const wires = [
    [home, bloom, "all"], [home, parts, "all"], [ores, smelter, "all"],
    [bloom, yard, "byproduct"], [parts, yard, "byproduct"], [smelter, yard, "byproduct"],
    [bloom, hammer, "main"], [bloom, rivet, "main"], [parts, cast, "main"], [parts, gear, "main"], [parts, rod, "main"], [smelter, tube, "main"],
    [hammer, boiler, "main"], [rivet, boiler, "main"], [tube, boiler, "main"], [brickKiln, boiler, "main"],
    [cast, engine, "main"], [boiler, engine, "main"], [gear, engine, "main"], [rod, engine, "main"],
  ];
  for (const [from, to, material] of wires) {
    E.connect(s(), from, to, material);
    M.redraw();
    await wait(150);
  }
  for (let i = 0; i < 3; i += 1) {
    const motor = place("spring_motor");
    motor.energy = 1e9;
    for (const target of [[home, ores, yard][i], [bloom, parts, smelter][i]]) {
      const drive = place("belt_drive");
      E.connect(s(), motor.id, drive.id, "power");
      E.connect(s(), drive.id, target, "drive");
      M.redraw();
      await wait(200);
    }
  }
  const kilnNode = E.nodeById(s(), brickKiln);
  kilnNode.ins.clay = { id: oreOf("clay"), n: 16 };
  kilnNode.fuel = { id: oreOf("coal"), n: 8 };
  const manual = s().nodes.filter((n) => C.machineManual(n.type) && !C.isBuilder(n.type));
  const run = async (ms) => {
    const stop = end(ms);
    while (performance.now() < stop) {
      fed();
      for (const node of manual) if (E.status(node) === "manual") E.workMachine(s(), node.id, 1.2);
      for (const motor of s().nodes.filter((n) => n.type === "spring_motor")) motor.energy = 1e9;
      await wait(250);
    }
  };
  const look = (label) => [...document.querySelectorAll(".modes button")].find((b) => b.textContent === label)?.click();
  // Zoom the board out from its top-left corner so the whole factory is in frame.
  const board = document.querySelector(".board-scroll").getBoundingClientRect();
  for (let i = 0; i < 4; i += 1) {
    document.querySelector(".board-scroll").dispatchEvent(new WheelEvent("wheel", { deltaY: 100, clientX: board.left + 2, clientY: board.top + 2, bubbles: true, cancelable: true }));
    await wait(250);
  }
  look("Words");
  await run(20000);
  note("shapes");
  look("Shapes");
  await run(20000);
  M.openMachine(smelter);
  await run(6000);
  M.closeMachine();

  // ---- 4. The item index: how a thing is made, grouped by machine, and its numbers.
  note("index");
  M.index.show("steam_engine_unit");
  await run(5000);
  M.index.show("iron_plate");
  await run(5000);
  M.index.show("steam", "stats");
  await run(5000);
  M.index.toggle();
  look("Words");
  await run(3000);
  note("done");
  return { stage: s().stage, time: Math.round(s().time / 1000) };
}
