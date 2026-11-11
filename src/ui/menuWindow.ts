// The Escape menu: rarely used, game-wide actions kept off the top bar.
import { tr } from "../i18n";

export class MenuWindow {
  readonly root = document.createElement("div");

  constructor(actions: HTMLElement[], name = tr("메뉴")) {
    this.root.className = "window-back";
    this.root.hidden = true;
    const panel = document.createElement("div");
    panel.className = "window menu-window";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", name);
    const head = document.createElement("div");
    head.className = "bar-row";
    const title = document.createElement("h2");
    title.textContent = name;
    const close = document.createElement("button");
    close.type = "button";
    close.className = "tech push";
    close.textContent = "x";
    close.setAttribute("aria-label", tr("닫기"));
    close.addEventListener("click", () => this.close());
    head.append(title, close);
    const resume = document.createElement("button");
    resume.type = "button";
    resume.className = "tech";
    resume.textContent = tr("계속하기");
    resume.addEventListener("click", () => this.close());
    const list = document.createElement("div");
    list.className = "menu-list";
    list.append(resume, ...actions);
    panel.append(head, list);
    this.root.append(panel);
    this.root.addEventListener("click", (e) => {
      if (e.target === this.root) this.close();
    });
  }

  get isOpen(): boolean {
    return !this.root.hidden;
  }

  open(): void {
    this.root.hidden = false;
    (this.root.querySelector(".menu-list button") as HTMLButtonElement | null)?.focus();
  }

  close(): void {
    this.root.hidden = true;
  }
}
