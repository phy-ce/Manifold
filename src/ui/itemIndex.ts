// Item index: search every known item and see how it is made and what it is used for.
// It docks beside the game so it can stay open next to a machine window.
import { tr } from "../i18n";
import {
  FUEL_GROUP, machineRhythm, Recipe, burners, buildUses, compareItems, formLabel, fuelValue, indexItems, isFuel, isGroup, itemName, itemSource, machineBurn, machineManual, machineName,
  machinePower, machinePowerOut, recipesFor, usesOf,
  itemMatches,
} from "../content";
import { GameState, bagHolds, countOf, itemStats, fillFromBag, nodeById, runsRecipe } from "../engine/game";
import { knownMembers, makeSlot, paintSlot } from "./slots";
import { maxWorkRate } from "./handWork";

/** A group such as coal has members instead of recipes. Items with numbers to them also have a stats tab. */
type Tab = "recipes" | "uses" | "members" | "stats";

/** Short numbers: whole when they are, otherwise up to two decimals. */
const short = (n: number) => String(Math.round(n * 100) / 100);
/** A rate: two decimals, or two significant digits when it is slower than one in ten seconds. */
const rate = (n: number) => (n >= 0.1 ? short(n) : String(Number(n.toPrecision(2))));

/** Rows of items per page, and the page size before the grid has been laid out. */
const GRID_ROWS = 4;
const GRID_PAGE = 40;
const CARD_HEIGHT = 110;
/** Rough heights of a one-line card, a machine group's head, and each recipe row under it. */
const TEXT_HEIGHT = 44;
const GROUP_HEAD = 60;
const RECIPE_ROW = 92;

/** Previous and next buttons for a paged list. Empty when everything fits on one page. */
function pager(page: number, pages: number, go: (page: number) => void): HTMLElement {
  const bar = document.createElement("div");
  bar.className = "pager";
  bar.hidden = pages < 2;
  const step = (label: string, target: number) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "tech";
    b.textContent = label;
    b.disabled = target < 0 || target >= pages;
    b.addEventListener("click", () => go(target));
    return b;
  };
  const where = document.createElement("span");
  where.textContent = `${page + 1}/${pages}`;
  bar.append(step("<", page - 1), where, step(">", page + 1));
  return bar;
}

export class ItemIndex {
  readonly root = document.createElement("aside");
  private readonly search = document.createElement("input");
  private readonly grid = document.createElement("div");
  private readonly gridBar = document.createElement("div");
  private readonly detail = document.createElement("div");
  private gridPage = 0;
  private cardPage = 0;
  private readonly history: string[] = [];
  private item: string | null = null;
  /** The item whose page is showing, if any. */
  get shown(): string | null {
    return this.item;
  }
  private tab: Tab = "recipes";
  private synced = "";
  /** The stage the grid and page were drawn for. */
  private stage = -1;

  constructor(
    private readonly game: () => GameState,
    private readonly openNode: () => number | null,
    private readonly changed: () => void,
  ) {
    this.root.className = "box dock";
    // Always open: the right column of the screen.
    this.root.setAttribute("aria-label", tr("아이템 도감"));
    this.search.id = "index-search";
    this.search.type = "search";
    this.search.placeholder = tr("이름이나 코드로 검색");
    this.search.setAttribute("aria-label", tr("아이템 검색"));
    this.search.addEventListener("input", () => {
      this.gridPage = 0;
      this.drawGrid();
    });
    this.grid.className = "dock-grid";
    this.detail.className = "dock-detail";
    this.root.append(this.search, this.grid, this.gridBar, this.detail);
    // The page size depends on how many slots fit across, which is only known once the dock is laid out.
    let across = -1;
    new ResizeObserver(() => {
      if (this.grid.clientWidth === across) return;
      across = this.grid.clientWidth;
      this.drawGrid();
    }).observe(this.grid);

    // Like the classic mod: hover any item, then R for recipes or U for uses.
    window.addEventListener("keydown", (e) => {
      if (e.target instanceof HTMLInputElement || e.ctrlKey || e.metaKey) return;
      const key = e.key.toLowerCase();
      if (key !== "r" && key !== "u") return;
      const id = document.querySelector<HTMLElement>("[data-item]:hover")?.dataset.item;
      if (id) this.show(id, key === "r" ? "recipes" : "uses");
    });
  }

