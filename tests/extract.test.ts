import { describe, expect, it } from "vitest";
import { MockLanguageModelV4 } from "ai/test";
import { interpretCorrection } from "../convex/lib/corrections";
import { finish, sumCheck } from "../convex/lib/extract";

const usage = { inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 1, text: 1, reasoning: 0 } };
const replying = (json: object) =>
  new MockLanguageModelV4({
    doGenerate: async () => ({ content: [{ type: "text", text: JSON.stringify(json) }], finishReason: { unified: "stop", raw: undefined }, usage, warnings: [] }),
  });

const line = (amountKes: number, kind: "sale" | "expense" | "purchase" = "sale") => ({
  date: "2026-10-29", description: "x", quantity: null, amountKes, kind, method: "cash" as const, counterparty: null, ref: null,
});

describe("sumCheck", () => {
  it("is quiet without a written total or when the lines add up", () => {
    expect(sumCheck([line(540), line(360)], null)).toBeNull();
    expect(sumCheck([line(540), line(360)], 900)).toBeNull();
    // A page total that only counts the sales still adds up.
    expect(sumCheck([line(540), line(360), line(100, "expense")], 900)).toBeNull();
  });

  it("warns when the written total and the lines differ", () => {
    expect(sumCheck([line(540), line(360)], 1350)).toBe(
      "Jumla iliyoandikwa ni KES 1,350, lakini mistari niliyosoma inajumlisha KES 900. Huenda kuna mstari niliokosa au kusoma vibaya.",
    );
  });

  it("finish() moves the warning into notes and drops the total field", () => {
    const out = finish({ entries: [line(540)], confidence: 0.9, notes: "Mstari 3 hausomeki.", writtenTotalKes: 900 });
    expect(out).toEqual({ entries: [line(540)], confidence: 0.9, notes: expect.stringMatching(/^Mstari 3 hausomeki\. Jumla iliyoandikwa ni KES 900/) });
    expect("writtenTotalKes" in out).toBe(false);
  });
});

describe("interpretCorrection (model fallback, live only)", () => {
  const entries = [
    { date: "2026-10-29", description: "Unga", quantity: null, amountCents: 54000, kind: "sale" as const, method: "cash" as const, counterparty: null, ref: null },
    { date: "2026-10-29", description: "Sukari", quantity: null, amountCents: 36000, kind: "sale" as const, method: "cash" as const, counterparty: null, ref: null },
  ];

  it("turns free text into a correction", async () => {
    const model = replying({ line: 2, amountKes: 450, method: null, kind: null, delete: false });
    expect(await interpretCorrection("sukari ilikuwa mia nne hamsini", entries, model)).toEqual({ line: 2, amountKes: 450 });
  });

  it("returns null when the model finds no correction", async () => {
    const model = replying({ line: null, amountKes: null, method: null, kind: null, delete: false });
    expect(await interpretCorrection("habari yako", entries, model)).toBeNull();
  });

  it("maps a delete", async () => {
    const model = replying({ line: 1, amountKes: null, method: null, kind: null, delete: true });
    expect(await interpretCorrection("ondoa unga", entries, model)).toEqual({ line: 1, delete: true });
  });
});
