// Item index: search every known item and see how it is made and what it is used for.
// It docks beside the game so it can stay open next to a machine window.
import { tr } from "../i18n";
import {
  FUEL_GROUP, Recipe, burners, buildUses, compareItems, formLabel, fuelValue, indexItems, isFuel, isGroup, itemCode, itemName, itemSource, machineBurn, machineManual, machineName,
  machinePower, machinePowerOut, recipesFor, usesOf,
} from "../content";
import { GameState, bagHolds, countOf, fillFromBag, nodeById, runsRecipe } from "../engine/game";
import { knownMembers, makeSlot, paintSlot } from "./slots";

/** A group such as coal has members instead of recipes. */
type Tab = "recipes" | "uses" | "members";

/** Short numbers: whole when they are, otherwise up to two decimals. */
const short = (n: number) => String(Math.round(n * 100) / 100);

/** Rows of items per page, and the page size before the grid has been laid out. */
const GRID_ROWS = 6;
const GRID_PAGE = 40;
const CARD_HEIGHT = 110;

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
  private tab: Tab = "recipes";
  private synced = "";

  constructor(
    private readonly game: () => GameState,
    private readonly openNode: () => number | null,
    private readonly changed: () => void,
  ) {
    this.root.className = "dock";
    this.root.hidden = true;
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
    this.drawGrid();

    // Like the classic mod: hover any item, then R for recipes or U for uses.
    window.addEventListener("keydown", (e) => {
      if (e.target instanceof HTMLInputElement || e.ctrlKey || e.metaKey) return;
      const key = e.key.toLowerCase();
      if (key !== "r" && key !== "u") return;
      const id = document.querySelector<HTMLElement>("[data-item]:hover")?.dataset.item;
      if (id) this.show(id, key === "r" ? "recipes" : "uses");
    });
  }

  toggle(): void {
    this.setOpen(this.root.hidden === true);
  }

  private setOpen(open: boolean): void {
    this.root.hidden = !open;
    document.body.classList.toggle("dock-open", open);
    // The page size depends on how many slots fit across, which is only known once the dock shows.
    if (open) this.drawGrid();
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
    this.setOpen(true);
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
      !query || itemName(id).toLowerCase().includes(query) || itemCode(id).toLowerCase().includes(query)).sort(compareItems);
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

  private recipeCard(recipe: Recipe): HTMLElement {
    const card = document.createElement("div");
    card.className = "card";
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
    const form = recipe.form && recipe.machine === "forming_bench" ? ` (${formLabel(recipe.form)})` : "";
    const manual = machineManual(recipe.machine);
    const hand = manual === "keys" ? tr(" · 키 입력") : manual === "click" ? tr(" · 클릭") : "";
    const note = document.createElement("div");
    note.className = "card-note";
    const power = machinePower(recipe.machine) ? ` · ${tr("동력")} ${machinePower(recipe.machine)}` : "";
    const makes = machinePowerOut(recipe.machine) ? ` · ${tr("동력")} +${machinePowerOut(recipe.machine)}` : "";
    const burn = heat ? ` · ${tr("열")} ${short(heat)}/${tr("초")}` : "";
    note.textContent = `${machineName(recipe.machine)}${form} · ${recipe.time}${tr("초")}${hand}${power}${makes}${burn}`;
    const fill = this.fillButton(recipe);
    if (fill) row.append(fill);
    card.append(row, note);
    return card;
  }

  /** Shown on recipes the open machine can run. Takes from the bag only, never the warehouse. */
  private fillButton(recipe: Recipe): HTMLButtonElement | null {
    const s = this.game();
    const id = this.openNode();
    const node = id === null ? undefined : nodeById(s, id);
    if (!node || !runsRecipe(node, recipe) || !Object.keys(recipe.in).length) return null;
    const b = document.createElement("button");
    b.type = "button";
    b.className = "tech push";
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

  /** Redraws when the open machine or the bag changes, so the fill buttons stay true. */
  sync(): void {
    if (this.root.hidden || !this.item) return;
    const s = this.game();
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
    );

    const cards: HTMLElement[] = [];
    if (this.tab === "members") {
      if (members.length) cards.push(this.membersCard(members));
    } else if (this.tab === "recipes") {
      if (source) cards.push(this.textCard(source));
      cards.push(...recipes.map((r) => this.recipeCard(r)));
    } else {
      cards.push(...burns.map((type) => this.burnCard(type, id)));
      cards.push(...uses.map((r) => this.recipeCard(r)));
      cards.push(...builds.map(([type, cost]) => this.buildCard(type, cost)));
    }
    if (!cards.length) cards.push(this.textCard(tr("아직 없습니다")));
    // As many cards as the panel has room for.
    const room = this.detail.clientHeight || window.innerHeight / 2;
    const perPage = Math.max(1, Math.floor((room - CARD_HEIGHT) / CARD_HEIGHT));
    const pages = Math.ceil(cards.length / perPage);
    this.cardPage = Math.min(this.cardPage, pages - 1);
    const shown = cards.slice(this.cardPage * perPage, (this.cardPage + 1) * perPage);
    const bar = pager(this.cardPage, pages, (page) => {
      this.cardPage = page;
      this.drawDetail();
    });
    this.detail.append(head, tabs, ...shown, bar);
  }
}
