import { v } from "convex/values";
import { internalQuery, type QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

// Every figure the owner is told comes from here, read straight off the journal. Integer cents throughout.

function journal(ctx: QueryCtx, shopId: Id<"shops">, from?: string, to?: string) {
  return ctx.db
    .query("journal")
    .withIndex("by_shop_date", (q) => (from && to ? q.eq("shopId", shopId).gte("date", from).lte("date", to) : q.eq("shopId", shopId)))
    .collect();
}

// Debit minus credit per account. Sales and loans are credit-side, so callers negate them.
function balances(rows: Awaited<ReturnType<typeof journal>>) {
  const net: Record<string, number> = {};
  for (const row of rows) for (const l of row.lines) net[l.account] = (net[l.account] ?? 0) + l.debitCents - l.creditCents;
  return (account: string) => net[account] ?? 0;
}

export const totals = internalQuery({
  args: { shopId: v.id("shops"), from: v.string(), to: v.string() },
  handler: async (ctx, { shopId, from, to }) => {
    const net = balances(await journal(ctx, shopId, from, to));
    const salesCents = -net("sales");
    const purchasesCents = net("inventory");
    const expensesCents = net("expenses");
    return {
      salesCents,
      purchasesCents,
      expensesCents,
      profitCents: salesCents - expensesCents - purchasesCents,
      // Net money in (negative: more went out) during the period.
      cashCents: net("cash"),
      mpesaCents: net("mpesa"),
    };
  },
});

// Customers who owe the shop, largest first.
export const debtors = internalQuery({
  args: { shopId: v.id("shops") },
  handler: async (ctx, { shopId }) => {
    const owed = new Map<string, number>();
    for (const row of await journal(ctx, shopId)) {
      const name = row.counterparty ?? "Bila jina";
      for (const l of row.lines) if (l.account === "receivables") owed.set(name, (owed.get(name) ?? 0) + l.debitCents - l.creditCents);
    }
    return [...owed]
      .filter(([, cents]) => cents > 0)
      .map(([name, owedCents]) => ({ name, owedCents }))
      .sort((a, b) => b.owedCents - a.owedCents);
  },
});

// What the shop still owes on Fuliza.
export const loans = internalQuery({
  args: { shopId: v.id("shops") },
  handler: async (ctx, { shopId }) => ({ owedCents: -balances(await journal(ctx, shopId))("loans") }),
});
