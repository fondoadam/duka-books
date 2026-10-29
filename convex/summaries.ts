import { v } from "convex/values";
import { internalAction, internalMutation, internalQuery, type ActionCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { nairobiToday, resolvePeriod } from "./lib/periods";
import { replier } from "./lib/reply";
import { summaryText } from "./lib/summary";

const DAY = 24 * 3_600_000;
export const OPT_OUT_HINT = "Andika 'acha ripoti' kuacha ripoti hizi za jioni.";

// Today's summary for one shop: the evening cron and "ripoti" on demand send the same text.
export async function buildSummary(ctx: ActionCtx, shopId: Id<"shops">, today: string) {
  const [todayTotals, yesterday, debtors, loans] = await Promise.all([
    ctx.runQuery(internal.reports.totals, { shopId, ...resolvePeriod("today", today) }),
    ctx.runQuery(internal.reports.totals, { shopId, ...resolvePeriod("yesterday", today) }),
    ctx.runQuery(internal.reports.debtors, { shopId }),
    ctx.runQuery(internal.reports.loans, { shopId }),
  ]);
  return summaryText({ today: todayTotals, yesterday, debtors, fulizaOwedCents: loans.owedCents });
}

// Shops to summarise tonight: booked something today, wrote to us in the last 24h (WhatsApp's free-form
// window; outside it only paid templates are allowed), and haven't opted out.
export const dueShops = internalQuery({
  args: { date: v.string(), now: v.number() },
  handler: async (ctx, { date, now }) => {
    const due = [];
    for (const shop of await ctx.db.query("shops").collect()) {
      if (shop.summaryOptOut || !shop.lastInboundAt || now - shop.lastInboundAt >= DAY) continue;
      const active = await ctx.db
        .query("journal")
        .withIndex("by_shop_date", (q) => q.eq("shopId", shop._id).eq("date", date))
        .first();
      if (active) due.push(shop);
    }
    return due;
  },
});

// 19:00 Nairobi, from crons.ts. One shop failing must not stop the rest.
export const evening = internalAction({
  args: {},
  handler: async (ctx) => {
    const today = nairobiToday();
    for (const shop of await ctx.runQuery(internal.summaries.dueShops, { date: today, now: Date.now() })) {
      try {
        await replier(ctx, shop).text(`${await buildSummary(ctx, shop._id, today)}\n\n${OPT_OUT_HINT}`);
      } catch (err) {
        console.error(`evening summary failed for shop ${shop._id}`, err);
      }
    }
  },
});

export const setOptOut = internalMutation({
  args: { shopId: v.id("shops"), optOut: v.boolean() },
  handler: async (ctx, { shopId, optOut }) => {
    await ctx.db.patch(shopId, { summaryOptOut: optOut });
  },
});
