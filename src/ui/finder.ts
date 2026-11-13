// The map's finder, in its column: a search over the places the player has seen, its results in pages, and
// words to click when nothing is typed.
import { tr } from "../i18n";
import { CAVE, itemCode, itemColor, itemMatches, itemName } from "../content";
import { GameState, onThisMap, siteSpotHere, isRevealed, isVisible, standBeside, walkTo } from "../engine/game";
import { Site, emptiedOn, orderSites } from "../engine/world";
import { siteName } from "./mapLook";

/** Height of one search result row and the gap under it, matching .route-row in style.css (--control + --gap-sm). */
const RESULT_ROW = 36;

export class Finder {
  readonly root = document.createElement("div");
  /** Which page of search results shows; the list never scrolls. */
  private resultPage = 0;
  private readonly pagerBar = document.createElement("div");
  private readonly search = document.createElement("input");
  private readonly results = document.createElement("div");
  private readonly hideButton = document.createElement("button");
  /** Emptied veins are left out of search results unless asked for. */
  private hideEmpty = true;
  private drawnResults = "";

  constructor(private readonly game: () => GameState, private readonly changed: () => void) {
    this.root.className = "box finder";
    this.search.id = "map-search";
    this.search.type = "search";
    this.search.placeholder = tr("본 적 있는 곳에서 찾기");
    this.search.setAttribute("aria-label", tr("지도 검색"));
    this.search.addEventListener("input", () => this.drawResults());
    this.results.className = "map-results";
    this.hideButton.type = "button";
    this.hideButton.className = "tech";
    this.hideButton.textContent = tr("고갈 숨기기");
    this.hideButton.classList.add("selected");
    this.hideButton.addEventListener("click", () => {
      this.hideEmpty = !this.hideEmpty;
      this.hideButton.classList.toggle("selected", this.hideEmpty);
      this.drawResults();
    });
    const tools = document.createElement("div");
    tools.className = "bar-row";
    tools.append(this.hideButton);
    this.pagerBar.className = "pager";
    tools.append(this.pagerBar);
    this.root.append(this.search, tools, this.results);
    // The results come in pages of as many rows as fit; a taller screen shows more per page.
    new ResizeObserver(() => {
      this.drawnResults = "";
      this.drawResults();
    }).observe(this.results);
  }

  /** Has the next draw build the list again, as after a note changed. */
  stale(): void {
    this.drawnResults = "";
  }

  /** Points the tutorial at the search box, or stops. */
  pointSearch(on: boolean): void {
    this.search.classList.toggle("tutorial-target", on);
  }

  /** Finds things the player has seen: nothing in unexplored ground is listed. */
  drawResults(): void {
    const s = this.game();
    const query = this.search.value.trim().toLowerCase();
    const emptied = s.sites.filter((v) => emptiedOn(v, s.z)).length;
    const prospected = s.sites.filter((v) => v.found).length;
    const key = `${query}|${s.z}|${s.player.x},${s.player.y}|${s.sites.length}|${emptied}|${prospected}|${this.hideEmpty}`;
    // A page holds as many rows as the box has room for.
    const perPage = Math.max(1, Math.floor((this.results.clientHeight + 4) / RESULT_ROW));
    const full = `${key}|${perPage}|${this.resultPage}`;
    if (full === this.drawnResults) return;
    if (!this.drawnResults.startsWith(`${key}|`)) this.resultPage = 0; // a new search starts on its first page
    this.drawnResults = `${key}|${perPage}|${this.resultPage}`;
    if (!query) {
      // Nothing typed: what there is to find, as words to click, the nearest kinds first.
      const steps = (v: Site) => Math.max(Math.abs(v.x - s.player.x), Math.abs(v.y - s.player.y));
      const known = s.sites
        .filter((v) => v.ore !== CAVE && onThisMap(s, v) && (s.z < 0 || isRevealed(s, v.x, v.y)) && !(this.hideEmpty && emptiedOn(v, s.z)))
        .sort((a, b) => steps(a) - steps(b));
      const words = [...new Set(known.map((v) => itemName(v.ore)))];
      const chips = words.map((word) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "tech search-chip";
        b.textContent = word;
        b.addEventListener("click", () => {
          this.search.value = word;
          this.drawResults();
        });
        return b;
      });
      const wrap = document.createElement("div");
      wrap.className = "search-chips";
      wrap.append(...chips);
      this.results.replaceChildren(wrap);
      this.pagerBar.replaceChildren();
      return;
    }
    const steps = (v: Site) => Math.max(Math.abs(v.x - s.player.x), Math.abs(v.y - s.player.y));
    // What the player knows on this layer, and their own notes on either.
    const here = (v: Site) => onThisMap(s, v) && (s.z < 0 || isRevealed(s, v.x, v.y));
    const matching = s.sites
      .filter((v) => here(v) || !!v.note)
      // By name, code or place name, or by category: "점토" finds every clay vein, "연료" every coal.
      .filter((v) => itemMatches(v.ore, query, [siteName(s, v), v.note ?? ""]));
    const all = orderSites(matching, steps, this.hideEmpty, s.z);
    const pages = Math.max(1, Math.ceil(all.length / perPage));
    this.resultPage = Math.min(this.resultPage, pages - 1);
    this.drawnResults = `${key}|${perPage}|${this.resultPage}`;
    const found = all.slice(this.resultPage * perPage, (this.resultPage + 1) * perPage);
    const turn = (label: string, to: number) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "tech";
      b.textContent = label;
      b.disabled = to < 0 || to >= pages;
      b.addEventListener("click", () => {
        this.resultPage = to;
        this.drawResults();
      });
      return b;
    };
    const count = document.createElement("span");
    count.textContent = `${this.resultPage + 1}/${pages}`;
    this.pagerBar.replaceChildren(...(pages > 1 ? [turn("<", this.resultPage - 1), count, turn(">", this.resultPage + 1)] : []));
    this.results.replaceChildren(...found.map((site) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "route-row";
      const code = document.createElement("span");
      code.style.color = itemColor(site.ore);
      code.textContent = itemCode(site.ore);
      const name = document.createElement("span");
      name.textContent = site.note ? `${siteName(s, site)} · ${site.note}` : siteName(s, site);
      name.className = "route-name";
      const where = document.createElement("span");
      where.className = "push card-note";
      // A note known only on the other layer is listed but can't be walked to from here.
      const spot = here(site) ? siteSpotHere(s, site) : undefined;
      const state = !spot ? (s.z < 0 ? tr("지표") : tr("지하")) : isVisible(s, spot.x, spot.y) ? tr("보임") : tr("기억");
      where.textContent = `${state} · ${steps(site)}${tr("칸")}`;
      b.disabled = !spot;
      b.append(code, name, where);
      b.addEventListener("click", () => {
        const g = this.game();
        const to = siteSpotHere(g, site);
        if (!to) return;
        // Ore in a wall is reached from the floor beside it.
        const wall = "wall" in to && to.wall ? standBeside(g, to.x, to.y) : undefined;
        walkTo(g, wall ?? to);
        this.changed();
      });
      return b;
    }));
    if (!found.length) this.results.textContent = tr("본 적 있는 곳에 없습니다");
  }
}
