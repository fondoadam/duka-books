import { v } from "convex/values";
import { internalMutation, type MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { proposedEntry } from "./schema";
import { post } from "./lib/posting";

async function isPosted(ctx: MutationCtx, shopId: Id<"shops">, ref: string | null) {
  if (!ref) return false;
  const hit = await ctx.db
    .query("journal")
    .withIndex("by_shop_ref", (q) => q.eq("shopId", shopId).eq("ref", ref))
    .first();
  return hit !== null;
}

// Drops entries whose transaction code is already in the books, so a re-forwarded SMS isn't proposed twice.
// proposalId is null when nothing new is left.
export const propose = internalMutation({
  args: {
    shopId: v.id("shops"),
    inboundId: v.id("inbound"),
    entries: v.array(proposedEntry),
    confidence: v.number(),
  },
  handler: async (ctx, { entries, ...args }) => {
    const fresh = [];
    for (const e of entries) if (!(await isPosted(ctx, args.shopId, e.ref))) fresh.push(e);
    const duplicates = entries.length - fresh.length;
    if (fresh.length === 0) return { proposalId: null, entries: fresh, duplicates };
    const proposalId = await ctx.db.insert("proposals", { ...args, entries: fresh, status: "pending" });
    return { proposalId, entries: fresh, duplicates };
  },
});

// Called from the owner's button tap. Only the shop that owns the proposal can settle it.
export const settle = internalMutation({
  args: { proposalId: v.string(), shopId: v.id("shops"), confirm: v.boolean() },
  handler: async (ctx, { proposalId, shopId, confirm }) => {
    const id = ctx.db.normalizeId("proposals", proposalId);
    const proposal = id && (await ctx.db.get(id));
    if (!proposal || proposal.shopId !== shopId || proposal.status !== "pending") return null;

    await ctx.db.patch(proposal._id, { status: confirm ? "confirmed" : "rejected" });
    if (!confirm) return { confirmed: false, count: 0 };

    // Checked again here: two pending proposals can hold the same SMS.
    let count = 0;
    for (const entry of proposal.entries) {
      if (await isPosted(ctx, shopId, entry.ref)) continue;
      await ctx.db.insert("journal", {
        shopId,
        proposalId: proposal._id,
        date: entry.date,
        memo: entry.description,
        ref: entry.ref,
        counterparty: entry.counterparty,
        lines: post(entry),
      });
      count++;
    }
    return { confirmed: true, count };
  },
});
