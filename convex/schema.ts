import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const entryKind = v.union(
  v.literal("sale"),
  v.literal("purchase"),
  v.literal("expense"),
  v.literal("payment_received"),
  v.literal("payment_made"),
);

export const paymentMethod = v.union(
  v.literal("cash"),
  v.literal("mpesa"),
  v.literal("credit"),
  v.literal("unknown"),
);

// One line the model read off a photo, SMS or voice note. Amounts are integer cents (KES).
export const proposedEntry = v.object({
  date: v.string(),
  description: v.string(),
  quantity: v.union(v.number(), v.null()),
  amountCents: v.number(),
  kind: entryKind,
  method: paymentMethod,
  counterparty: v.union(v.string(), v.null()),
});

export const account = v.union(
  v.literal("cash"),
  v.literal("mpesa"),
  v.literal("receivables"),
  v.literal("payables"),
  v.literal("inventory"),
  v.literal("sales"),
  v.literal("expenses"),
);

export default defineSchema({
  // A shop is identified by the owner's WhatsApp number (wa_id).
  shops: defineTable({
    waId: v.string(),
    name: v.union(v.string(), v.null()),
    language: v.union(v.literal("sw"), v.literal("en")),
  }).index("by_wa_id", ["waId"]),

  // Raw WhatsApp messages, deduped by Meta's message id (webhooks retry).
  inbound: defineTable({
    shopId: v.id("shops"),
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
    status: v.union(v.literal("received"), v.literal("processed"), v.literal("failed")),
    error: v.union(v.string(), v.null()),
  }).index("by_wa_message_id", ["waMessageId"]),

  // The model proposes; the owner confirms. Nothing reaches the ledger without a tap.
  proposals: defineTable({
    shopId: v.id("shops"),
    inboundId: v.id("inbound"),
    entries: v.array(proposedEntry),
    confidence: v.number(),
    status: v.union(v.literal("pending"), v.literal("confirmed"), v.literal("rejected")),
  }).index("by_shop_status", ["shopId", "status"]),

  // Double-entry journal: every entry's lines sum to zero (debits = credits).
  journal: defineTable({
    shopId: v.id("shops"),
    proposalId: v.id("proposals"),
    date: v.string(),
    memo: v.string(),
    lines: v.array(v.object({ account, debitCents: v.number(), creditCents: v.number() })),
  }).index("by_shop_date", ["shopId", "date"]),
});
