/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Infer } from "convex/values";
import schema, { type proposedEntry } from "../convex/schema";
import { internal } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { kes } from "../convex/lib/money";
import { summaryText } from "../convex/lib/summary";

const modules = import.meta.glob("../convex/**/*.*s");
type Entry = Infer<typeof proposedEntry>;
const TODAY = "2026-10-29";
// 19:00 Nairobi, when the cron fires.
const EVENING = new Date("2026-10-29T16:00:00Z").getTime();
const HOUR = 3_600_000;

const entry = (e: Partial<Entry> & Pick<Entry, "kind" | "amountCents">): Entry => ({
  date: TODAY, description: "x", quantity: null, method: "cash", counterparty: null, ref: null, ...e,
});

async function shop(t: ReturnType<typeof convexTest>, waId: string, fields: { lastInboundAt?: number; summaryOptOut?: boolean } = {}) {
  return await t.run((ctx) => ctx.db.insert("shops", { waId, name: null, language: "sw", ...fields }));
}

async function book(t: ReturnType<typeof convexTest>, shopId: Id<"shops">, entries: Entry[]) {
  const inboundId = await t.run((ctx) =>
    ctx.db.insert("inbound", { shopId, waMessageId: `wamid.${Math.random()}`, kind: "text", text: null, mediaId: null, mimeType: null, status: "processed", error: null }),
  );
  const { proposalId } = await t.mutation(internal.ledger.propose, { shopId, inboundId, entries, confidence: 1 });
  await t.mutation(internal.ledger.settle, { proposalId: proposalId!, shopId, confirm: true });
}

const sent = (t: ReturnType<typeof convexTest>, to: string) => t.query(internal.outbox.recent, { to, limit: 10 });

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(EVENING);
  vi.stubEnv("WHATSAPP_DRY_RUN", "1");
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("summaryText", () => {
  const zero = { salesCents: 0, purchasesCents: 0, expensesCents: 0, profitCents: 0, cashCents: 0, mpesaCents: 0 };
  it("names today's figures, the change from yesterday, top debtors and Fuliza", () => {
    const text = summaryText({
      today: { ...zero, salesCents: 90000, purchasesCents: 30000, expensesCents: 5000, profitCents: 55000 },
      yesterday: { ...zero, profitCents: 40000 },
      debtors: [{ name: "Mama Njeri", owedCents: 45000 }, { name: "Otieno", owedCents: 20000 }, { name: "Wanjiru", owedCents: 1000 }, { name: "Kamau", owedCents: 500 }],
      fulizaOwedCents: 49628,
    });
    expect(text).toContain("Mauzo: KES 900");
    expect(text).toContain("Manunuzi: KES 300");
    expect(text).toContain("Matumizi: KES 50");
    expect(text).toContain("Faida: KES 550");
    expect(text).toContain("KES 150 zaidi ya jana");
    expect(text).toContain("Mama Njeri KES 450");
    expect(text).not.toContain("Kamau");
    expect(text).toContain("Deni la Fuliza: KES 496.28");
  });

  it("says when profit fell, and leaves out empty sections", () => {
    const text = summaryText({ today: { ...zero, profitCents: 10000 }, yesterday: { ...zero, profitCents: 25000 }, debtors: [], fulizaOwedCents: 0 });
    expect(text).toContain("KES 150 chini ya jana");
    expect(text).not.toContain("Fuliza");
    expect(text).not.toContain("wanaodaiwa");
  });
});

describe("evening summary", () => {
  it("summary totals match reports.totals", async () => {
    const t = convexTest(schema, modules);
    const shopId = await shop(t, "254700000101", { lastInboundAt: EVENING - 2 * HOUR });
    await book(t, shopId, [
      entry({ kind: "sale", amountCents: 65000, method: "mpesa" }),
      entry({ kind: "sale", amountCents: 36000, method: "credit", counterparty: "Mama Njeri" }),
      entry({ kind: "purchase", amountCents: 48000 }),
      entry({ kind: "loan_received", amountCents: 5000, method: "mpesa" }),
    ]);
    await t.action(internal.summaries.evening, {});
    const totals = await t.query(internal.reports.totals, { shopId, from: TODAY, to: TODAY });
    const [summary] = await sent(t, "254700000101");
    expect(summary.body).toContain(`Mauzo: ${kes(totals.salesCents)}`);
    expect(summary.body).toContain(`Faida: ${kes(totals.profitCents)}`);
    expect(summary.body).toContain("Mama Njeri KES 360");
    expect(summary.body).toContain("Deni la Fuliza: KES 50");
  });

  it("no summary for a shop with no activity, outside 24h, or opted out", async () => {
    const t = convexTest(schema, modules);
    await shop(t, "254700000102", { lastInboundAt: EVENING - HOUR }); // no journal today
    const quiet = await shop(t, "254700000103", { lastInboundAt: EVENING - 25 * HOUR }); // outside the window
    await book(t, quiet, [entry({ kind: "sale", amountCents: 1000 })]);
    const optedOut = await shop(t, "254700000104", { lastInboundAt: EVENING - HOUR, summaryOptOut: true });
    await book(t, optedOut, [entry({ kind: "sale", amountCents: 1000 })]);
    const old = await shop(t, "254700000105", { lastInboundAt: EVENING - HOUR });
    await book(t, old, [entry({ kind: "sale", amountCents: 1000, date: "2026-10-28" })]); // yesterday only

    await t.action(internal.summaries.evening, {});
    for (const waId of ["254700000102", "254700000103", "254700000104", "254700000105"]) expect(await sent(t, waId)).toHaveLength(0);
  });
});
