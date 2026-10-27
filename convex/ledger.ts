import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { proposedEntry } from "./schema";
import { post } from "./lib/posting";

export const propose = internalMutation({
  args: {
    shopId: v.id("shops"),
    inboundId: v.id("inbound"),
    entries: v.array(proposedEntry),
    confidence: v.number(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("proposals", { ...args, status: "pending" });
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

    for (const entry of proposal.entries) {
      await ctx.db.insert("journal", {
        shopId,
        proposalId: proposal._id,
        date: entry.date,
        memo: entry.description,
        lines: post(entry),
      });
    }
    return { confirmed: true, count: proposal.entries.length };
  },
});
