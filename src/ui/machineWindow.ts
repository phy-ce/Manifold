// Minecraft-style window: machine slots on top, the player's inventory below.
import { tr } from "../i18n";
import { machineRhythm, isBuilder, stageOpening, WATER, FUELS, machineBurn, buildablesAt, MOTOR, formGroups, formLabel, itemName, processOf, machineDifficulty, machineForms, machineManual, machineName, inputRole, outputRole, ENGINE, MANIFOLD, BELT_DRIVE, PRESSURE_PUMP, MODULE, PUMP, TANK, TAR, isStore, isPassive, indexItems, machinePower, unitOf } from "../content";
import {
  BLAST, inBlastZone, GameNode, GameState, lineKinds, bagCount, riverPipeCost, INV_SLOTS, clickFuel, lacksFuel, SPRING_MAX, STEAM_MAX, TAR_TANK_CAP, canRemove, countOf, fitModule, needsModule, removeModule, setOverflow, expectedOutput, foundRivers, linkRiver, lacksPower, outputCap, powerLoad, riverOf, windMotor, clickInput, clickOutput, clickStack, isFirstWarehouse, moveToNode, nudgeFromStore, nudgeToNode, sortSlots, wheelInput, wheelStack, nodeById, nodeLabel, nodeProcess, recipeOf, failWork, removeNode, setForm, status, takeInput, takeOutput, takeStored, workMachine,
} from "../engine/game";
import { beltSummary } from "./graphView";
import { MachineArt } from "./machineArt";
import { RhythmLane, Strike, replay, sparks } from "./handWork";
import { SOUND } from "./sound";
import { CLICK, keyHintHtml } from "./keyHint";
import { makeSlot, paintSlot } from "./slots";

const KEYS = ["A", "S", "D", "F"];
const STATE_LABEL: Record<string, string> = { run: tr("가동 중"), idle: tr("재료 부족"), blocked: tr("출력 막힘") };

/** A recipe side in role words. The tooltip names the real item. */
const parts = (list: Record<string, number>, role: (id: string, index: number) => string): string =>
  Object.entries(list)
    .map(([id, n], i) => `<span data-tip="${itemName(id)}">${role(id, i)}</span> ${n}${unitOf(id)}`)
    .join(" + ");
const HIT_MS = 140;
/** The pose of each hand tool at the bottom of its stroke, as an art frame. */
const STRIKE_FRAME: Record<string, number> = { plate_hammer: 4, hand_forge: 4, workbench: 4, construction_bench: 6 };
/** Where sparks fly from when no machine-specific spot is known, and their colour by machine. */
const SPARK_AT = { x: 140, y: 170 };
/** A point of a scene, from art.ts scene units to pixels over the picture (glyph 6px wide by 0.6, rows squashed by 0.62). */
const spot = (x: number, y: number) => ({ x: Math.round(x * 3.6), y: Math.round(y * 0.62 * 6) });
/** Where each hand tool meets its work at the bottom of the stroke: only there flashes. */
const STRIKE_AT: Record<string, { x: number; y: number }> = {
  plate_hammer: spot(36, 44), hand_forge: spot(37, 37), workbench: spot(45, 24), construction_bench: spot(27, 29),
};
/** Where each fire shows: only there flickers, and embers rise from it. */
const FIRE_AT: Record<string, { x: number; y: number }> = {
  bloomery: spot(40, 57), brick_kiln: spot(38, 52), open_kiln: spot(38, 56),
  blast_furnace: spot(36, 62), converter: spot(37, 15), steam_boiler: spot(28, 56),
};
/** Where steam leaves: the engine's exhaust, the boiler's valve, the hammer's exhaust pipe. How often at full work, in ms. */
const STEAM_AT: Record<string, { x: number; y: number }> = {
  steam_engine: spot(29, 11), steam_boiler: spot(71, 17), steam_hammer: spot(59, 32),
};
const STEAM_MS = 1000;
/** Where a freshly struck piece stays hot for a moment after the blow, and how long it takes to go dark, in ms. */
const AFTERGLOW_AT: Record<string, { x: number; y: number }> = { hand_forge: STRIKE_AT.hand_forge, plate_hammer: STRIKE_AT.plate_hammer };
const AFTERGLOW_MS = 1400;
/** Where the steam hammer's head meets the work. */
const HAMMER_AT = spot(36.5, 55);
/** How quickly the picture catches up with how lively the machine is: the time constant, in seconds. */
const EASE_S = 0.4;
/** The most poses a second a machine moves through, at full tilt. */
const POSE_RATE = 5;
/** A fuel piece's flame weakens only over its last part, this fraction of it. */
const FADE_PART = 0.3;
/** Eases 0..1 in and out, so a light neither snaps on nor stops dead. */
const smooth = (x: number): number => {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
};
const SPARK_COLOR: Record<string, string> = { plate_hammer: "#ffcd72", hand_forge: "#ffb238", workbench: "#c49a68", construction_bench: "#ffd58c" };
/** Embers rise from a working fire this often, in ms. */
const EMBER_MS = 260;
/** How long a strike's verdict stays on the status line. */
const VERDICT_MS = 700;

