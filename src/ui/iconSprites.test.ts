import { describe, expect, it } from "vitest";
import materials from "../../data/materials.json";
import { SHAPES } from "./iconSprites";

describe("icon shapes", () => {
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