  /** G: the index is always open in the right column, so the key goes straight to its search box. */
  focus(): void {
    this.search.focus();
    this.search.select();
  }

  show(id: string, tab: Tab = "recipes", remember = true): void {
    const next = id;
    // A group isn't made, it is filled: its first page is what counts as it.
    if (isGroup(next) && tab === "recipes") tab = "members";
    if (!isGroup(next) && tab === "members") tab = "recipes";
    if (remember && this.item && this.item !== next) this.history.push(this.item);
    if (next !== this.item || tab !== this.tab) this.cardPage = 0;
    this.item = next;
    this.tab = tab;
    this.drawDetail();
  }

  private itemSlot(id: string, n?: number): HTMLButtonElement {
    const b = makeSlot(() => this.show(id));
    paintSlot(b, n === undefined ? null : { id, n }, "", n === undefined ? id : undefined);
    return b;
  }

  private drawGrid(): void {
    const query = this.search.value.trim().toLowerCase();
    // Same order as stacks everywhere else: raw materials, metals by shape, made goods by depth, then machines.
    const found = indexItems(this.game().stage).filter((id) =>
      itemMatches(id, query)).sort(compareItems);
    // A page is whole rows of what fits across, so no page but the last has a gap.
    const columns = getComputedStyle(this.grid).gridTemplateColumns.split(" ").filter((c) => c.endsWith("px")).length;
    const perPage = columns ? columns * GRID_ROWS : GRID_PAGE;
    const pages = Math.max(1, Math.ceil(found.length / perPage));
    this.gridPage = Math.min(this.gridPage, pages - 1);
    const start = this.gridPage * perPage;
    this.grid.replaceChildren(...found.slice(start, start + perPage).map((id) => this.itemSlot(id, undefined)));
    this.gridBar.replaceChildren(pager(this.gridPage, pages, (page) => {
      this.gridPage = page;
      this.drawGrid();
    }));
    this.grid.querySelectorAll(".ghost").forEach((slot) => slot.classList.remove("ghost"));
  }

  /**
   * Recipes grouped by the machine that runs them: the machine's icon and name once at the head, its power
   * and heat beside it, and each recipe as a row underneath. Order follows the recipes given.
   */
  private machineGroups(recipes: Recipe[], focus: string): [HTMLElement, number][] {
    const byMachine = new Map<string, Recipe[]>();
    for (const r of recipes) byMachine.set(r.machine, [...(byMachine.get(r.machine) ?? []), r]);
    return [...byMachine].map(([machine, list]) => {
      const card = document.createElement("div");
      card.className = "card machine-group";
      const head = document.createElement("div");
      head.className = "card-row group-head";
      const icon = this.itemSlot(machine);
      icon.classList.add("small");
      const name = document.createElement("strong");
      name.textContent = machineName(machine);
      const heat = machineBurn(machine);
      const facts = [
        machinePower(machine) ? `${tr("동력")} ${machinePower(machine)}` : "",
        machinePowerOut(machine) ? `${tr("동력")} +${machinePowerOut(machine)}` : "",
        heat ? `${tr("열")} ${short(heat)}/${tr("초")}` : "",
      ].filter(Boolean).join(" · ");
      const meta = document.createElement("span");
      meta.className = "card-note";
      meta.textContent = facts;
      head.append(icon, name, meta);
      card.append(head, ...list.map((r) => this.recipeRow(r, focus)));
      return [card, GROUP_HEAD + list.length * RECIPE_ROW];
    });
  }

