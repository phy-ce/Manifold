// The Escape menu (sound, the tutorial again, test sets, a new game) and the window of test sets it opens.
import { tr } from "../i18n";
import { TEST_SETS, TestSet } from "../engine/game";
import { MenuWindow } from "./menuWindow";
import { setSound, soundOn } from "./sound";

// The menu's one test button opens a window of test sets, one button each, each asking once more before it
// wipes the game.
const TEST_LABELS: Record<TestSet, [string, string]> = {
  full: [tr("전체"), tr("모든 단계, 광석과 금속, 부품, 기계 2대씩, 장비 한 벌")],
  mythic: [tr("신화시대"), tr("신화시대 재료와 기계 2대씩, 나무·돌·뼈 도구 전부")],
  hunt: [tr("사냥"), tr("사슴이 있는 평원이나 숲에서 창과 칼을 들고 시작")],
  tools: [tr("도구"), tr("모든 도구, 철 머리, 막대기와 재료")],
  gather: [tr("채집물 여러 개"), tr("광맥 위에 사슴 시체 둘, 옆 칸에 시체 둘")],
};

/** What the menu's buttons do to the game, once asked twice where it would wipe it. */
export interface MenuActions {
  startTest: (set: TestSet) => void;
  newGame: () => void;
  guideAgain: () => void;
}

/** Builds the menu and the test-set window; `guideAgain` is its button, disabled by the page past S0. */
export function makeMenus(actions: MenuActions): { menu: MenuWindow; tests: MenuWindow; guideAgain: HTMLButtonElement } {
  const testStarts = TEST_SETS.map((set) => {
    const [label, tip] = TEST_LABELS[set];
    const b = document.createElement("button");
    b.type = "button";
    b.className = "tech";
    b.textContent = label;
    b.dataset.tip = tip;
    b.addEventListener("click", () => {
      if (b.dataset.armed !== "1") {
        b.dataset.armed = "1";
        b.textContent = tr("정말 초기화?");
        setTimeout(() => {
          b.dataset.armed = "";
          b.textContent = label;
        }, 3000);
        return;
      }
      actions.startTest(set);
    });
    return b;
  });
  const reset = document.createElement("button");
  reset.type = "button";
  reset.className = "tech";
  reset.textContent = tr("새 게임");
  // One switch for every sound, quiet by default.
  const soundButton = document.createElement("button");
  soundButton.type = "button";
  soundButton.className = "tech";
  const showSound = () => {
    soundButton.textContent = soundOn() ? tr("소리 켜짐") : tr("소리 꺼짐");
    soundButton.setAttribute("aria-pressed", String(soundOn()));
  };
  showSound();
  soundButton.addEventListener("click", () => {
    setSound(!soundOn());
    showSound();
  });
  // From the menu: start the tutorial again from the top, while still in S0.
  const guideAgain = document.createElement("button");
  guideAgain.type = "button";
  guideAgain.className = "tech";
  guideAgain.textContent = tr("튜토리얼 다시 보기");
  guideAgain.addEventListener("click", () => actions.guideAgain());
  const tests = new MenuWindow(testStarts, tr("테스트"));
  const testButton = document.createElement("button");
  testButton.type = "button";
  testButton.className = "tech";
  testButton.textContent = tr("테스트");
  const menu = new MenuWindow([soundButton, guideAgain, testButton, reset]);
  testButton.addEventListener("click", () => {
    menu.close();
    tests.open();
  });
  reset.addEventListener("click", () => {
    if (reset.dataset.armed !== "1") {
      reset.dataset.armed = "1";
      reset.textContent = tr("정말 초기화?");
      setTimeout(() => {
        reset.dataset.armed = "";
        reset.textContent = tr("새 게임");
      }, 3000);
      return;
    }
    reset.dataset.armed = "";
    reset.textContent = tr("새 게임");
    actions.newGame();
  });
  return { menu, tests, guideAgain };
}
