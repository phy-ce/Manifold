// Minecraft-style window: machine slots on top, the player's inventory below.
import { MOTOR, WAREHOUSE, formLabel, itemName, machineDifficulty, machineForms, machineManual, machineName, inputRole, outputRole, ENGINE, PUMP, RIVERBANK, machinePower, unitOf } from "../content";
import {
  GameNode, GameState, INV_SLOTS, SPRING_MAX, STEAM_MAX, canAffordRoute, canRemove, expectedOutput, foundRivers, linkRiver, lacksPower, outputCap, powerLoad, riverOf, windMotor, clickInput, clickOutput, clickStack, isFirstWarehouse, moveToNode, nudgeFromStore, nudgeToNode, sortSlots, wheelInput, wheelStack, nodeById, nodeLabel, nodeProcess, recipeOf, failWork, removeNode, setForm, status, takeInput, takeOutput, takeStored, workMachine,
} from "../engine/game";
import { MachineArt } from "./machineArt";
import { makeSlot, paintSlot } from "./slots";

const KEYS = ["A", "S", "D", "F"];
const STATE_LABEL: Record<string, string> = { run: "가동 중", idle: "재료 부족", blocked: "출력 막힘" };

/** A recipe side in role words. The tooltip names the real item. */
const parts = (list: Record<string, number>, role: (id: string, index: number) => string): string =>
  Object.entries(list)
    .map(([id, n], i) => `<span data-tip="${itemName(id)}">${role(id, i)}</span> ${n}${unitOf(id)}`)
    .join(" + ");
const HIT_MS = 140;

export class MachineWindow {
  readonly root = document.createElement("div");
  private readonly title = document.createElement("h2");
  private readonly top = document.createElement("div");
  private readonly modes = document.createElement("div");
  private readonly recipe = document.createElement("div");
  private readonly sort = document.createElement("button");
  private readonly keys = document.createElement("div");
  private readonly keycaps: HTMLButtonElement[] = [];
  private workBox: HTMLButtonElement | null = null;
  private target = 0;
  private hitAt = 0;
  private readonly bar = document.createElement("pre");
  private readonly inv = document.createElement("div");
  private readonly demolish = document.createElement("button");
  private disarm = 0;
  private readonly invSlots: HTMLButtonElement[] = [];
  private inputs: [string, HTMLButtonElement][] = [];
  private outputs: [string[], HTMLButtonElement][] = [];
  private stored: HTMLButtonElement[] = [];
  private readonly art = new MachineArt();
  private nodeId: number | null = null;

