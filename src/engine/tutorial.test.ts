import { describe, expect, it } from "vitest";
import { addTo, createGame, isRevealed, loadSave, placeMachine } from "./game";
import { familyOf } from "../content";
import { TUTORIAL, acknowledgeStep, advanceTutorial, currentStep, elsewhere } from "./tutorial";
import { BASE } from "./world";

const at = (id: string) => TUTORIAL.findIndex((step) => step.id === id);

describe("S0 tutorial", () => {
  it("starts a new game on its first step, which sends the player out to the map", () => {
    const s = createGame(1);
    advanceTutorial(s);
    expect(currentStep(s)?.id).toBe("vitals");
    // Only to read: nothing in the game moves it on, the card's button does.
    s.player = { x: BASE.x + 9, y: BASE.y };
    advanceTutorial(s);
    expect(currentStep(s)?.id).toBe("vitals");
    acknowledgeStep(s);
    expect(currentStep(s)?.id).toBe("top");
    const t = createGame(1);
    acknowledgeStep(t);
    expect(currentStep(t)?.id).toBe("walk");
    expect(elsewhere(t, currentStep(t)!, true)).toBe(true);
    expect(elsewhere(t, currentStep(t)!, false)).toBe(false);
  });

  it("teaches walking next: done once the player is 6 cells out, and it stays done back at the base", () => {
    const s = createGame(1);
    acknowledgeStep(s);
    s.player = { x: BASE.x + 5, y: BASE.y };
    advanceTutorial(s);
    expect(currentStep(s)?.id).toBe("walk");
    s.player = { x: BASE.x + 6, y: BASE.y };
    advanceTutorial(s);
    expect(currentStep(s)?.id).toBe("top");
    acknowledgeStep(s);
    expect(currentStep(s)?.id).toBe("food");
    s.player = { ...BASE };
    advanceTutorial(s);
    expect(currentStep(s)?.id).toBe("food");
  });

  it("lights the way from the base to the promised clay once the clay step comes up", () => {
    const s = createGame(7);
    const clay = s.sites.find((v) => familyOf(v.ore) === "clay")!;
    expect(isRevealed(s, clay.x, clay.y)).toBe(false);
    addTo(s.inv, "Mu", 4);
    advanceTutorial(s);
    expect(currentStep(s)?.id).toBe("bag");
    acknowledgeStep(s);
    expect(currentStep(s)?.id).toBe("clay");
    expect(isRevealed(s, clay.x, clay.y)).toBe(true);
    const mid = { x: Math.round((BASE.x + clay.x) / 2), y: Math.round((BASE.y + clay.y) / 2) };
    expect(isRevealed(s, mid.x, mid.y)).toBe(true);
  });

  it("asks for food next, picked or cooked, then clay", () => {
    const s = createGame(1);
    addTo(s.inv, "Mu", 3);
    advanceTutorial(s);
    expect(currentStep(s)?.id).toBe("food");
    addTo(s.inv, "Bc", 1);
    advanceTutorial(s);
    expect(currentStep(s)?.id).toBe("bag");
    acknowledgeStep(s);
    expect(currentStep(s)?.id).toBe("clay");
  });

  it("moves on once the step is done, and never back", () => {
    const s = createGame(1);
    addTo(s.inv, "Mu", 4);
    addTo(s.inv, "Kn", 12);
    advanceTutorial(s);
    expect(currentStep(s)?.id).toBe("index");
    acknowledgeStep(s);
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
