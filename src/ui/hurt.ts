// Health lost, shown: a small number with the damage taken and red at the screen's edges; and after a collapse, a
// notice of what was lost.
import { tr } from "../i18n";
import { itemCode } from "../content";
import { GameState, HurtCause, creatureInfo } from "../engine/game";

/** Damage at which the red edge is at its strongest. */
const HURT_FULL = 10;
/** Matches the longest hurt animation in style.css. */
const HURT_MS = 1600;
const NOTICE_MS = 6000;

/** The words for what took the health, shown with the amount: "체력 -3 늑대". */
function hurtCause(cause: HurtCause | undefined): string {
  if (cause === "melee" || cause === "ranged" || cause === "yeti") return tr(creatureInfo(cause).name);
  return cause === "water" ? tr("물") : cause === "hill" ? tr("고도 변화") : cause === "hunger" ? tr("굶주림") : "";
}

export class Hurt {
  /** The collapse notice, placed by the page among the map's things. */
  readonly notice = document.createElement("div");
  private readonly hurtFlash = document.createElement("div");
  private readonly hurtEdge = document.createElement("div");
  private lastHp: number;
  private hurtTimer = 0;
  private noticeUntil = 0;

  /** `vitals` is the top bar's line, marked along with the edges. */
  constructor(private readonly game: () => GameState, private readonly vitals: HTMLElement) {
    // A small number shows the damage taken, and the screen's edges glow red for a moment, stronger for a
    // bigger blow. Only the edges: a flash over the whole picture was hard on the eyes.
    const { hurtFlash, hurtEdge, notice } = this;
    hurtFlash.className = "hurt";
    hurtFlash.setAttribute("aria-hidden", "true");
    hurtEdge.className = "hurt-edge";
    hurtEdge.setAttribute("aria-hidden", "true");
    document.body.append(hurtFlash, hurtEdge);
    this.lastHp = game().hp;
    notice.className = "notice";
    notice.hidden = true;
  }

  private showHurt(amount: number): void {
    const { hurtFlash, hurtEdge, vitals } = this;
    hurtFlash.textContent = `${tr("체력")} -${amount} ${hurtCause(this.game().hurtBy)}`.trim();
    hurtEdge.style.setProperty("--hurt", String(0.35 + 0.65 * Math.min(1, amount / HURT_FULL)));
    for (const el of [hurtFlash, hurtEdge, vitals]) {
      el.classList.remove("hit");
      void el.offsetWidth; // restart the animation if it is already running
      el.classList.add("hit");
    }
    // The clock rebuilds the vitals every second, which would replay a mark left on them.
    clearTimeout(this.hurtTimer);
    this.hurtTimer = window.setTimeout(() => {
      hurtFlash.classList.remove("hit");
      hurtEdge.classList.remove("hit");
      vitals.classList.remove("hit");
    }, HURT_MS);
  }

  draw(): void {
    const state = this.game();
    const { notice } = this;
    // A collapse jumps health back up, so it counts as a hit even though the number rises.
    if (state.hp < this.lastHp) this.showHurt(this.lastHp - state.hp);
    else if (state.lost) this.showHurt(this.lastHp);
    this.lastHp = state.hp;
    if (state.lost) {
      const items = state.lost.map((s) => `${itemCode(s.id)} -${s.n}`).join(", ");
      notice.textContent = items ? `${tr("쓰러졌습니다. 잃은 재료:")} ${items}` : tr("쓰러졌습니다.");
      notice.hidden = false;
      this.noticeUntil = performance.now() + NOTICE_MS;
      state.lost = null;
    } else if (!notice.hidden && performance.now() > this.noticeUntil) {
      notice.hidden = true;
    }
  }
}
