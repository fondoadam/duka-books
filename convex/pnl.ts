import type { ActionCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { buildPnlPdf } from "./lib/pnl";
import { kes } from "./lib/money";
import { resolvePeriod, type Period } from "./lib/periods";
import type { Reply } from "./lib/reply";

// Builds the P&L PDF for a month, stores it in Convex file storage and sends it as a WhatsApp document.
export async function sendPnl(ctx: ActionCtx, shop: Doc<"shops">, reply: Reply, period: Period, today: string) {
  // This month runs to today: the statement must not claim days that haven't happened.
  const full = resolvePeriod(period, today);
  const range = { from: full.from, to: full.to > today ? today : full.to };
  const [totals, debtors, loans] = await Promise.all([
    ctx.runQuery(internal.reports.totals, { shopId: shop._id, ...range }),
    ctx.runQuery(internal.reports.debtors, { shopId: shop._id }),
    ctx.runQuery(internal.reports.loans, { shopId: shop._id }),
  ]);
  const pdf = await buildPnlPdf({
    shopName: shop.name,
    waId: shop.waId,
    period: range,
    generatedOn: today,
    totals,
    debtors,
    fulizaOwedCents: loans.owedCents,
  });
  const storageId = await ctx.storage.store(new Blob([new Uint8Array(pdf)], { type: "application/pdf" }));
  const link = await ctx.storage.getUrl(storageId);
  if (!link) throw new Error("P&L stored but has no URL");
  const caption = `Taarifa ya faida na hasara, ${range.from} hadi ${range.to}.\nFaida halisi: ${kes(totals.profitCents)}. Unaweza kuituma kwa SACCO au benki.`;
  await reply.document(link, `Duka-Books-PnL-${range.from.slice(0, 7)}.pdf`, caption);
}
