import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";

// Stores one webhook message (once) and schedules processing.
export const record = internalMutation({
  args: {
    waId: v.string(),
    waMessageId: v.string(),
    kind: v.union(
      v.literal("text"),
      v.literal("image"),
      v.literal("audio"),
      v.literal("document"),
      v.literal("button"),
      v.literal("other"),
    ),
    text: v.union(v.string(), v.null()),
    mediaId: v.union(v.string(), v.null()),
    mimeType: v.union(v.string(), v.null()),
    simulated: v.optional(v.boolean()),
  },
  handler: async (ctx, { waId, simulated, ...msg }) => {
    const dupe = await ctx.db
      .query("inbound")
      .withIndex("by_wa_message_id", (q) => q.eq("waMessageId", msg.waMessageId))
      .unique();
    if (dupe) return;

    const shop = await ctx.db
      .query("shops")
      .withIndex("by_wa_id", (q) => q.eq("waId", waId))
      .unique();
    // A real number never turns simulated: the flag only applies to shops the simulator creates.
    const shopId = shop?._id ?? (await ctx.db.insert("shops", { waId, name: null, language: "sw", simulated: simulated || undefined }));
    await ctx.db.patch(shopId, { lastInboundAt: Date.now() });

    const inboundId = await ctx.db.insert("inbound", { shopId, ...msg, status: "received", error: null });
    await ctx.scheduler.runAfter(0, internal.process.inbound, { inboundId });
  },
});

export const get = internalQuery({
  args: { inboundId: v.id("inbound") },
  handler: async (ctx, { inboundId }) => {
    const inbound = await ctx.db.get(inboundId);
    if (!inbound) return null;
    const shop = await ctx.db.get(inbound.shopId);
    return shop && { inbound, shop };
  },
});

export const setStatus = internalMutation({
  args: {
    inboundId: v.id("inbound"),
    status: v.union(v.literal("processed"), v.literal("failed")),
    error: v.union(v.string(), v.null()),
  },
  handler: async (ctx, { inboundId, status, error }) => {
    await ctx.db.patch(inboundId, { status, error });
  },
});
