import { tr } from "../i18n";
// Help: every control in one place, opened with the ? key.

const SECTIONS: [string, [string, string][]][] = [
  [tr("전체"), [
    ["?", tr("이 도움말")],
    ["M", tr("지도와 기지 전환, 기지 밖에서는 복귀")],
    ["WASD", tr("지도에서 걷기 (두 키를 함께 누르면 대각선)")],
    ["P", tr("동굴에서 탐사: 멈춰서 주변 광맥 찾기")],
    ["G", tr("도감 열기")],
    ["T", tr("이동 방식 전환: 위험 피하기, 직진")],
    ["Esc", tr("창 닫기, 선택 풀기")],
  ]],
  [tr("아이템 칸"), [
    [tr("왼쪽 클릭"), tr("집기, 놓기, 합치기, 바꾸기")],
    [tr("오른쪽 클릭"), tr("절반 집기, 1개 놓기")],
    [tr("휠"), tr("1개씩 옮기기")],
    [tr("Shift+클릭"), tr("빠르게 옮기기")],
    ["E", tr("마우스를 올린 음식 먹기")],
    [tr("장비 칸 클릭"), tr("손에 든 장비 입기, 벗기")],
  ]],
  [tr("도감"), [
    ["R / U", tr("마우스를 올린 아이템의 얻는 법, 사용처")],
    ["Shift", tr("▱ 표시가 있는 칸 위에서 들어갈 수 있는 아이템 목록")],
    ["+", tr("기계 창이 열려 있을 때 인벤토리에서 1회분 넣기")],
    ["Shift + +", tr("칸이 찰 때까지 넣기")],
  ]],
  [tr("기지 보드"), [
    [tr("휠"), tr("확대, 축소")],
    [tr("바닥 드래그"), tr("화면 이동")],
    [tr("노드 드래그"), tr("노드 옮기기")],
    [tr("우클릭"), tr("메뉴 열기: 이름 바꾸기, 복사, 붙여넣기 등")],
    [tr("Shift+클릭"), tr("노드 고르기")],
    [tr("Shift+드래그"), tr("범위로 고르기")],
    [tr("Ctrl+드래그"), tr("청사진으로 복사")],
    ["Ctrl+C / V", tr("복사, 붙여넣기")],
    ["Delete", tr("고른 청사진 지우기")],
    [tr("기계 들고 바닥 클릭"), tr("그 자리에 설치")],
  ]],
  [tr("작업"), [
    ["A S D F", tr("작업대에 표시된 키 누르기")],
    [tr("그림 클릭"), tr("판금 망치 작업, 태엽 감기")],
  ]],
];

export class HelpWindow {
  readonly root = document.createElement("div");

  constructor() {
    this.root.className = "window-back";
    this.root.hidden = true;
    const panel = document.createElement("div");
    panel.className = "window help";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", tr("조작 도움말"));
    const head = document.createElement("div");
    head.className = "bar-row";
    const title = document.createElement("h2");
    title.textContent = tr("조작");
    const close = document.createElement("button");
    close.type = "button";
    close.className = "tech push";
    close.textContent = "x";
    close.setAttribute("aria-label", tr("닫기"));
    close.addEventListener("click", () => this.toggle(false));
    head.append(title, close);
    const list = document.createElement("div");
    list.className = "help-list";
    for (const [name, rows] of SECTIONS) {
      const section = document.createElement("section");
      const heading = document.createElement("h3");
      heading.textContent = name;
      section.append(heading);
      for (const [key, what] of rows) {
        const row = document.createElement("div");
        row.className = "help-row";
        const keys = document.createElement("kbd");
        keys.textContent = key;
        const text = document.createElement("span");
        text.textContent = what;
        row.append(keys, text);
        section.append(row);
      }
      list.append(section);
    }
    panel.append(head, list);
    this.root.append(panel);
    this.root.addEventListener("click", (e) => {
      if (e.target === this.root) this.toggle(false);
    });
    window.addEventListener("keydown", (e) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.key === "?") this.toggle(this.root.hidden === true);
      else if (e.key === "Escape") this.toggle(false);
    });
  }

  toggle(open: boolean): void {
    this.root.hidden = !open;
  }
}
