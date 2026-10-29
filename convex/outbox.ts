import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";

export const log = internalMutation({
  args: {
    to: v.string(),
    body: v.string(),
    buttons: v.union(v.array(v.object({ id: v.string(), title: v.string() })), v.null()),
    dryRun: v.boolean(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("outbox", args);
  },
});

// Newest first. Used by scripts/simulate.ts through `convex run`.
export const recent = internalQuery({
  args: { to: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, { to, limit }) => {
    return await ctx.db
      .query("outbox")
      .withIndex("by_to", (q) => q.eq("to", to))
      .order("desc")
      .take(limit ?? 5);
  },
});
