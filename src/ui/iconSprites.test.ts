import { describe, expect, it } from "vitest";
import materials from "../../data/materials.json";
import { SECOND_COLOR, SHAPES, SOLID_CHARS, printShape, rampOf } from "./iconSprites";

describe("icon shapes", () => {
  it("keeps digit colours and character output unchanged when adding an accent ramp", () => {
    const ramp = rampOf("#e34b50");
    const accent = rampOf("#f2ead8");
    const expected = ramp.map((color, i) => `<span style="color:${color}">${SOLID_CHARS[i]}</span>`).join("") + " \n ";
    expect(printShape(["01234.", "."], SOLID_CHARS, ramp)).toBe(expected);
    expect(printShape(["01234.", "."], SOLID_CHARS, ramp, accent)).toBe(expected);
  });

  it("prints all five accent tones alongside the unchanged item tones", () => {
    const ramp = rampOf("#e34b50");
    const accent = rampOf(SECOND_COLOR.meat);
    const expected = ramp.map((color, i) =>
      `<span style="color:${color}">${SOLID_CHARS[i]}</span><span style="color:${accent[i]}">${SOLID_CHARS[i]}</span>`
    ).join("");
    expect(printShape(["0a1b2c3d4e"], SOLID_CHARS, ramp, accent)).toBe(expected);
    for (const [name, rows] of Object.entries(SHAPES)) {
      expect(rows.every((row) => /^[.0-4a-e]+$/.test(row))).toBe(true);
      if (rows.some((row) => /[a-e]/.test(row))) expect(SECOND_COLOR[name]).toBeDefined();
    }
  });

  it("has a picture for every metal form, so a new part can't break the index", () => {
    expect(Object.keys(materials.forms).filter((form) => !SHAPES[form])).toEqual([]);
  });

  it("draws every shape on the same 26 by 16 grid", () => {
    for (const [name, rows] of Object.entries(SHAPES)) {
      expect([name, rows.length]).toEqual([name, 16]);
      expect([name, rows.filter((row) => row.length !== 26)]).toEqual([name, []]);
    }
  });
});