  /** One recipe under its machine: what goes in, what comes out, and how many a second at full speed. */
  private recipeRow(recipe: Recipe, focus: string): HTMLElement {
    const box = document.createElement("div");
    box.className = "recipe-row";
    const row = document.createElement("div");
    row.className = "card-row";
    row.append(...Object.entries(recipe.in).map(([id, n]) => this.itemSlot(id, n)));
    // A fire takes any fuel, so it gets the fuel group with no count. Shift lists how long each piece burns here.
    const heat = machineBurn(recipe.machine);
    if (heat) {
      const fuel = makeSlot(() => this.show(FUEL_GROUP));
      paintSlot(fuel, null, "fuel", FUEL_GROUP);
      fuel.classList.remove("ghost");
      fuel.dataset.tipBurn = String(heat);
      row.append(fuel);
    }
    const arrow = document.createElement("span");
    arrow.textContent = ">";
    row.append(arrow, ...Object.entries(recipe.out).map(([id, n]) => this.itemSlot(id, n)));
    const fill = this.fillButton(recipe);
    if (fill) row.append(fill);
    const note = document.createElement("div");
    note.className = "card-note";
    const form = recipe.form && recipe.machine === "forming_bench" ? `${formLabel(recipe.form)} · ` : "";
    // Full speed: a rhythm machine with every beat struck exactly, anything else at its recipe time.
    const time = machineManual(recipe.machine) === "rhythm" ? recipe.time / maxWorkRate(machineRhythm(recipe.machine)) : recipe.time;
    // The rate of the item this page is about, else the main output, else what it uses up.
    const counted = recipe.out[focus] !== undefined ? recipe.out[focus] : Object.values(recipe.out)[0] ?? Object.values(recipe.in)[0] ?? 0;
    note.textContent = `${form}${rate(counted / time)}${tr("개/초")}`;
    box.append(row, note);
    return box;
  }

  /** Shown on recipes the open machine can run. Takes from the bag only, never the warehouse. */
  private fillButton(recipe: Recipe): HTMLButtonElement | null {
    const s = this.game();
    const id = this.openNode();
    const node = id === null ? undefined : nodeById(s, id);
    if (!node || !runsRecipe(node, recipe) || !Object.keys(recipe.in).length) return null;
    const b = document.createElement("button");
    b.type = "button";
    b.className = "tech push fill-plus";
    b.textContent = "+";
    b.disabled = !bagHolds(s, recipe);
    b.dataset.tip = b.disabled ? tr("인벤토리에 재료가 없습니다") : tr("인벤토리에서 넣기 (Shift: 가득)");
    b.setAttribute("aria-label", tr("인벤토리에서 재료 넣기"));
    b.addEventListener("click", (e) => {
      fillFromBag(s, node.id, recipe, e.shiftKey ? Infinity : 1);
      this.changed();
    });
    return b;
  }

  /**
   * Redraws when the stage, the open machine or the bag changes: a new stage opens items, recipes
   * and uses, and the fill buttons have to stay true.
   */
  sync(): void {
    if (this.root.hidden) return;
    const s = this.game();
    if (s.stage !== this.stage) {
      this.stage = s.stage;
      this.synced = "";
      this.drawGrid();
    }
    if (!this.item) return;
    const id = this.openNode();
    const node = id === null ? undefined : nodeById(s, id);
    const key = `${id}|${node?.form}|${s.inv.map((slot) => slot?.id ?? "").join()}`;
    if (key === this.synced) return;
    this.synced = key;
    this.drawDetail();
  }

  private textCard(text: string): HTMLElement {
    const card = document.createElement("div");
    card.className = "card card-note";
    card.textContent = text;
    return card;
  }

  /** Everything that counts as a group, each opening its own page. */
  private membersCard(members: string[]): HTMLElement {
    const card = document.createElement("div");
    card.className = "card";
    const row = document.createElement("div");
    row.className = "card-row";
    row.append(...members.map((id) => this.itemSlot(id)));
    row.querySelectorAll(".ghost").forEach((slot) => slot.classList.remove("ghost"));
    card.append(row);
    return card;
  }

  /** A machine that burns fuel: its heat per second, and how long one piece of this fuel lasts in it. */
  private burnCard(type: string, fuel: string): HTMLElement {
    const card = document.createElement("div");
    card.className = "card";
    const row = document.createElement("div");
    row.className = "card-row";
    const machine = this.itemSlot(type);
    machine.classList.remove("ghost");
    row.append(machine);
    const note = document.createElement("div");
    note.className = "card-note";
    const burn = machineBurn(type);
    const lasts = isFuel(fuel) ? ` · ${short(fuelValue(fuel) / burn)}${tr("초/개")}` : "";
    note.textContent = `${tr("연소")} · ${machineName(type)} · ${tr("열")} ${short(burn)}/${tr("초")}${lasts}`;
    card.append(row, note);
    return card;
  }

