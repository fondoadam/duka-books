import { describe, expect, it } from "vitest";
import { MockLanguageModelV4 } from "ai/test";
import type { Infer } from "convex/values";
import type { proposedEntry } from "../convex/schema";
import { applyCorrection, interpretCorrection, parseCorrection } from "../convex/lib/corrections";
import { spokenAmount } from "../convex/lib/spoken";
import { fewShot } from "../convex/lib/extract";

type Entry = Infer<typeof proposedEntry>;
const entry = (e: Partial<Entry>): Entry => ({
  date: "2026-10-29", description: "x", quantity: null, amountCents: 10000, kind: "sale", method: "cash", counterparty: null, ref: null, ...e,
});

describe("parseCorrection", () => {
  it.each([
    ["2 = 450", { line: 2, amountKes: 450 }],
    ["2=450", { line: 2, amountKes: 450 }],
    ["2 450", { line: 2, amountKes: 450 }],
    ["3 = 1,250.50", { line: 3, amountKes: 1250.5 }],
    ["futa 2", { line: 2, delete: true }],
    ["Futa 1", { line: 1, delete: true }],
    ["2 deni", { line: 2, method: "credit" }],
    ["2 mpesa", { line: 2, method: "mpesa" }],
    ["1 m-pesa", { line: 1, method: "mpesa" }],
    ["1 cash", { line: 1, method: "cash" }],
    ["1 matumizi", { line: 1, kind: "expense" }],
    ["2 = 450 deni", { line: 2, amountKes: 450, method: "credit" }],
  ])("%s", (text, expected) => {
    expect(parseCorrection(text)).toEqual(expected);
  });

  it.each(["450", "2", "sawa", "nimeuza unga 2", "0 = 450", "2 = 450 tafadhali", "futa"])("ignores %s", (text) => {
    expect(parseCorrection(text)).toBeNull();
  });
});

describe("applyCorrection", () => {
  const entries = [entry({ description: "Unga", amountCents: 54000 }), entry({ description: "Sukari", amountCents: 36000, method: "credit" })];

  it("fixing line 2 changes only line 2", () => {
    const result = applyCorrection(entries, { line: 2, amountKes: 450 });
    expect(result).toMatchObject({ ok: true, before: entries[1], after: { ...entries[1], amountCents: 45000 } });
    if (!result.ok) throw new Error();
    expect(result.entries).toEqual([entries[0], { ...entries[1], amountCents: 45000 }]);
  });

  it("deletes a line", () => {
    const result = applyCorrection(entries, { line: 1, delete: true });
    expect(result).toMatchObject({ ok: true, entries: [entries[1]], before: entries[0], after: null });
  });

  it("refuses a line that isn't there", () => {
    expect(applyCorrection(entries, { line: 3, amountKes: 10 })).toEqual({ ok: false });
  });
});

describe("fewShot", () => {
  it("shows each fix as before and after, and is empty without fixes", () => {
    expect(fewShot([])).toBe("");
    const text = fewShot([
      { before: entry({ description: "Sukari", amountCents: 36000 }), after: entry({ description: "Sukari", amountCents: 45000, method: "credit" }) },
      { before: entry({ description: "Jumla" }), after: null },
    ]);
    expect(text).toContain(`You read "Sukari" KES 360 sale cash; the owner corrected it to "Sukari" KES 450 sale credit.`);
    expect(text).toContain(`"Jumla" KES 100 sale cash; the owner deleted it`);
  });
});

describe("interpretCorrection", () => {
  const usage = { inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 1, text: 1, reasoning: 0 } };
  const said = (json: object) =>
    new MockLanguageModelV4({ doGenerate: { content: [{ type: "text", text: JSON.stringify(json) }], finishReason: { unified: "stop", raw: undefined }, usage, warnings: [] } });
  const entries = [entry({ description: "Unga 2kg", amountCents: 54000 }), entry({ description: "Sukari", amountCents: 36000, method: "mpesa" })];

  it("trusts the exact reading of a spelled-out amount over the model's", async () => {
    const fix = await interpretCorrection("sukari ilikuwa mia nne hamsini", entries, said({ line: 2, amountKes: 440, method: null, kind: null, delete: false }));
    expect(fix).toEqual({ line: 2, amountKes: 450 });
  });

  it("keeps the model's amount when the message has no spelled-out number", async () => {
    const fix = await interpretCorrection("sukari ilikuwa 450", entries, said({ line: 2, amountKes: 450, method: null, kind: null, delete: false }));
    expect(fix).toEqual({ line: 2, amountKes: 450 });
  });
});

describe("spokenAmount", () => {
  it("reads one spelled-out amount, and refuses when there are none or two", () => {
    expect(spokenAmount("sukari ilikuwa mia nne hamsini")).toBe(450);
    expect(spokenAmount("unga ni elfu moja na mia mbili")).toBe(1200);
    expect(spokenAmount("sukari ilikuwa 450")).toBeNull();
    expect(spokenAmount("mia moja si mia mbili")).toBeNull();
  });
});
