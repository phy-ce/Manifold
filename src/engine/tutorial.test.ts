import { describe, expect, it } from "vitest";
import { addTo, createGame, loadSave, placeMachine } from "./game";
import { TUTORIAL, advanceTutorial, currentStep, elsewhere } from "./tutorial";

const at = (id: string) => TUTORIAL.findIndex((step) => step.id === id);

describe("S0 tutorial", () => {
  it("starts a new game on its first step, which sends the player out to the map", () => {
    const s = createGame(1);
    advanceTutorial(s);
    expect(currentStep(s)?.id).toBe("food");
    expect(elsewhere(s, currentStep(s)!, true)).toBe(true);
    expect(elsewhere(s, currentStep(s)!, false)).toBe(false);
  });

  it("asks for food first, picked or cooked, then clay", () => {
    const s = createGame(1);
    addTo(s.inv, "Mu", 3);
    advanceTutorial(s);
    expect(currentStep(s)?.id).toBe("food");
    addTo(s.inv, "Bc", 1);
    advanceTutorial(s);
    expect(currentStep(s)?.id).toBe("clay");
  });

  it("moves on once the step is done, and never back", () => {
    const s = createGame(1);
    addTo(s.inv, "Mu", 4);
    addTo(s.inv, "Kn", 12);
    advanceTutorial(s);
    expect(currentStep(s)?.id).toBe("kiln");
    s.inv = s.inv.map(() => null);
    advanceTutorial(s);
    expect(currentStep(s)?.id).toBe("kiln");
  });

  it("skips the steps a player has already gone past", () => {
    const s = createGame(1);
    placeMachine(s, "bloomery", 0, 0);
    advanceTutorial(s);
    expect(s.tutorial!.step).toBeGreaterThanOrEqual(at("ore"));
  });

  it("ends once S0 is over, and stays off when turned off", () => {
    const s = createGame(1);
    s.stage = 1;
    advanceTutorial(s);
    expect(currentStep(s)).toBeNull();
    const t = createGame(2);
    t.tutorial!.off = true;
    expect(currentStep(t)).toBeNull();
  });

  it("is off for a save from before it that is past S0, and on for one still in S0", () => {
    const old = (stage: number) => {
      const s = createGame(3);
      s.stage = stage;
      delete s.tutorial;
      return loadSave(JSON.parse(JSON.stringify(s)))!;
    };
    expect(old(2).tutorial).toEqual({ step: 0, off: true });
    expect(old(0).tutorial).toEqual({ step: 0, off: false });
  });
});
