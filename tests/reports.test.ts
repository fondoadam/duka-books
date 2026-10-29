/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import schema from "../convex/schema";
import { internal } from "../convex/_generated/api";
import type { Infer } from "convex/values";
import type { proposedEntry } from "../convex/schema";

const modules = import.meta.glob("../convex/**/*.*s");
type Entry = Infer<typeof proposedEntry>;

const entry = (e: Partial<Entry> & Pick<Entry, "kind" | "amountCents">): Entry => ({
  date: "2026-10-28", description: "x", quantity: null, method: "cash", counterparty: null, ref: null, ...e,
});

// Posts entries the way the owner would: propose, then tap confirm.
async function book(t: ReturnType<typeof convexTest>, entries: Entry[]) {
  const { shopId, inboundId } = await t.run(async (ctx) => {
    const shopId = (await ctx.db.query("shops").first())?._id ?? (await ctx.db.insert("shops", { waId: "254700000001", name: null, language: "sw" }));
    const inboundId = await ctx.db.insert("inbound", { shopId, waMessageId: `wamid.${Math.random()}`, kind: "text", text: null, mediaId: null, mimeType: null, status: "processed", error: null });
    return { shopId, inboundId };
  });
  const { proposalId } = await t.mutation(internal.ledger.propose, { shopId, inboundId, entries, confidence: 1 });
  await t.mutation(internal.ledger.settle, { proposalId: proposalId!, shopId, confirm: true });
  return shopId;
}

describe("reports", () => {
  it("profit = sales − expenses − purchases, inside the period only", async () => {
    const t = convexTest(schema, modules);
    const shopId = await book(t, [
      entry({ kind: "sale", amountCents: 65000, method: "mpesa" }),
      entry({ kind: "sale", amountCents: 20000 }),
      entry({ kind: "purchase", amountCents: 30000 }),
      entry({ kind: "expense", amountCents: 5000, method: "mpesa" }),
      entry({ kind: "loan_received", amountCents: 5000, method: "mpesa" }),
      entry({ kind: "loan_fee", amountCents: 50, method: "mpesa" }),
      entry({ kind: "sale", amountCents: 99900, date: "2026-10-25" }), // last week
    ]);
    const totals = await t.query(internal.reports.totals, { shopId, from: "2026-10-26", to: "2026-11-01" });
    expect(totals).toEqual({
      salesCents: 85000,
      purchasesCents: 30000,
      expensesCents: 5050,
      profitCents: 49950,
      cashCents: 20000 - 30000,
      mpesaCents: 65000 - 5000 + 5000,
    });
  });

  it("credit sale shows in debtors and leaves after payment_received", async () => {
    const t = convexTest(schema, modules);
    const shopId = await book(t, [
      entry({ kind: "sale", amountCents: 36000, method: "credit", counterparty: "Mama Njeri" }),
      entry({ kind: "sale", amountCents: 12000, method: "credit", counterparty: "Baraka" }),
    ]);
    expect(await t.query(internal.reports.debtors, { shopId })).toEqual([
      { name: "Mama Njeri", owedCents: 36000 },
      { name: "Baraka", owedCents: 12000 },
    ]);
    await book(t, [entry({ kind: "payment_received", amountCents: 36000, method: "mpesa", counterparty: "Mama Njeri" })]);
    expect(await t.query(internal.reports.debtors, { shopId })).toEqual([{ name: "Baraka", owedCents: 12000 }]);
  });

  it("Fuliza owed = draws + fees − repayments", async () => {
    const t = convexTest(schema, modules);
    const shopId = await book(t, [
      entry({ kind: "loan_received", amountCents: 5000, method: "mpesa" }),
      entry({ kind: "loan_fee", amountCents: 50, method: "mpesa" }),
      entry({ kind: "loan_repaid", amountCents: 2000, method: "mpesa" }),
    ]);
    expect(await t.query(internal.reports.loans, { shopId })).toEqual({ owedCents: 3050 });
  });
});