export class MachineWindow {
  readonly root = document.createElement("div");
  private readonly title = document.createElement("h2");
  private readonly top = document.createElement("div");
  private readonly modes = document.createElement("div");
  private readonly recipe = document.createElement("div");
  private readonly sort = document.createElement("button");
  private readonly moduleButton = document.createElement("button");
  private readonly keys = document.createElement("div");
  private readonly keycaps: HTMLButtonElement[] = [];
  private workBox: HTMLButtonElement | null = null;
  /** The firebox slot, for machines that burn fuel. */
  private fuelSlot: HTMLButtonElement | null = null;
  private target = 0;
  private hitAt = 0;
  private readonly bar = document.createElement("pre");
  private readonly inv = document.createElement("div");
  /** The player's inventory with its label, set apart from the machine's own slots. */
  private readonly invBox = document.createElement("section");
  /** Names a warehouse's own slots, so they don't read as the player's. */
  private readonly topLabel = document.createElement("div");
  private readonly demolish = document.createElement("button");
  private disarm = 0;
  private readonly invSlots: HTMLButtonElement[] = [];
  private inputs: [string, HTMLButtonElement][] = [];
  private outputs: [string[], HTMLButtonElement][] = [];
  /** A riverbank picked on a pump but not linked yet, and the tube its pipe would be laid with. */
  private riverPick: { pump: number; bank: number; tube: string } | null = null;
  private stored: HTMLButtonElement[] = [];
  private readonly art = new MachineArt();
  /** The beat a rhythm machine is struck to, and what the last strike was judged. */
  private readonly lane: RhythmLane;
  private struck: (Strike & { at: number }) | null = null;
  /** A hand furnace's bellows gauge, beside its picture. */
  private readonly gauge = document.createElement("div");
  private readonly gaugeFill = document.createElement("div");
  /** Sparks and embers fly over the picture from here. */
  private readonly fx = document.createElement("span");
  private emberAt = 0;
  private steamAt = 0;
  /** A warm glow over a fire's own spot, and the brief flash where a tool lands. */
  private readonly fireGlow = document.createElement("span");
  private nodeId: number | null = null;
  /** How lively the open machine looks, eased toward the real thing; where its motion has got to; when it was drawn. */
  private live = 0;
  private fresh = true;
  private phase = 0;
  private drawnAt = 0;
  /** How far the work had got when the fire went out, for the embers to die with it. */
  private coolFrom = 0;

