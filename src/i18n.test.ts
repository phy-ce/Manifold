import { readFileSync, readdirSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import era from "../data/steam-era.json";
import materials from "../data/materials.json";
import ores from "../data/ores.json";
import biomes from "../data/biomes.json";
import tutorial from "../data/tutorial.json";
import { EN, getLanguage, localize, setLanguage, tr } from "./i18n";

const korean = /[가-힣]/;
const stringsIn = (value: unknown): string[] => {
  if (typeof value === "string") return korean.test(value) ? [value] : [];
  if (value && typeof value === "object") return Object.values(value).flatMap(stringsIn);
  return [];
};
const sources = ["src/main.ts", "src/content.ts", "src/engine/game.ts", ...readdirSync("src/ui").map((f) => `src/ui/${f}`)]
  .filter((file) => file.endsWith(".ts"));

describe("translation", () => {
  afterEach(() => setLanguage("ko"));

  it("has English for every string the code asks for", () => {
    const keys = sources.flatMap((file) => [...readFileSync(file, "utf8").matchAll(/\btr\(("(?:[^"\\]|\\.)*")\)/g)].map((m) => JSON.parse(m[1]) as string));
    expect(keys.length).toBeGreaterThan(150);
    expect([...new Set(keys)].filter((key) => EN[key] === undefined)).toEqual([]);
  });

  it("has English for every string in the game data", () => {
    expect([...new Set(stringsIn([era, ores, materials, biomes, tutorial]))].filter((key) => EN[key] === undefined)).toEqual([]);
  });

  it("leaves no Korean outside tr() in the code", () => {
    const left = sources.flatMap((file) => readFileSync(file, "utf8").split(/\r?\n/)
      .map((line) => line.replace(/\/\/.*$/, "").replace(/\/\*.*?\*\//g, "").replace(/\btr\("(?:[^"\\]|\\.)*"\)/g, ""))
      .filter((line) => korean.test(line) && !/^\s*\*/.test(line) && !/\["ko", "한국어"\]/.test(line)));
    expect(left).toEqual([]);
  });

  it("keeps Korean by default and switches on request", () => {
    expect(getLanguage()).toBe("ko");
    expect(tr("철거")).toBe("철거");
    setLanguage("en");
    expect(tr("철거")).toBe("Remove");
    expect(localize({ a: ["철거"], b: 2 })).toEqual({ a: ["Remove"], b: 2 });
  });

  it("falls back to the source text for anything unknown", () => {
    setLanguage("en");
    expect(tr("없는 문구")).toBe("없는 문구");
  });
});
