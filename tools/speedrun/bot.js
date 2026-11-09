// Plays a new game from S0 through S1-1 on the dev server, for tools/speedrun/record.mjs to film.
// It calls the game's own rules through window.__manifold (dev only) instead of moving the mouse, at 4x
// speed, waiting between steps so the screen shows each one. Like the engine's playthrough test, the spring
// motors that run the belts never run down, and the player never goes hungry.
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
  const until = async (test, every = 100, limit = 15 * 60 * 1000) => {
    const end = performance.now() + limit;
    while (!test()) {
      if (performance.now() > end) throw new Error(`gave up waiting at: ${window.__speedrun}`);
      fed();
      await wait(every);
    }
  };
  const store = () => s().nodes.find((n) => n.type === "warehouse");
  const bagHas = (item) => s().inv.reduce((sum, slot) => sum + (slot && C.matches(slot.id, item) ? slot.n : 0), 0);
  /** Brings items from the base warehouse into the bag until it holds n. */
  const fetch = (item, n) => {
    let need = n - bagHas(item);
    for (const slot of store().store) {
      if (need <= 0) break;
      if (!slot || !C.matches(slot.id, item)) continue;
      const take = Math.min(need, slot.n);
      const moved = E.addTo(s().inv, slot.id, take);
      slot.n -= moved;
      need -= moved;
    }
    store().store.forEach((slot, i) => {
      if (slot && !slot.n) store().store[i] = null;
    });
  };
  const place = (type) => {
    const at = E.nextSpot(s());
    const node = E.placeMachine(s(), type, at.x, at.y);
    M.redraw();
    return node;
  };

  /** Walks out to veins of a family, digs, walks home and puts it all in the warehouse. */
  async function gather(family, amount) {
    note(`gather ${family}`);
    let left = amount;
    for (const site of s().sites.filter((x) => C.matches(x.ore, family) && x.cave === undefined)) {
      while (left > 0 && site.left > 0) {
        const before = left;
        E.walkTo(s(), site);
        await until(() => !s().path.length, 50);
        while (left > 0 && E.mine(s())) {
          left -= 1;
          if (left % 4 === 0) await wait(30);
        }
        E.walkTo(s(), W.BASE);
        await until(() => !s().path.length, 50);
        s().inv.forEach((_, i) => E.moveToNode(s(), i, store().id));
        // A trip that dug nothing means the bag or the warehouse is stuck full; stop rather than loop forever.
        if (left === before) throw new Error(`no progress gathering ${family}`);
        M.setScreen("base");
        await wait(300);
      }
      if (left <= 0) return;
    }
  }

  /** Strikes a hand machine on and on, as if on the beat, until a test says it is done. */
  async function hand(id, done, seconds = 1.2) {
    const end = performance.now() + 4 * 60 * 1000;
    while (!done()) {
      if (performance.now() > end) throw new Error(`hand work stuck at: ${window.__speedrun}`);
      fed();
      const node = E.nodeById(s(), id);
      if (C.machineManual(node.type) === "bellows") {
        if ((node.blast ?? 0) < E.BLAST.low + 10) E.workMachine(s(), id);
      } else E.workMachine(s(), id, seconds);
      await wait(150);
    }
  }

  /** Makes a machine on whichever bench makes it, from the warehouse, and sets it down. */
  async function build(type) {
    note(`build ${type}`);
    const bench = s().nodes.find((n) => C.isBuilder(n.type) && C.machineForms(n.type).includes(type));
    const cost = Object.entries(C.machineCost(type));
    for (const [id, n] of cost) {
      fetch(id, n);
      // Raw stuff that ran short (a kiln eats clay) is dug again; anything else short is a bug in the run.
      if (bagHas(id) < n) {
        await gather(id, n - bagHas(id));
        note(`build ${type}`);
        fetch(id, n);
      }
      if (bagHas(id) < n) throw new Error(`short of ${id} for ${type}: ${bagHas(id)}/${n}`);
    }
    E.setForm(s(), bench.id, type);
    E.fillFromBag(s(), bench.id, E.recipeOf(bench), 1);
    await hand(bench.id, () => (bench.outs[type] ?? 0) > 0);
    E.takeOutput(s(), bench.id, type);
    await wait(400);
    const placed = s().nodes.find((n) => n.type === type);
    if (type === "construction_bench" && placed) return placed;
    const at = E.nextSpot(s());
    const node = E.installMachine(s(), type, at.x, at.y);
    if (!node) throw new Error(`could not set down ${type}`);
    M.redraw();
    return node;
  }

  M.setSpeed(4);
  M.setScreen("base");
  await wait(1500);

  // ---- S0: kiln, bloomery, forge, then the construction bench.
  await gather("clay", 60);
  await gather("coal", 40);
  await gather("iron_ore", 18);
  M.setScreen("base");
  const kiln = await build("open_kiln");
  note("fire bricks");
  await until(() => {
    // Only enough clay for the bricks still wanted, so some is left for the bloomery.
    if (!kiln.ins.clay && bagHas("brick") < 18) {
      fetch("clay", 8);
      E.fillFromBag(s(), kiln.id, E.recipeOf(kiln), 4);
    }
    if (!kiln.fuel) {
      fetch("coal", 2);
      E.fillFromBag(s(), kiln.id, E.recipeOf(kiln), Infinity);
    }
    E.takeOutput(s(), kiln.id, "brick");
    return bagHas("brick") >= 18;
  }, 400);
  const bloomery = await build("bloomery");
  note("blow the bloomery");
  fetch("iron_ore", 18);
  fetch("coal", 8);
  E.fillFromBag(s(), bloomery.id, E.recipeOf(bloomery), Infinity);
  await hand(bloomery.id, () => {
    E.takeOutput(s(), bloomery.id, "bloom");
    E.takeOutput(s(), bloomery.id, "slag");
    if (!bloomery.fuel) {
      fetch("coal", 4);
      E.fillFromBag(s(), bloomery.id, E.recipeOf(bloomery), Infinity);
    }
    return bagHas("bloom") >= 6;
  });
  const forge = await build("hand_forge");
  note("forge iron");
  E.fillFromBag(s(), forge.id, E.recipeOf(forge), Infinity);
  await hand(forge.id, () => {
    E.takeOutput(s(), forge.id, "iron");
    return bagHas("iron") >= 4;
  });
  s().inv.forEach((slot, i) => {
    if (slot && slot.id !== "iron" && slot.id !== "brick") E.moveToNode(s(), i, store().id);
  });
  await build("construction_bench");
  await until(() => s().stage >= 1, 200, 20000);
  s().announced = null;
  M.redraw();
  await wait(1500);

  // ---- S1-1: the steam engine unit, from the engine playthrough test.
  await gather("iron_ore", 160);
  await gather("coal", 120);
  await gather("clay", 16);
  await gather("copper_ore", 16);
  M.setScreen("base");
  note("lay out S1-1");
  const add = async (type) => {
    const node = place(type);
    await wait(250);
    return node.id;
  };
  const ids = [];
  for (const type of ["smelter", "smelter", "smelter", "brick_kiln", "plate_hammer", "forming_bench", "forming_bench", "forming_bench", "forming_bench", "forming_bench", "boiler_bench", "engine_bench", "warehouse", "warehouse"]) ids.push(await add(type));
  const [bloom, parts, smelter, brickKiln, hammer, cast, tube, rivet, gear, rod, boiler, engine, yard, ores] = ids;
  E.setForm(s(), cast, "cylinder");
  E.setForm(s(), rivet, "rivet");
  E.setForm(s(), gear, "gear");
  E.setForm(s(), rod, "rod");
  M.redraw();
  // No filters yet, so copper ore and some coal go to a warehouse of their own.
  const main = store().store;
  const copperStore = E.nodeById(s(), ores).store;
  main.forEach((slot, i) => {
    if (slot?.id !== "Ml") return;
    E.addTo(copperStore, slot.id, slot.n);
    main[i] = null;
  });
  const coal = main.find((slot) => slot?.id === "Lg");
  coal.n -= 16;
  E.addTo(copperStore, "Lg", 16);
  const home = store().id;
  const wires = [
    [home, bloom, "all"], [home, parts, "all"], [ores, smelter, "all"],
    [bloom, yard, "byproduct"], [parts, yard, "byproduct"], [smelter, yard, "byproduct"],
    [bloom, hammer, "main"], [bloom, rivet, "main"], [parts, cast, "main"], [parts, gear, "main"], [parts, rod, "main"], [smelter, tube, "main"],
    [hammer, boiler, "main"], [rivet, boiler, "main"], [tube, boiler, "main"], [brickKiln, boiler, "main"],
    [cast, engine, "main"], [boiler, engine, "main"], [gear, engine, "main"], [rod, engine, "main"],
  ];
  note("wire it up");
  for (const [from, to, material] of wires) {
    E.connect(s(), from, to, material);
    M.redraw();
    await wait(200);
  }
  // Belts move on belt drives, and the drives on spring motors.
  note("belt drives");
  for (let i = 0; i < 3; i += 1) {
    const motor = place("spring_motor");
    motor.energy = 1e9;
    for (const target of [[home, ores, yard][i], [bloom, parts, smelter][i]]) {
      const drive = place("belt_drive");
      E.connect(s(), motor.id, drive.id, "power");
      E.connect(s(), drive.id, target, "drive");
      M.redraw();
      await wait(250);
    }
  }
  const kilnNode = E.nodeById(s(), brickKiln);
  kilnNode.ins.clay = { id: "Kn", n: 16 };
  kilnNode.fuel = { id: "Lg", n: 8 };
  note("run S1-1");
  const engineBench = E.nodeById(s(), engine);
  const manual = s().nodes.filter((n) => C.machineManual(n.type) && !C.isBuilder(n.type));
  while (!engineBench.outs.steam_engine_unit) {
    fed();
    for (const node of manual) if (E.status(node) === "manual") E.workMachine(s(), node.id, 1.2);
    for (const motor of s().nodes.filter((n) => n.type === "spring_motor")) motor.energy = 1e9;
    await wait(250);
  }
  E.takeOutput(s(), engine, "steam_engine_unit");
  note("done");
  M.redraw();
  await wait(5000);
  return { stage: s().stage, time: Math.round(s().time / 1000) };
}
