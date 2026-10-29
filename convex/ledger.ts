import { v } from "convex/values";
import { internalMutation, internalQuery, type MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { entryKind, paymentMethod, proposedEntry } from "./schema";
import { applyCorrection } from "./lib/corrections";
import { post } from "./lib/posting";

// A proposal the shop owns that is still open (waiting for a tap, or being corrected). Ids come from button
// payloads, so they are untrusted strings.
async function open(ctx: MutationCtx, proposalId: string, shopId: Id<"shops">) {
  const id = ctx.db.normalizeId("proposals", proposalId);
  const proposal = id && (await ctx.db.get(id));
  if (!proposal || proposal.shopId !== shopId) return null;
  return proposal.status === "pending" || proposal.status === "correcting" ? proposal : null;
}

async function clearPending(ctx: MutationCtx, shopId: Id<"shops">, proposalId: Id<"proposals">) {
  const shop = await ctx.db.get(shopId);
  if (shop?.pendingCorrection === proposalId) await ctx.db.patch(shopId, { pendingCorrection: null });
}

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
    const proposal = await open(ctx, proposalId, shopId);
    if (!proposal) return null;

    await ctx.db.patch(proposal._id, { status: confirm ? "confirmed" : "rejected" });
    await clearPending(ctx, shopId, proposal._id);
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

// "Si sahihi": the proposal waits for the owner's fixes instead of being thrown away.
export const startCorrection = internalMutation({
  args: { proposalId: v.string(), shopId: v.id("shops") },
  handler: async (ctx, { proposalId, shopId }) => {
    const proposal = await open(ctx, proposalId, shopId);
    if (!proposal) return null;
    // Only one proposal is corrected at a time; an earlier one goes back to waiting for a tap.
    const shop = await ctx.db.get(shopId);
    const earlier = shop?.pendingCorrection && shop.pendingCorrection !== proposal._id ? await ctx.db.get(shop.pendingCorrection) : null;
    if (earlier?.status === "correcting") await ctx.db.patch(earlier._id, { status: "pending" });
    await ctx.db.patch(proposal._id, { status: "correcting" });
    await ctx.db.patch(shopId, { pendingCorrection: proposal._id });
    return proposal._id;
  },
});

// Applies one fix to the shop's proposal under correction, and remembers it.
export const correct = internalMutation({
  args: {
    shopId: v.id("shops"),
    fix: v.object({
      line: v.number(),
      amountKes: v.optional(v.number()),
      method: v.optional(paymentMethod),
      kind: v.optional(entryKind),
      delete: v.optional(v.literal(true)),
    }),
  },
  handler: async (ctx, { shopId, fix }) => {
    const shop = await ctx.db.get(shopId);
    const proposal = shop?.pendingCorrection ? await ctx.db.get(shop.pendingCorrection) : null;
    if (!proposal || proposal.status !== "correcting") return { status: "none" as const };
    const result = applyCorrection(proposal.entries, fix);
    if (!result.ok) return { status: "no_line" as const, count: proposal.entries.length };

    await ctx.db.insert("corrections", { shopId, proposalId: proposal._id, before: result.before, after: result.after });
    if (result.entries.length === 0) {
      await ctx.db.patch(proposal._id, { status: "rejected" });
      await ctx.db.patch(shopId, { pendingCorrection: null });
      return { status: "emptied" as const };
    }
    await ctx.db.patch(proposal._id, { entries: result.entries });
    return { status: "corrected" as const, proposalId: proposal._id, entries: result.entries };
  },
});

// "Ghairi": drop the proposal. Without an id, the one under correction.
export const cancel = internalMutation({
  args: { shopId: v.id("shops"), proposalId: v.optional(v.string()) },
  handler: async (ctx, { shopId, proposalId }) => {
    const id = proposalId ?? (await ctx.db.get(shopId))?.pendingCorrection;
    const proposal = id ? await open(ctx, id, shopId) : null;
    if (!proposal) return false;
    await ctx.db.patch(proposal._id, { status: "rejected" });
    await clearPending(ctx, shopId, proposal._id);
    return true;
  },
});

// The shop's latest fixes, newest first: few-shot examples for extraction.
export const recentCorrections = internalQuery({
  args: { shopId: v.id("shops"), limit: v.optional(v.number()) },
  handler: async (ctx, { shopId, limit }) => {
    const rows = await ctx.db
      .query("corrections")
      .withIndex("by_shop", (q) => q.eq("shopId", shopId))
      .order("desc")
      .take(limit ?? 5);
    return rows.map(({ before, after }) => ({ before, after }));
  },
});
