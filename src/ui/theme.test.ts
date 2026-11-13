// The ages' tones reach everything only if nothing paints with a colour of its own. Every colour in the
// stylesheet is a theme token (or a mix of tokens); colours are written only where the tokens are defined.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("../style.css", import.meta.url), "utf8");

describe("theme", () => {
  it("writes colours only where the tokens are defined, so every part follows the age", () => {
    const strays = css
      .split("\n")
      .map((line, i) => [i + 1, line] as const)
      // Token definitions: `--name: #hex;` in :root or an age's rule.
      .map(([n, line]) => [n, line.replace(/--[\w-]+:\s*#[0-9a-fA-F]{3,8}\s*;?/g, "")] as const)
      // Shadows are plain black at any age.
      .map(([n, line]) => [n, line.replace(/rgb\(0 0 0 \/ \d+%\)/g, "")] as const)
      .filter(([, line]) => /#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/.test(line))
      .map(([n, line]) => `${n}: ${line.trim().slice(0, 80)}`);
    expect(strays).toEqual([]);
  });

  it("gives both ages every neutral token, so switching age leaves nothing from the other", () => {
    const tokens = (rule: string) => new Set([...(css.match(new RegExp(`${rule}\\s*\\{([^}]*)\\}`))?.[1] ?? "").matchAll(/(--[\w-]+):/g)].map((m) => m[1]));
    const s0 = tokens("body\\.era-s0");
    const s1 = tokens("body\\.era-s1");
    expect([...s0].sort()).toEqual([...s1].sort());
    for (const name of ["--bg", "--panel", "--line", "--fg", "--dim", "--faint", "--era-metal"]) expect(s0.has(name)).toBe(true);
  });
});