  private buildCard(type: string, cost: Record<string, number>): HTMLElement {
    const card = document.createElement("div");
    card.className = "card";
    const row = document.createElement("div");
    row.className = "card-row";
    row.append(...Object.entries(cost).map(([id, n]) => this.itemSlot(id, n)));
    const note = document.createElement("div");
    note.className = "card-note";
    note.textContent = `${machineName(type)} ${tr("건설 재료")}`;
    card.append(row, note);
    return card;
  }

  private drawDetail(): void {
    const id = this.item;
    this.detail.replaceChildren();
    if (!id) return;

    const head = document.createElement("div");
    head.className = "bar-row";
    const back = document.createElement("button");
    back.type = "button";
    back.className = "tech";
    back.textContent = "<";
    back.setAttribute("aria-label", tr("이전 아이템"));
    back.disabled = !this.history.length;
    back.addEventListener("click", () => {
      const previous = this.history.pop();
      if (previous) this.show(previous, "recipes", false);
    });
    const title = document.createElement("strong");
    title.textContent = itemName(id);
    const owned = document.createElement("span");
    owned.className = "push";
    const group = isGroup(id);
    owned.textContent = group ? "" : `${tr("보유")} ${countOf(this.game(), id)}`;
    head.append(back, title);
    if (isFuel(id)) {
      const heat = document.createElement("span");
      heat.className = "heat";
      heat.textContent = `${tr("열량")} ${fuelValue(id)}${tr("/개")}`;
      head.append(heat);
    }
    head.append(owned);

    const stage = this.game().stage;
    const members = knownMembers(id);
    const recipes = group ? [] : recipesFor(id, stage);
    const source = group ? null : itemSource(id);
    const uses = usesOf(id, stage);
    const builds = buildUses(id, stage);
    const burns = isFuel(id) || id === FUEL_GROUP ? burners(stage) : [];
    const stats = group ? [] : itemStats(id);
    // Another item may have no stats tab, so it falls back to how it is made.
    if (this.tab === "stats" && !stats.length) this.tab = "recipes";

    const tabs = document.createElement("div");
    tabs.className = "modes";
    const tabButton = (tab: Tab, label: string) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = `tech ${this.tab === tab ? "selected" : ""}`;
      b.textContent = label;
      b.addEventListener("click", () => this.show(id, tab, false));
      return b;
    };
    tabs.append(
      group
        ? tabButton("members", `${tr("구성원")} ${members.length}`)
        : tabButton("recipes", `${tr("얻는 법")} ${recipes.length + (source ? 1 : 0)}`),
      tabButton("uses", `${tr("사용처")} ${burns.length + uses.length + builds.length}`),
      ...(stats.length ? [tabButton("stats", tr("성능"))] : []),
    );

    // Cards with their rough heights, so a page holds what fits. Recipes come grouped by the machine that runs them.
    const cards: [HTMLElement, number][] = [];
    const text = (t: string): [HTMLElement, number] => [this.textCard(t), TEXT_HEIGHT];
    if (this.tab === "stats") {
      cards.push(...stats.map(([what, much]) => text(`${what}: ${much}`)));
    } else if (this.tab === "members") {
      if (members.length) cards.push([this.membersCard(members), CARD_HEIGHT]);
    } else if (this.tab === "recipes") {
      if (source) cards.push(text(source));
      cards.push(...this.machineGroups(recipes, id));
    } else {
      cards.push(...burns.map((type): [HTMLElement, number] => [this.burnCard(type, id), CARD_HEIGHT]));
      cards.push(...this.machineGroups(uses, id));
      cards.push(...builds.map(([type, cost]): [HTMLElement, number] => [this.buildCard(type, cost), CARD_HEIGHT]));
    }
    if (!cards.length) cards.push(text(tr("아직 없습니다")));
    // Pages filled in order up to the room the panel has; a card taller than the room gets a page of its own.
    const room = (this.detail.clientHeight || window.innerHeight / 2) - CARD_HEIGHT;
    const pages: HTMLElement[][] = [[]];
    let used = 0;
    for (const [card, height] of cards) {
      if (used + height > room && pages[pages.length - 1].length) {
        pages.push([]);
        used = 0;
      }
      pages[pages.length - 1].push(card);
      used += height;
    }
    this.cardPage = Math.min(this.cardPage, pages.length - 1);
    const bar = pager(this.cardPage, pages.length, (page) => {
      this.cardPage = page;
      this.drawDetail();
    });
    this.detail.append(head, tabs, ...pages[this.cardPage], bar);
  }
}
