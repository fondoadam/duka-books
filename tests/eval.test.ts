import { describe, expect, it } from "vitest";
import { score } from "../scripts/score";

describe("eval score", () => {
  it("counts a sample right only when every amount is found and nothing is invented", () => {
    const want = [{ description: "Unga", amountKes: 540, kind: "sale" }, { description: "Sukari", amountKes: 360, kind: "sale" }];
    expect(score(want, [{ description: "unga", amountKes: 540, kind: "sale" }, { description: "sukari", amountKes: 360, kind: "purchase" }]))
      .toMatchObject({ matched: 2, recall: 1, kindAccuracy: 0.5, allAmountsRight: true });
    const bad = score(want, [{ description: "unga", amountKes: 540, kind: "sale" }, { description: "sukari", amountKes: 630, kind: "sale" }]);
    expect(bad).toMatchObject({ matched: 1, recall: 0.5, allAmountsRight: false });
    expect(bad.missed).toEqual([want[1]]);
    expect(bad.extra).toEqual([{ description: "sukari", amountKes: 630, kind: "sale" }]);
  });

  it("matches duplicate amounts one to one", () => {
    const want = [{ description: "a", amountKes: 100 }, { description: "b", amountKes: 100 }];
    expect(score(want, [{ description: "a", amountKes: 100, kind: "sale" }]).matched).toBe(1);
  });
});
