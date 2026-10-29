import { describe, expect, it } from "vitest";
import type { Infer } from "convex/values";
import type { proposedEntry } from "../convex/schema";
import { applyCorrection, parseCorrection } from "../convex/lib/corrections";
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