  constructor(private readonly game: () => GameState, private readonly changed: () => void) {
    this.root.className = "window-back";
    this.root.hidden = true;
    const panel = document.createElement("div");
    panel.className = "window";
    panel.setAttribute("role", "dialog");
    const head = document.createElement("div");
    head.className = "bar-row";
    const close = document.createElement("button");
    close.type = "button";
    close.className = "tech push";
    close.textContent = "x";
    close.setAttribute("aria-label", "닫기");
    close.addEventListener("click", () => this.close());
    this.demolish.type = "button";
    this.demolish.className = "tech demolish";
    this.demolish.addEventListener("click", () => this.onDemolish());
    close.classList.remove("push");
    this.sort.type = "button";
    this.sort.className = "tech push";
    this.sort.textContent = "정렬";
    head.append(this.title, this.sort, this.demolish, close);
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
      b.setAttribute("aria-label", `${key} 키`);
      b.addEventListener("click", () => this.pressKey(i));
      this.keycaps.push(b);
      this.keys.append(b);
    });
    window.addEventListener("keydown", (e) => {
      if (e.target instanceof HTMLInputElement) return; // typing in the item search
      const index = KEYS.indexOf(e.key.toUpperCase());
      if (index >= 0 && !e.repeat) this.pressKey(index);
    });
    this.recipe.className = "recipe";
    panel.append(head, this.modes, this.recipe, this.top, this.bar, this.keys, this.inv);
    this.root.append(panel);
    this.root.addEventListener("click", (e) => {
      if (e.target === this.root) this.close();
    });
    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape") this.close();
    });
  }

  /** One unit of hand work. */
  private strike(): void {
    if (this.nodeId === null || !workMachine(this.game(), this.nodeId)) return;
    this.hitAt = performance.now();
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
    this.strike();
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
      this.demolish.textContent = "정말 철거?";
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
    this.demolish.textContent = "철거";
  }

  get isOpen(): boolean {
    return this.nodeId !== null;
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
    this.demolish.hidden = isFirstWarehouse(this.game(), node) || node.type === RIVERBANK;
    this.sort.hidden = true;
    this.buildForms(node);
    this.top.replaceChildren();
    this.workBox = null;
    this.keys.hidden = machineManual(node.type) !== "keys";
    this.inputs = [];
    this.outputs = [];
    this.stored = [];
    delete this.art.root.dataset.scene;
    if (node.type === WAREHOUSE) this.buildWarehouse(node);
    else if (node.type === RIVERBANK) this.top.className = "machine";
    else if (node.type === MOTOR) this.buildMotor(node);
    else this.buildMachine(node);
    this.root.hidden = false;
    this.draw(0);
  }

  close(): void {
    this.nodeId = null;
    this.root.hidden = true;
  }

  /** The player sets the shape; the metal that goes in decides the rest. */
  private buildForms(node: GameNode): void {
    const forms = node.type === WAREHOUSE ? [] : machineForms(node.type);
    this.modes.replaceChildren();
    this.modes.hidden = forms.length < 2;
    for (const form of forms) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = `tech ${form === node.form ? "selected" : ""}`;
      b.textContent = formLabel(form);
      b.addEventListener("click", () => {
        setForm(this.game(), node.id, form);
        this.open(node.id);
        this.changed();
      });
      this.modes.append(b);
    }
    if (node.type === PUMP) this.buildRivers(node);
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
      note.textContent = "지도에서 강가를 먼저 찾아야 합니다";
      this.modes.append(note);
      return;
    }
    for (const bank of banks) {
      const on = linked?.id === bank.siteId;
      const b = document.createElement("button");
      b.type = "button";
      b.className = `tech ${on ? "selected" : ""}`;
      b.textContent = nodeLabel(s, bank);
      b.disabled = !on && !linked && !canAffordRoute(s, bank.id, node.id);
      b.dataset.tip = on ? "다시 누르면 연결을 끊습니다" : b.disabled ? "철판 1, 구리관 1이 필요합니다" : "이 강가에서 물을 끌어옵니다";
      b.addEventListener("click", () => {
        linkRiver(s, node.id, bank.id);
        this.open(node.id);
        this.changed();
      });
      this.modes.append(b);
    }
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
    this.workBox.setAttribute("aria-label", `${machineName(node.type)} 작업`);
    this.workBox.append(this.art.root);
    this.workBox.addEventListener("click", () => {
      if (machineManual(node.type) === "click") this.strike();
    });
    this.top.append(left, this.workBox, right);
  }

  private buildMotor(node: GameNode): void {
    this.top.className = "machine";
    this.workBox = document.createElement("button");
    this.workBox.type = "button";
    this.workBox.className = "work";
    this.workBox.setAttribute("aria-label", "태엽 감기");
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

  draw(frame: number): void {
    if (this.nodeId === null) return;
    const s = this.game();
    const node = nodeById(s, this.nodeId);
    if (!node) return this.close();
    const label = nodeLabel(s, node);
    if (this.title.textContent !== label) this.title.textContent = label;
    s.inv.forEach((stack, i) => paintSlot(this.invSlots[i], stack));
    this.demolish.disabled = !canRemove(s, node);
    this.demolish.dataset.tip = this.demolish.disabled ? "창고를 비워야 철거할 수 있습니다" : "";
    this.recipe.hidden = node.type === WAREHOUSE;
    if (node.type === RIVERBANK) {
      const site = s.sites[node.siteId!];
      const line = `비축 ${site.left}/${site.total}L<span class="card-note">강가 펌프로 선을 이어야 쓸 수 있습니다</span>`;
      if (this.recipe.dataset.line !== line) {
        this.recipe.dataset.line = line;
        this.recipe.innerHTML = line;
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
      const line = `힘 ${Math.floor(node.energy)}/${SPRING_MAX}<span class="card-note">동력 ${load.now}/${load.limit} · 연결 ${load.connected}</span><span class="state manual">그림을 클릭해서 감으세요</span>`;
      if (this.recipe.dataset.line !== line) {
        this.recipe.dataset.line = line;
        this.recipe.innerHTML = line;
      }
      const fill = Math.round((node.energy / SPRING_MAX) * 18);
      this.bar.className = "window-bar";
      this.bar.textContent = `[${"#".repeat(fill).padEnd(18, ".")}]`;
      return;
    }
    if (node.type === WAREHOUSE) {
      node.store.forEach((stack, i) => paintSlot(this.stored[i], stack));
      this.bar.textContent = "";
      return;
    }
    const state = status(node);
    const current = recipeOf(node);
    const hand = machineManual(node.type) === "keys" ? "키를 누르세요" : "그림을 클릭하세요";
    const unlinked = node.type === PUMP && !riverOf(s, node);
    const stateText = unlinked ? "강가 미연결" : state === "manual" ? hand : lacksPower(node) ? "동력 없음" : STATE_LABEL[state];
    const level = machineManual(node.type) ? `<span class="card-note">난이도 ${machineDifficulty(node.type)}</span>` : "";
    const river = node.type === PUMP ? riverOf(s, node) : undefined;
    const reserve = river ? `<span class="card-note">강가 ${river.code} ${river.left}/${river.total}L</span>` : "";
    const result = parts(current.out, (_, i) => outputRole(i)) || (node.type === ENGINE ? `St 증기 ${Math.floor(node.energy)}/${STEAM_MAX}` : "폐기");
    const load = node.type === ENGINE ? powerLoad(s, node) : null;
    const use = load ? `<span class="card-note">동력 ${load.now}/${load.limit} · 연결 ${load.connected}</span>`
      : machinePower(node.type) ? `<span class="card-note">동력 ${machinePower(node.type)}</span>` : "";
    const line = `${parts(current.in, inputRole)} &gt; ${result}${level}${reserve}${use}<span class="state ${state}">${stateText}</span>`;
    if (this.recipe.dataset.line !== line) {
      this.recipe.dataset.line = line;
      this.recipe.innerHTML = line;
    }
    const slots = nodeProcess(node).slots;
    for (const [key, b] of this.inputs) {
      paintSlot(b, node.ins[key], "", undefined, { name: inputRole(key), fits: slots.find((slot) => slot.key === key)!.accepts });
    }
    const expected = expectedOutput(node);
    this.outputs.forEach(([held, b], i) => {
      const item = held.find((id) => node.outs[id] > 0);
      const n = item ? node.outs[item] : 0;
      const role = i > 0 ? "byproduct" : "";
      paintSlot(b, item ? { id: item, n } : null, `${role} ${item && n >= outputCap(item) ? "full" : ""}`, item ? undefined : expected[i], { name: outputRole(i), fits: held });
    });
    const waiting = state === "manual";
    const manual = machineManual(node.type);
    this.workBox!.disabled = !(manual === "click" && waiting);
    this.keycaps.forEach((cap, i) => {
      cap.disabled = !waiting;
      cap.classList.toggle("target", waiting && i === this.target);
    });
    // Hand tools only move while the player is striking.
    const striking = performance.now() - this.hitAt < HIT_MS;
    const mode = waiting ? (striking ? "run" : "idle") : state;
    // Still machines keep their picture; only moving ones are redrawn.
    const scene = `${node.type}|${mode}|${mode === "run" ? frame >> 1 : ""}`;
    if (this.art.root.dataset.scene !== scene) {
      this.art.root.dataset.scene = scene;
      this.art.show(node.type, mode, frame);
    }
    const fill = Math.round(node.progress * 18);
    const flow = state === "run" ? ">>>".slice(0, 1 + (frame % 3)).padEnd(3) : state === "blocked" ? "xxx" : "   ";
    this.bar.className = `window-bar ${state === "blocked" ? "stop" : ""}`;
    this.bar.textContent = `${flow} [${"#".repeat(fill).padEnd(18, ".")}] ${flow}`;
  }
}
