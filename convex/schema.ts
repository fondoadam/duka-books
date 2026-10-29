import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const entryKind = v.union(
  v.literal("sale"),
  v.literal("purchase"),
  v.literal("expense"),
  v.literal("payment_received"),
  v.literal("payment_made"),
  // Fuliza, Safaricom's M-Pesa overdraft: borrowing and repaying are not sales or spending; the access fee is.
  v.literal("loan_received"),
  v.literal("loan_repaid"),
  v.literal("loan_fee"),
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
  // M-Pesa or receipt transaction code. The ledger refuses a ref it has already posted.
  ref: v.union(v.string(), v.null()),
});

export const account = v.union(
  v.literal("cash"),
  v.literal("mpesa"),
  v.literal("receivables"),
  v.literal("payables"),
  v.literal("loans"),
  v.literal("inventory"),
  v.literal("sales"),
  v.literal("expenses"),
);

// A document (the P&L PDF) or image (annotated receipts) sent by link; body is its caption.
export const outboxMedia = v.object({
  type: v.union(v.literal("document"), v.literal("image")),
  link: v.string(),
  filename: v.union(v.string(), v.null()),
});

export default defineSchema({
  // A shop is identified by the owner's WhatsApp number (wa_id).
  shops: defineTable({
    waId: v.string(),
    name: v.union(v.string(), v.null()),
    language: v.union(v.literal("sw"), v.literal("en")),
    // Created by scripts/simulate.ts: replies are logged to the outbox but never sent to Meta.
    simulated: v.optional(v.boolean()),
    // The proposal the owner is fixing after "Si sahihi"; their next "2 = 450" applies to it.
    pendingCorrection: v.optional(v.union(v.id("proposals"), v.null())),
    // WhatsApp only allows free-form messages within 24h of the owner's last one; the evening summary checks this.
    lastInboundAt: v.optional(v.number()),
    // "acha ripoti" turns the evening summary off, "anza ripoti" back on.
    summaryOptOut: v.optional(v.boolean()),
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
    status: v.union(v.literal("pending"), v.literal("correcting"), v.literal("confirmed"), v.literal("rejected")),
  }).index("by_shop_status", ["shopId", "status"]),

  // Every fix the owner made to a proposed line (after is null for a deleted line). Once the model is live, the
  // shop's latest fixes go into the extraction prompt as examples.
  corrections: defineTable({
    shopId: v.id("shops"),
    proposalId: v.id("proposals"),
    before: proposedEntry,
    after: v.union(proposedEntry, v.null()),
  }).index("by_shop", ["shopId"]),

  // Double-entry journal: every entry's lines sum to zero (debits = credits).
  journal: defineTable({
    shopId: v.id("shops"),
    proposalId: v.id("proposals"),
    date: v.string(),
    memo: v.string(),
    ref: v.union(v.string(), v.null()),
    // Customer or supplier, so debts can be grouped by name. Optional only because rows posted before Oct 30 lack it.
    counterparty: v.optional(v.union(v.string(), v.null())),
    lines: v.array(v.object({ account, debitCents: v.number(), creditCents: v.number() })),
  })
    .index("by_shop_date", ["shopId", "date"])
    .index("by_shop_ref", ["shopId", "ref"]),

  // Every message we send, logged before sending. With WHATSAPP_DRY_RUN=1 nothing reaches Meta, so the
  // simulator and tests read replies from here.
  outbox: defineTable({
    to: v.string(),
    body: v.string(),
    buttons: v.union(v.array(v.object({ id: v.string(), title: v.string() })), v.null()),
    media: v.optional(outboxMedia),
    dryRun: v.boolean(),
  }).index("by_to", ["to"]),
});
