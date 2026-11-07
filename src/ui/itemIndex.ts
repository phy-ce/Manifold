// Item index: search every known item and see how it is made and what it is used for.
// It docks beside the game so it can stay open next to a machine window.
import {
  Recipe, buildUses, familyMembers, formLabel, indexItems, itemCode, itemName, itemSource, machineManual, machineName, recipesFor, usesOf,
} from "../content";
import { GameState, countOf } from "../engine/game";
import { makeSlot, paintSlot } from "./slots";

type Tab = "recipes" | "uses";

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

  constructor(private readonly game: () => GameState) {
    this.root.className = "dock";
    this.root.hidden = true;
    this.root.setAttribute("aria-label", "아이템 도감");
    this.search.id = "index-search";
    this.search.type = "search";
    this.search.placeholder = "이름이나 코드로 검색";
    this.search.setAttribute("aria-label", "아이템 검색");
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
  }

  /** A family like "coal" isn't an item you hold, so jump to the ore that fills it. */
  private resolve(id: string): string {
    return familyMembers(id)[0] ?? id;
  }

  show(id: string, tab: Tab = "recipes", remember = true): void {
    const next = this.resolve(id);
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
    const found = indexItems().filter((id) =>
      !query || itemName(id).toLowerCase().includes(query) || itemCode(id).toLowerCase().includes(query));
    const pages = Math.max(1, Math.ceil(found.length / GRID_PAGE));
    this.gridPage = Math.min(this.gridPage, pages - 1);
    const start = this.gridPage * GRID_PAGE;
    this.grid.replaceChildren(...found.slice(start, start + GRID_PAGE).map((id) => this.itemSlot(id, undefined)));
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
    const arrow = document.createElement("span");
    arrow.textContent = ">";
    row.append(arrow, ...Object.entries(recipe.out).map(([id, n]) => this.itemSlot(id, n)));
    const form = recipe.form && recipe.machine === "forming_bench" ? ` (${formLabel(recipe.form)})` : "";
    const manual = machineManual(recipe.machine);
    const hand = manual === "keys" ? " · 키 입력" : manual === "click" ? " · 클릭" : "";
    const note = document.createElement("div");
    note.className = "card-note";
    note.textContent = `${machineName(recipe.machine)}${form} · ${recipe.time}초${hand}`;
    card.append(row, note);
    return card;
  }

  private textCard(text: string): HTMLElement {
    const card = document.createElement("div");
    card.className = "card card-note";
    card.textContent = text;
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
    note.textContent = `${machineName(type)} 건설 재료`;
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
    back.setAttribute("aria-label", "이전 아이템");
    back.disabled = !this.history.length;
    back.addEventListener("click", () => {
      const previous = this.history.pop();
      if (previous) this.show(previous, "recipes", false);
    });
    const title = document.createElement("strong");
    title.textContent = itemName(id);
    const owned = document.createElement("span");
    owned.className = "push";
    owned.textContent = `보유 ${countOf(this.game(), id)}`;
    head.append(back, title, owned);

    const recipes = recipesFor(id);
    const source = itemSource(id);
    const uses = usesOf(id);
    const builds = buildUses(id);

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
      tabButton("recipes", `얻는 법 ${recipes.length + (source ? 1 : 0)}`),
      tabButton("uses", `사용처 ${uses.length + builds.length}`),
    );

    const cards: HTMLElement[] = [];
    if (this.tab === "recipes") {
      if (source) cards.push(this.textCard(source));
      cards.push(...recipes.map((r) => this.recipeCard(r)));
    } else {
      cards.push(...uses.map((r) => this.recipeCard(r)));
      cards.push(...builds.map(([type, cost]) => this.buildCard(type, cost)));
    }
    if (!cards.length) cards.push(this.textCard("아직 없습니다"));
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
