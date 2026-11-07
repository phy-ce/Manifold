// Help: every control in one place, opened with the ? key.

const SECTIONS: [string, [string, string][]][] = [
  ["전체", [
    ["?", "이 도움말"],
    ["M", "지도와 기지 전환, 기지 밖에서는 복귀"],
    ["G", "도감 열기"],
    ["Esc", "창 닫기, 선택 풀기"],
  ]],
  ["아이템 칸", [
    ["왼쪽 클릭", "집기, 놓기, 합치기, 바꾸기"],
    ["오른쪽 클릭", "절반 집기, 1개 놓기"],
    ["휠", "1개씩 옮기기"],
    ["Shift+클릭", "빠르게 옮기기"],
    ["E", "마우스를 올린 음식 먹기"],
  ]],
  ["도감", [
    ["R / U", "마우스를 올린 아이템의 얻는 법, 사용처"],
    ["+", "기계 창이 열려 있을 때 인벤토리에서 1회분 넣기"],
    ["Shift + +", "칸이 찰 때까지 넣기"],
  ]],
  ["기지 보드", [
    ["휠", "확대, 축소"],
    ["바닥 드래그", "화면 이동"],
    ["노드 드래그", "노드 옮기기"],
    ["우클릭", "메뉴 열기"],
    ["Shift+클릭", "노드 고르기"],
    ["Shift+드래그", "범위로 고르기"],
    ["Ctrl+드래그", "청사진으로 복사"],
    ["Ctrl+C / V", "복사, 붙여넣기"],
    ["Delete", "고른 청사진 지우기"],
    ["기계 들고 바닥 클릭", "그 자리에 설치"],
  ]],
  ["작업", [
    ["A S D F", "작업대에 표시된 키 누르기"],
    ["그림 클릭", "판금 망치 작업, 태엽 감기"],
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
    panel.setAttribute("aria-label", "조작 도움말");
    const head = document.createElement("div");
    head.className = "bar-row";
    const title = document.createElement("h2");
    title.textContent = "조작";
    const close = document.createElement("button");
    close.type = "button";
    close.className = "tech push";
    close.textContent = "x";
    close.setAttribute("aria-label", "닫기");
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