  /** `speed` is the game speed: hand work keeps time with it, and none is taken while paused. */
  constructor(private readonly game: () => GameState, private readonly changed: () => void, private readonly speed: () => number = () => 1) {
    this.lane = new RhythmLane(speed);
    this.root.className = "window-back";
    this.root.hidden = true;
    const panel = document.createElement("div");
    panel.className = "window machine-window";
    panel.setAttribute("role", "dialog");
    const head = document.createElement("div");
    head.className = "bar-row";
    const close = document.createElement("button");
    close.type = "button";
    close.className = "tech push";
    close.textContent = "x";
    close.setAttribute("aria-label", tr("닫기"));
    close.addEventListener("click", () => this.close());
    this.demolish.type = "button";
    this.demolish.className = "tech demolish";
    this.demolish.addEventListener("click", () => this.onDemolish());
    close.classList.remove("push");
    this.sort.type = "button";
    this.sort.className = "tech push";
    this.sort.textContent = tr("정렬");
    this.moduleButton.type = "button";
    this.moduleButton.className = "tech";
    this.moduleButton.addEventListener("click", () => {
      const s = this.game();
      const node = this.nodeId === null ? undefined : nodeById(s, this.nodeId);
      if (!node) return;
      if (node.module) removeModule(s, node.id);
      else fitModule(s, node.id);
      this.changed();
    });
    head.append(this.title, this.moduleButton, this.sort, this.demolish, close);
    this.bar.className = "window-bar";
    this.inv.className = "slot-grid";
    for (let i = 0; i < INV_SLOTS; i += 1) {
      const b = makeSlot((e) => {
        const s = this.game();
        if (e.shiftKey && this.nodeId !== null) moveToNode(s, i, this.nodeId);
        else clickStack(s, s.inv, i, "left");
        this.changed();
      }, {
        right: () => {
          clickStack(this.game(), this.game().inv, i, "right");
          this.changed();
        },
        wheel: (way) => {
          const s = this.game();
          if (s.cursor) wheelStack(s, s.inv, i, way);
          else if (way === "in" && this.nodeId !== null) nudgeToNode(s, i, this.nodeId);
          this.changed();
        },
      });
      b.dataset.inv = String(i);
      this.invSlots.push(b);
      this.inv.append(b);
    }
    this.modes.className = "modes";
    this.keys.className = "keys";
    KEYS.forEach((key, i) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "keycap";
      b.textContent = key;
      b.setAttribute("aria-label", `${key} ${tr("키")}`);
      b.addEventListener("click", () => this.pressKey(i));
      this.keycaps.push(b);
      this.keys.append(b);
    });
    window.addEventListener("keydown", (e) => {
      if (e.target instanceof HTMLInputElement) return; // typing in the item search
      // Held keys repeat: only the first press counts, or one hold would strike many times.
      if (e.repeat || this.nodeId === null) return;
      const index = KEYS.indexOf(e.key.toUpperCase());
      if (index >= 0) return this.pressKey(index);
      // Space works a rhythm machine or a bellows. Its default would also click whatever button has
      // focus, which would count the strike twice.
      if (e.code === "Space") {
        const node = nodeById(this.game(), this.nodeId);
        const manual = node && machineManual(node.type);
        if (manual === "rhythm" || manual === "bellows") {
          e.preventDefault();
          this.act(e.timeStamp);
        }
      }
    });
    this.gauge.className = "blast-gauge";
    this.gauge.setAttribute("role", "img");
    this.gaugeFill.className = "blast-fill";
    this.gauge.append(this.gaugeFill);
    this.fx.className = "work-fx";
    this.fx.setAttribute("aria-hidden", "true");
    this.fireGlow.className = "fire-glow";
    this.fireGlow.hidden = true;
    this.fx.append(this.fireGlow);
    this.recipe.className = "recipe";
    this.topLabel.className = "slot-label";
    this.invBox.className = "inv-box";
    const invLabel = document.createElement("div");
    invLabel.className = "slot-label";
    invLabel.textContent = tr("내 인벤토리");
    this.invBox.append(invLabel, this.inv);
    panel.append(head, this.modes, this.recipe, this.topLabel, this.top, this.lane.root, this.bar, this.keys, this.invBox);
    this.root.append(panel);
    this.root.addEventListener("click", (e) => {
      if (e.target === this.root) this.close();
    });
    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape") this.close();
    });
  }

  /** One unit of hand work. */
  /** A brief flash where a tool lands, and nowhere else. */
  private flashAt(point: { x: number; y: number }): void {
    const flash = document.createElement("span");
    flash.className = "strike-flash";
    flash.style.left = `${point.x}px`;
    flash.style.top = `${point.y}px`;
    this.fx.append(flash);
    setTimeout(() => flash.remove(), 160);
  }

  /**
   * One unit of hand work, at the moment of the input that made it: a key's or a press's own
   * timeStamp, never the time the frame gets round to it. Rhythm machines judge it against the beat,
   * a bellows pumps, and anything else simply strikes.
   */
  private act(time: number): void {
    const s = this.game();
    const node = this.nodeId === null ? undefined : nodeById(s, this.nodeId);
    // Paused, the beat stands and the fire holds still, so hand work waits too.
    if (!node || status(node) !== "manual" || !this.speed()) return;
    const manual = machineManual(node.type);
    // What has come out so far, to hear when this strike finishes something.
    const made = Object.values(node.outs).reduce((sum, n) => sum + n, 0);
    if (manual === "rhythm") {
      const strike = this.lane.judge(time);
      this.struck = { ...strike, at: performance.now() };
      if (strike.verdict === "miss") {
        failWork(s, node.id);
        SOUND.miss();
        if (this.workBox) replay(this.workBox, "nudge");
      } else if (workMachine(s, node.id, strike.seconds)) {
        this.hitAt = performance.now();
        SOUND[strike.verdict]();
        if (this.workBox) replay(this.workBox, strike.verdict === "exact" ? "nudge-hard" : "nudge");
        this.flashAt(STRIKE_AT[node.type] ?? SPARK_AT);
        const hit = STRIKE_AT[node.type] ?? SPARK_AT;
        sparks(this.fx, hit.x, hit.y, SPARK_COLOR[node.type] ?? "#ffcd72", strike.verdict === "exact" ? 7 : 4, strike.verdict === "exact" ? 46 : 30);
      }
    } else if (manual === "bellows") {
      if (!workMachine(s, node.id)) return;
      this.hitAt = performance.now();
      replay(this.gauge, "nudge");
      SOUND.bellows();
      sparks(this.fx, SPARK_AT.x + 80, SPARK_AT.y + 20, "#7c8b9b", 3, 26, "~-");
      // Overheated just now: the batch burnt.
      if (node.burstAt === s.time) {
        SOUND.burst();
        if (this.workBox) replay(this.workBox, "nudge-hard");
        const fire = FIRE_AT[node.type] ?? SPARK_AT;
        sparks(this.fx, fire.x, fire.y, "#ff5f56", 16, 90, "*#%");
      }
    } else {
      if (!workMachine(s, node.id)) return;
      this.hitAt = performance.now();
    }
    if (Object.values(node.outs).reduce((sum, n) => sum + n, 0) > made) SOUND.done();
    this.changed();
  }

  /** The right key advances the work and calls for the next; a wrong one does nothing. */
  private pressKey(index: number): void {
    const node = this.nodeId === null ? undefined : nodeById(this.game(), this.nodeId);
    if (!node || machineManual(node.type) !== "keys" || status(node) !== "manual") return;
    if (index !== this.target) {
      failWork(this.game(), node.id);
      this.changed();
      const cap = this.keycaps[index];
      cap.classList.add("wrong");
      setTimeout(() => cap.classList.remove("wrong"), HIT_MS);
      return;
    }
    this.act(performance.now());
    let next = this.target;
    while (next === this.target) next = Math.floor(Math.random() * KEYS.length);
    this.target = next;
    // Show the next key at once: the frame loop is too slow for quick typing.
    this.keycaps.forEach((cap, i) => cap.classList.toggle("target", i === next));
  }

  /** First press arms the button; a second press within a few seconds demolishes. */
  private onDemolish(): void {
    if (this.nodeId === null) return;
    if (!this.demolish.classList.contains("armed")) {
      this.demolish.classList.add("armed");
      this.demolish.textContent = tr("정말 철거?");
      this.disarm = window.setTimeout(() => this.resetDemolish(), 3000);
      return;
    }
    removeNode(this.game(), this.nodeId);
    this.close();
    this.changed();
  }

  private resetDemolish(): void {
    window.clearTimeout(this.disarm);
    this.demolish.classList.remove("armed");
    this.demolish.textContent = tr("철거");
  }

  get isOpen(): boolean {
    return this.nodeId !== null;
  }

  /** Real ms until the open rhythm machine's next beat. */
  beatIn(): number {
    return this.lane.msToNextBeat();
  }

  /** The machine open right now, if any. */
  get openNode(): number | null {
    return this.nodeId;
  }

  open(id: number): void {
    const node = nodeById(this.game(), id);
    if (!node) return;
    this.nodeId = id;
    this.title.textContent = machineName(node.type);
    this.resetDemolish();
    this.demolish.hidden = isFirstWarehouse(this.game(), node);
    this.sort.hidden = true;
    this.buildForms(node);
    this.top.replaceChildren();
    this.workBox = null;
    this.keys.hidden = machineManual(node.type) !== "keys";
    // A rhythm machine shows its beat, which starts over each time the window opens on it.
    const rhythm = machineManual(node.type) === "rhythm";
    this.lane.root.hidden = !rhythm;
    if (rhythm) this.lane.start(machineRhythm(node.type));
    else this.lane.stop();
    this.struck = null;
    // A window opens on the machine as it is, not fading in from dark.
    this.fresh = true;
    this.phase = 0;
    this.coolFrom = 0;
    this.inputs = [];
    this.outputs = [];
    this.stored = [];
    delete this.art.root.dataset.scene;
    if (isStore(node.type)) this.buildWarehouse(node);
    else if (node.type === MANIFOLD || node.type === BELT_DRIVE || node.type === PRESSURE_PUMP) this.top.className = "machine";
    else if (node.type === TANK) {
      this.top.className = "machine";
      this.top.append(this.art.root);
    }
    else if (node.type === MOTOR) this.buildMotor(node);
    else this.buildMachine(node);
    // Nothing goes in or out of these by hand, so the player's inventory would only confuse.
    this.invBox.hidden = node.type === MANIFOLD || node.type === BELT_DRIVE || node.type === PRESSURE_PUMP || node.type === MOTOR || node.type === TANK;
    this.topLabel.hidden = !isStore(node.type);
    this.topLabel.textContent = `${nodeLabel(this.game(), node)} ${tr("안")}`;
    this.top.classList.toggle("store-grid", isStore(node.type));
    this.root.hidden = false;
    this.draw(0);
  }

  close(): void {
    this.nodeId = null;
    this.lane.stop();
    this.root.hidden = true;
  }

  /** The player sets the shape; the metal that goes in decides the rest. */
  private buildForms(node: GameNode): void {
    const all = isStore(node.type) ? [] : machineForms(node.type);
    // A bench offers only the machines open so far.
    const open = buildablesAt(this.game().stage);
    const forms = isBuilder(node.type) ? all.filter((type) => open.includes(type)) : all;
    this.modes.replaceChildren();
    this.modes.hidden = forms.length < 2;
    if (forms.length >= 2) this.buildFormPicker(node, forms);
    this.buildCodexLinks(node);
    if (node.type === PUMP) this.buildRivers(node);
    if (node.type === TANK) this.buildOverflow(node);
  }

  /**
   * Shapes grouped like the stage list on the base: pointing at a category drops down its
   * shapes. A search box finds a shape by its name or by what it makes, such as "철관".
   */
  private buildFormPicker(node: GameNode, forms: string[]): void {
    const pick = (form: string) => {
      setForm(this.game(), node.id, form);
      this.open(node.id);
      this.changed();
    };
    const button = (form: string) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = `tech ${form === node.form ? "selected" : ""}`;
      b.dataset.form = form;
      b.textContent = formLabel(form);
      b.addEventListener("click", () => pick(form));
      return b;
    };
    for (const [label, inCategory] of formGroups(node.type, forms, this.game().stage)) {
      const group = document.createElement("div");
      group.className = "tier";
      const head = document.createElement("button");
      head.type = "button";
      head.className = `tech form-pick ${inCategory.includes(node.form) ? "selected" : ""}`;
      // Which shapes the group holds, so the tutorial can point at the group with the one it wants.
      head.dataset.forms = inCategory.join(" ");
      head.textContent = inCategory.includes(node.form) ? `${label}: ${formLabel(node.form)}` : label;
      const list = document.createElement("div");
      list.className = "tier-list";
      list.append(...inCategory.map(button));
      group.append(head, list);
      this.modes.append(group);
    }
    const search = document.createElement("input");
    search.type = "search";
    search.className = "form-search";
    const hint = isBuilder(node.type) ? tr("기계 찾기") : tr("형태 찾기");
    search.placeholder = hint;
    search.setAttribute("aria-label", hint);
    const results = document.createElement("div");
    results.className = "form-results";
    // A shape matches by its own name or by any item it turns out.
    const names = (form: string) => [formLabel(form), ...processOf(node.type, form).outputs.map(itemName)].map((t) => t.toLowerCase());
    const found = () => {
      const query = search.value.trim().toLowerCase();
      return query ? forms.filter((form) => names(form).some((t) => t.includes(query))) : [];
    };
    search.addEventListener("input", () => results.replaceChildren(...found().map(button)));
    search.addEventListener("keydown", (e) => {
      const first = found()[0];
      if (e.key === "Enter" && first) pick(first);
    });
    this.modes.append(search, results);
  }

  /**
   * One click to the index at what this machine is making now (its shape, or the recipe its inputs pick), where
   * the recipe's + fills the inputs from the bag. Read at the click, so a shape chosen since is followed.
   */
  private buildCodexLinks(node: GameNode): void {
    if (isPassive(node.type) || node.type === MOTOR) return;
    const known = new Set(indexItems(this.game().stage));
    const making = (): string | undefined => {
      const current = nodeById(this.game(), node.id);
      if (!current) return undefined;
      const id = Object.keys(recipeOf(current).out)[0] ?? Object.keys(processOf(current.type, current.form).recipes[0]?.out ?? {})[0];
      return id && known.has(id) ? id : undefined;
    };
    if (!making()) return;
    this.modes.hidden = false;
    const go = document.createElement("button");
    go.type = "button";
    go.className = "tech codex-go";
    go.textContent = tr("도감으로 이동");
    go.addEventListener("click", () => {
      const id = making();
      if (id) this.showItem?.(id);
    });
    this.modes.append(go);
  }

  /** Opens an item's page in the codex. Set by the game once the codex exists. */
  showItem?: (id: string) => void;

  /** What a tar tank does when it is full. */
  private buildOverflow(node: GameNode): void {
    this.modes.hidden = false;
    const choices = [["refuse", tr("입력 안 받기"), tr("가득 차면 더 받지 않습니다. 코크스로가 멈출 수 있습니다")], ["discard", tr("초과 폐기"), tr("가득 차면 넘치는 타르를 버립니다")]] as const;
    for (const [overflow, label, tip] of choices) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = `tech ${(node.overflow ?? "refuse") === overflow ? "selected" : ""}`;
      b.textContent = label;
      b.dataset.tip = tip;
      b.addEventListener("click", () => {
        setOverflow(this.game(), node.id, overflow);
        this.open(node.id);
        this.changed();
      });
      this.modes.append(b);
    }
  }

  /** A pump chooses its riverbank here, from the ones the player has found. */
  private buildRivers(node: GameNode): void {
    const s = this.game();
    const linked = riverOf(s, node);
    const banks = foundRivers(s);
    this.modes.hidden = false;
    if (!banks.length) {
      const note = document.createElement("span");
      note.className = "card-note";
      note.textContent = tr("지도에서 강가를 먼저 찾아야 합니다");
      this.modes.append(note);
      return;
    }
    // A pick belongs to the pump it was made on.
    if (this.riverPick?.pump !== node.id) this.riverPick = null;
    const redraw = () => {
      this.open(node.id);
      this.changed();
    };
    // The pipe out to a bank takes one tube a cell, from the bag. Picking a bank only asks; nothing is spent yet.
    for (const bank of banks) {
      const on = linked?.id === bank.id;
      const b = document.createElement("button");
      b.type = "button";
      b.className = `tech ${on || this.riverPick?.bank === bank.id ? "selected" : ""}`;
      b.textContent = `${tr("강가")} ${bank.code} · ${tr("배관")} ${riverPipeCost(bank)}`;
      b.dataset.tip = on ? tr("다시 누르면 연결을 끊고 관을 돌려받습니다") : tr("이 강가에서 물을 끌어옵니다");
      b.addEventListener("click", () => {
        if (on) {
          linkRiver(s, node.id, bank.id);
          this.riverPick = null;
        } else this.riverPick = { pump: node.id, bank: bank.id, tube: this.riverPick?.tube ?? lineKinds("fluid")[0] };
        redraw();
      });
      this.modes.append(b);
    }
    const pick = this.riverPick;
    const bank = pick && banks.find((b) => b.id === pick.bank);
    if (!pick || !bank) return;
    // The pipe is laid all of one tube, picked here. Only names and counts: how tubes perform is in the index.
    const cost = riverPipeCost(bank);
    const ask = document.createElement("div");
    ask.className = "river-ask";
    const say = document.createElement("span");
    say.textContent = `${tr("강가")} ${bank.code}${tr("까지 관")} ${cost}${tr("개를 놓습니다")}`;
    ask.append(say);
    for (const tube of lineKinds("fluid")) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = `tech ${tube === pick.tube ? "selected" : ""}`;
      b.textContent = `${itemName(tube)} ${bagCount(s, tube)}`;
      b.setAttribute("aria-pressed", String(tube === pick.tube));
      b.addEventListener("click", () => {
        pick.tube = tube;
        redraw();
      });
      ask.append(b);
    }
    const lay = document.createElement("button");
    lay.type = "button";
    lay.className = "tech";
    lay.textContent = tr("연결");
    lay.disabled = bagCount(s, pick.tube) < cost;
    lay.dataset.tip = lay.disabled ? `${tr("인벤토리에")} ${itemName(pick.tube)} ${bagCount(s, pick.tube)}/${cost}` : "";
    lay.addEventListener("click", () => {
      if (linkRiver(s, node.id, bank.id, pick.tube)) this.riverPick = null;
      redraw();
    });
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "tech";
    cancel.textContent = tr("취소");
    cancel.addEventListener("click", () => {
      this.riverPick = null;
      redraw();
    });
    ask.append(lay, cancel);
    this.modes.append(ask);
  }

  private buildMachine(node: GameNode): void {
    this.top.className = "machine";
    const { slots, outSlots } = nodeProcess(node);
    const left = document.createElement("div");
    left.className = "stack";
    const right = document.createElement("div");
    right.className = "stack";
    for (const { key } of slots) {
      const b = makeSlot((e) => {
        if (e.shiftKey) takeInput(this.game(), node.id, key);
        else clickInput(this.game(), node.id, key, "left");
        this.changed();
      }, {
        right: () => {
          clickInput(this.game(), node.id, key, "right");
          this.changed();
        },
        wheel: (way) => {
          wheelInput(this.game(), node.id, key, way);
          this.changed();
        },
      });
      this.inputs.push([key, b]);
      left.append(b);
    }
    // A machine with a firebox gets a fuel slot below its materials.
    this.fuelSlot = null;
    if (machineBurn(node.type)) {
      const b = makeSlot(() => {
        clickFuel(this.game(), node.id, "left");
        this.changed();
      }, {
        right: () => {
          clickFuel(this.game(), node.id, "right");
          this.changed();
        },
      });
      b.classList.add("fuel");
      this.fuelSlot = b;
      left.append(b);
    }
    for (const held of outSlots) {
      const b = makeSlot((e) => {
        const item = held.find((id) => node.outs[id] > 0);
        if (item && e.shiftKey) takeOutput(this.game(), node.id, item);
        else if (item) clickOutput(this.game(), node.id, item, "left");
        this.changed();
      }, {
        right: () => {
          const item = held.find((id) => node.outs[id] > 0);
          if (item) clickOutput(this.game(), node.id, item, "right");
          this.changed();
        },
      });
      this.outputs.push([held, b]);
      right.append(b);
    }
    this.workBox = document.createElement("button");
    this.workBox.type = "button";
    this.workBox.className = "work";
    this.workBox.setAttribute("aria-label", `${machineName(node.type)} ${tr("작업")}`);
    this.workBox.append(this.art.root, this.fx);
    // Pressing down is the strike: a click only fires on release, a tenth of a second late for a beat.
    this.workBox.addEventListener("pointerdown", (e) => {
      if (e.button !== 0 || !machineManual(node.type) || machineManual(node.type) === "keys") return;
      this.act(e.timeStamp);
    });
    // A bellows has its gauge at the far right, after what comes out.
    const bellows = machineManual(node.type) === "bellows";
    if (bellows) this.gauge.onpointerdown = (e) => { if (e.button === 0) this.act(e.timeStamp); };
    this.top.append(left, this.workBox, right, ...(bellows ? [this.gauge] : []));
  }

  private buildMotor(node: GameNode): void {
    this.top.className = "machine";
    this.workBox = document.createElement("button");
    this.workBox.type = "button";
    this.workBox.className = "work";
    this.workBox.setAttribute("aria-label", tr("태엽 감기"));
    this.workBox.append(this.art.root);
    this.workBox.addEventListener("click", () => {
      if (windMotor(this.game(), node.id)) this.hitAt = performance.now();
      this.changed();
    });
    this.top.append(this.workBox);
  }

  private buildWarehouse(node: GameNode): void {
    this.top.className = "slot-grid";
    this.sort.hidden = false;
    this.sort.onclick = () => {
      sortSlots(node.store);
      this.changed();
    };
    node.store.forEach((_, i) => {
      const b = makeSlot((e) => {
        if (e.shiftKey) takeStored(this.game(), node.id, i);
        else clickStack(this.game(), node.store, i, "left");
        this.changed();
      }, {
        right: () => {
          clickStack(this.game(), node.store, i, "right");
          this.changed();
        },
        wheel: (way) => {
          const s = this.game();
          if (s.cursor) wheelStack(s, node.store, i, way);
          else if (way === "out") nudgeFromStore(s, node.id, i);
          this.changed();
        },
      });
      this.stored.push(b);
      this.top.append(b);
    });
  }

  /**
   * How hard a machine is going, 0 to 1. A bellows furnace burns as hard as it is blown. Any other fire
   * burns steadily and weakens over the last part of each fuel piece; once out, it dies down with the
   * work as that cools. Everything else is simply running or not.
   */
  private liveliness(node: GameNode, state: string, lit: boolean, bellows: boolean, waiting: boolean): number {
    if (bellows) return waiting && lit ? 0.25 + 0.75 * Math.min(1, (node.blast ?? 0) / BLAST.max) : 0;
    if (machineBurn(node.type)) {
      if (lit) {
        this.coolFrom = 0;
        return smooth((node.heat ?? 0) / (node.heatFull || 1) / FADE_PART);
      }
      if (node.progress <= 0) return 0;
      this.coolFrom = Math.max(this.coolFrom, node.progress);
      return 0.35 * smooth(node.progress / this.coolFrom);
    }
    return state === "run" ? 1 : 0;
  }

  draw(frame: number): void {
    if (this.nodeId === null) return;
    const s = this.game();
    const node = nodeById(s, this.nodeId);
    if (!node) return this.close();
    const label = nodeLabel(s, node);
    if (this.title.textContent !== label) this.title.textContent = label;
    s.inv.forEach((stack, i) => paintSlot(this.invSlots[i], stack));
    this.demolish.disabled = !canRemove(s, node);
    this.demolish.dataset.tip = this.demolish.disabled ? tr("창고를 비워야 철거할 수 있습니다") : "";
    this.recipe.hidden = isStore(node.type);
    this.moduleButton.hidden = s.stage < stageOpening(WATER) || !needsModule(node);
    if (!this.moduleButton.hidden) {
      const owned = countOf(s, MODULE);
      const label = node.module ? tr("증기 모듈 빼기") : `${tr("증기 모듈 장착")} (${owned})`;
      if (this.moduleButton.textContent !== label) this.moduleButton.textContent = label;
      this.moduleButton.disabled = !node.module && owned < 1;
      this.moduleButton.dataset.tip = node.module ? tr("빼면 증기 동력 선이 끊어집니다") : tr("장착해야 증기 동력을 받을 수 있습니다");
    }
    if (node.type === TANK) {
      const line = `${tr("콜타르")} ${node.ins[TAR]?.n ?? 0}/${TAR_TANK_CAP}L`;
      if (this.recipe.dataset.line !== line) {
        this.recipe.dataset.line = line;
        this.recipe.textContent = line;
      }
      if (this.art.root.dataset.scene !== "tank") {
        this.art.root.dataset.scene = "tank";
        this.art.show(node.type, "idle", 0);
      }
      this.bar.textContent = "";
      return;
    }
    if (node.type === MANIFOLD || node.type === BELT_DRIVE || node.type === PRESSURE_PUMP) {
      const line = node.type === BELT_DRIVE
        ? `${tr("받은 동력으로 연결된 물류망의 벨트를 모두 같은 속도로 돌립니다")} · ${beltSummary(node, true)}`
        : node.type === PRESSURE_PUMP
        ? `${tr("받은 동력으로 연결된 유체망의 관을 모두 같은 속도로 밀어 보냅니다")} · ${beltSummary(node, true)}`
        : tr("들어온 동력을 연결된 곳으로 나눕니다");
      if (this.recipe.dataset.line !== line) {
        this.recipe.dataset.line = line;
        this.recipe.textContent = line;
      }
      this.bar.textContent = "";
      return;
    }
    if (node.type === MOTOR) {
      const winding = performance.now() - this.hitAt < HIT_MS;
      const scene = `motor|${winding ? frame >> 1 : ""}`;
      if (this.art.root.dataset.scene !== scene) {
        this.art.root.dataset.scene = scene;
        this.art.show(node.type, winding ? "run" : "idle", frame);
      }
      const load = powerLoad(s, node);
      const line = `${tr("힘")} ${Math.floor(node.energy)}/${SPRING_MAX}<span class="card-note">${tr("동력")} ${load.now}/${load.limit} · ${tr("연결")} ${load.connected}</span><span class="state manual">${tr("그림을 클릭해서 감으세요")}</span>`;
      if (this.recipe.dataset.line !== line) {
        this.recipe.dataset.line = line;
        this.recipe.innerHTML = line;
      }
      const fill = Math.round((node.energy / SPRING_MAX) * 18);
      this.bar.className = "window-bar";
      this.bar.textContent = `[${"#".repeat(fill).padEnd(18, ".")}]`;
      return;
    }
    if (isStore(node.type)) {
      node.store.forEach((stack, i) => paintSlot(this.stored[i], stack));
      this.bar.textContent = "";
      return;
    }
    const state = status(node);
    const current = recipeOf(node);
    const style = machineManual(node.type);
    // What to press, as a key hint: a keycap and a word. The gauge and the picture say the rest.
    const hand = style === "keys" ? keyHintHtml(tr("키"), tr("입력")) : style === "click" || !style ? keyHintHtml(CLICK(), tr("작업")) : keyHintHtml("Space", style === "bellows" ? tr("풀무질") : tr("두드리기"));
    const unlinked = node.type === PUMP && !riverOf(s, node);
    // Why a loaded machine isn't running: no fuel, too weak a power tier, or cut off at the back of the queue.
    const powerText = node.tierLow ? tr("동력 등급 부족") : node.order ? tr("동력 부족") : tr("동력 없음");
    const stateText = unlinked ? tr("강가 미연결") : lacksFuel(node) ? tr("연료 없음") : state === "manual" ? hand : lacksPower(node) ? powerText : STATE_LABEL[state];
    const level = machineManual(node.type) ? `<span class="card-note">${tr("난이도")} ${machineDifficulty(node.type)}</span>` : "";
    const river = node.type === PUMP ? riverOf(s, node) : undefined;
    const reserve = river ? `<span class="card-note">${tr("강가")} ${river.code} ${river.left}/${river.total}L</span>` : "";
    const result = parts(current.out, (_, i) => outputRole(i)) || (node.type === ENGINE ? `St ${tr("증기")} ${Math.floor(node.energy)}/${STEAM_MAX}` : tr("폐기"));
    const load = node.type === ENGINE ? powerLoad(s, node) : null;
    const queue = node.order ? ` · ${tr("순번")} ${node.order}` : "";
    const use = load ? `<span class="card-note">${tr("동력")} ${load.now}/${load.limit} · ${tr("연결")} ${load.connected}</span>`
      : machinePower(node.type) ? `<span class="card-note">${tr("동력")} ${machinePower(node.type)}${queue}</span>` : "";
    // The lit piece burning down, in 5% steps so the line isn't rebuilt every frame.
    const burnt = node.heatFull ? Math.round(((node.heat ?? 0) / node.heatFull) * 20) * 5 : 0;
    const secondsLeft = Math.ceil((node.heat ?? 0) / (machineBurn(node.type) || 1));
    const heat = machineBurn(node.type)
      ? `<span class="card-note fire-left"><span class="gauge" aria-hidden="true"><i style="width:${burnt}%"></i></span>${secondsLeft}${tr("초")}</span>`
      : "";
    // The slots already show what goes in and out; the codex dropdown above says how. Only an engine's steam has no slot.
    const steam = node.type === ENGINE ? `<span class="card-note">${result}</span>` : "";
    const line = `${steam}${level}${reserve}${use}${heat}<span class="state ${state}">${stateText}</span>`;
    if (this.recipe.dataset.line !== line) {
      this.recipe.dataset.line = line;
      this.recipe.innerHTML = line;
    }
    const slots = nodeProcess(node).slots;
    for (const [key, b] of this.inputs) {
      paintSlot(b, node.ins[key], "", undefined, { name: inputRole(key), fits: slots.find((slot) => slot.key === key)!.accepts });
    }
    if (this.fuelSlot) paintSlot(this.fuelSlot, node.fuel ?? null, "fuel", undefined, { name: tr("연료"), fits: FUELS });
    const expected = expectedOutput(node);
    this.outputs.forEach(([held, b], i) => {
      const item = held.find((id) => node.outs[id] > 0);
      const n = item ? node.outs[item] : 0;
      const role = i > 0 ? "byproduct" : "";
      paintSlot(b, item ? { id: item, n } : null, `${role} ${item && n >= outputCap(item) ? "full" : ""}`, item ? undefined : expected[i], { name: outputRole(i), fits: held });
    });
    const waiting = state === "manual";
    const manual = machineManual(node.type);
    // Every hand machine but the key-pressing ones is worked on its picture.
    this.workBox!.disabled = !(waiting && manual && manual !== "keys");
    this.keycaps.forEach((cap, i) => {
      cap.disabled = !waiting;
      cap.classList.toggle("target", waiting && i === this.target);
    });
    const now = performance.now();
    const dt = Math.min(0.5, (now - (this.drawnAt || now)) / 1000);
    this.drawnAt = now;
    const striking = now - this.hitAt < HIT_MS;
    const bellows = manual === "bellows";
    const blast = node.blast ?? 0;
    const lit = machineBurn(node.type) > 0 && (node.heat ?? 0) > 0;
    // One value from 0 to 1 says how hard the machine is going, and the picture follows it, eased, so it
    // brightens, speeds up, dims and slows down smoothly instead of stepping between looks.
    const target = this.liveliness(node, state, lit, bellows, waiting);
    this.live = this.fresh ? target : this.live + (target - this.live) * (1 - Math.exp(-dt / EASE_S));
    this.fresh = false;
    const live = smooth(this.live);
    // Hand tools sit still and show the bottom of the stroke for a moment after each strike. Anything
    // else in motion moves at a pace set by how lively it is, up to POSE_RATE poses a second.
    const mode = bellows ? (waiting ? "run" : state) : waiting ? (striking ? "run" : "idle") : state;
    this.phase += dt * POSE_RATE * live;
    const pose = !bellows && waiting && striking && STRIKE_FRAME[node.type] !== undefined ? STRIKE_FRAME[node.type]
      : waiting && !bellows ? frame : Math.floor(this.phase) * 2;
    const scene = `${node.type}|${mode}|${mode === "run" ? pose >> 1 : ""}`;
    if (this.art.root.dataset.scene !== scene) {
      this.art.root.dataset.scene = scene;
      this.art.show(node.type, mode, pose);
    }
    // Light follows liveliness: a working machine plainly bright, a stopped one plainly dull, and the
    // way between them gradual. A rhythm machine waiting on the player keeps its plain look.
    this.art.root.style.filter = waiting && !bellows ? ""
      : `brightness(${(0.55 + 0.57 * live).toFixed(3)}) saturate(${(0.3 + 1.05 * live).toFixed(3)})`;
    // Only the fire itself glows, as strong as it burns, swaying slowly rather than blinking.
    // A hand-forged piece glows where it was struck and darkens over a second or so.
    const afterglow = AFTERGLOW_AT[node.type];
    const cooling = afterglow && this.hitAt ? Math.max(0, 1 - (now - this.hitAt) / AFTERGLOW_MS) : 0;
    const fireSpot = FIRE_AT[node.type] ?? (cooling > 0 ? afterglow : undefined);
    const glow = FIRE_AT[node.type] && machineBurn(node.type) ? 0.7 * live : 0.45 * cooling * cooling;
    this.fireGlow.hidden = glow < 0.02;
    if (!this.fireGlow.hidden && fireSpot) {
      const sway = 1 + 0.04 * Math.sin(now / 180) + 0.03 * Math.sin(now / 97);
      this.fireGlow.style.left = `${fireSpot.x}px`;
      this.fireGlow.style.top = `${fireSpot.y}px`;
      this.fireGlow.style.opacity = (glow * sway).toFixed(3);
    }
    // Embers rise from a fire as often as it burns hard; an engine breathes steam at its valve as hard as
    // it is worked; a powered tool throws the odd spark.
    if (machineBurn(node.type)) {
      if (lit && now - this.emberAt > EMBER_MS / Math.max(0.15, live)) {
        this.emberAt = now;
        const fire = fireSpot ?? SPARK_AT;
        sparks(this.fx, fire.x + (Math.random() - 0.5) * 24, fire.y - 6, "#ffb238", 1 + Math.round(live), 34, "'·*");
      }
      // A boiler under fire lets off steam at its valve, as often as it boils.
      const valve = STEAM_AT[node.type];
      if (valve && state === "run" && now - this.steamAt > STEAM_MS / Math.max(0.2, live)) {
        this.steamAt = now;
        sparks(this.fx, valve.x, valve.y, "#9aa7b0", 1, 22, "~");
      }
    } else if (node.type === ENGINE) {
      const load = powerLoad(s, node);
      const work = load.limit ? load.now / load.limit : 0;
      if (state === "run" && work > 0 && now - this.emberAt > STEAM_MS / (0.2 + 0.8 * work)) {
        this.emberAt = now;
        sparks(this.fx, STEAM_AT.steam_engine.x, STEAM_AT.steam_engine.y, "#9aa7b0", 1, 22, "~");
      }
    } else if (node.type === "steam_hammer") {
      // Each blow spends its steam out of the exhaust, and hot metal spits at the anvil.
      if (state === "run" && now - this.emberAt > STEAM_MS * 0.8) {
        this.emberAt = now;
        sparks(this.fx, STEAM_AT.steam_hammer.x, STEAM_AT.steam_hammer.y, "#9aa7b0", 1, 22, "~");
        sparks(this.fx, HAMMER_AT.x, HAMMER_AT.y, "#ffb238", 2, 28, "'·*");
      }
    } else if (state === "run" && machinePower(node.type) && now - this.emberAt > EMBER_MS) {
      this.emberAt = now;
      sparks(this.fx, SPARK_AT.x, SPARK_AT.y, "#a9bacb", 1, 26, "*·");
    }
    if (bellows) {
      this.gaugeFill.style.height = `${Math.min(100, (blast / BLAST.max) * 100)}%`;
      this.gaugeFill.className = `blast-fill ${blast > BLAST.high ? "over" : inBlastZone(node) ? "in" : ""}`;
      this.gauge.setAttribute("aria-label", `${tr("풀무")} ${Math.round(blast)}/${BLAST.max}`);
    }
    const fill = Math.round(node.progress * 18);
    const flow = state === "run" || (bellows && inBlastZone(node) && waiting) ? ">>>".slice(0, 1 + (frame % 3)).padEnd(3) : state === "blocked" ? "xxx" : "   ";
    // What the last strike was worth, or why a furnace just lost its batch.
    const burst = bellows && node.burstAt !== undefined && s.time - node.burstAt < 2000;
    const verdict = this.struck && now - this.struck.at < VERDICT_MS
      ? ` ${this.struck.verdict === "exact" ? tr("정확") : this.struck.verdict === "good" ? tr("좋음") : tr("빗나감")}${this.struck.streak >= 2 ? ` · ${tr("연속")} ${this.struck.streak}` : ""}`
      : "";
    const note = burst ? ` ${tr("과열! 재료가 타 버렸습니다")}` : verdict;
    // The note has its own line under the bar, kept even when empty, so nothing moves or resizes.
    const noteKind = burst || (this.struck?.verdict === "miss" && verdict) ? "stop" : verdict ? "ok" : "";
    this.bar.className = `window-bar split ${state === "blocked" ? "stop" : ""}`;
    const core = `${flow} [${"#".repeat(fill).padEnd(18, ".")}] ${flow}`;
    const html = `<span>${core}</span><span class="bar-note ${noteKind}">${note.trim() || "&nbsp;"}</span>`;
    if (this.bar.innerHTML !== html) this.bar.innerHTML = html;
  }
}
