/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import schema from "../convex/schema";
import { internal } from "../convex/_generated/api";
import { verifySignature } from "../convex/lib/whatsapp";

const modules = import.meta.glob("../convex/**/*.*s");
const SECRET = "test-app-secret";
const OWNER = "254712000111";
const SMS = "TJK4H7XYZ1 Confirmed.You have received Ksh650.00 from JANE WANJIKU 0712345678 on 25/10/26 at 9:14 AM New M-PESA balance is Ksh12,345.00.";

async function sign(body: string) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(body)));
  return `sha256=${Array.from(sig, (b) => b.toString(16).padStart(2, "0")).join("")}`;
}

let seq = 0;
function webhook(message: Record<string, unknown>) {
  return JSON.stringify({
    object: "whatsapp_business_account",
    entry: [{ changes: [{ field: "messages", value: { messages: [{ id: `wamid.${++seq}`, from: OWNER, ...message }] } }] }],
  });
}

async function deliver(t: ReturnType<typeof convexTest>, body: string, signature?: string) {
  const res = await t.fetch("/whatsapp", {
    method: "POST",
    body,
    headers: { "x-hub-signature-256": signature ?? (await sign(body)) },
  });
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  return res;
}

const latest = async (t: ReturnType<typeof convexTest>) => (await t.query(internal.outbox.recent, { to: OWNER, limit: 1 }))[0];

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubEnv("WHATSAPP_APP_SECRET", SECRET);
  vi.stubEnv("WHATSAPP_DRY_RUN", "1");
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("verifySignature", () => {
  it("accepts Meta's HMAC and rejects anything else", async () => {
    vi.stubEnv("WHATSAPP_APP_SECRET", SECRET);
    expect(await verifySignature("{}", await sign("{}"))).toBe(true);
    expect(await verifySignature("{} ", await sign("{}"))).toBe(false);
    expect(await verifySignature("{}", null)).toBe(false);
  });
});

describe("WhatsApp loop", () => {
  it("rejects an unsigned webhook", async () => {
    const t = convexTest(schema, modules);
    const res = await deliver(t, webhook({ type: "text", text: { body: SMS } }), "sha256=00");
    expect(res.status).toBe(401);
    expect(await latest(t)).toBeUndefined();
  });

  it("proposes an M-Pesa SMS, posts it on Confirm, and refuses it the second time", async () => {
    const t = convexTest(schema, modules);

    await deliver(t, webhook({ type: "text", text: { body: SMS } }));
    const proposal = await latest(t);
    expect(proposal.body).toContain("M-Pesa kutoka Jane Wanjiku: KES 650");
    const confirm = proposal.buttons!.find((b) => b.id.startsWith("confirm:"))!;

    const tap = () => deliver(t, webhook({ type: "interactive", interactive: { type: "button_reply", button_reply: confirm } }));
    await tap();
    expect((await latest(t)).body).toContain("Nimeandika rekodi 1");

    const journal = await t.run((ctx) => ctx.db.query("journal").collect());
    expect(journal).toHaveLength(1);
    expect(journal[0]).toMatchObject({ ref: "TJK4H7XYZ1", date: "2026-10-25" });
    expect(journal[0].lines).toEqual([
      { account: "mpesa", debitCents: 65000, creditCents: 0 },
      { account: "sales", debitCents: 0, creditCents: 65000 },
    ]);

    // Tapping again does nothing.
    await tap();
    expect((await latest(t)).body).toBe("Hii tayari imeshughulikiwa.");

    // Forwarding the same SMS again is caught before a proposal is made.
    await deliver(t, webhook({ type: "text", text: { body: SMS } }));
    expect((await latest(t)).body).toContain("tayari ziko kwenye vitabu");
    expect(await t.run((ctx) => ctx.db.query("journal").collect())).toHaveLength(1);
  });

  it("books a forwarded Fuliza SMS as a loan plus its fee", async () => {
    const t = convexTest(schema, modules);
    await deliver(t, webhook({ type: "text", text: { body: "UJT5R09EGR Confirmed. Fuliza M-PESA amount is Ksh 50.00. Access Fee charged Ksh 0.50. Total Fuliza M-PESA outstanding amount is Ksh496.28 due on 26/11/26. To check daily charges, Dial *334#OK Select Query Charges" } }));
    const proposal = await latest(t);
    expect(proposal.body).toContain("Mkopo wa Fuliza: KES 50 (loan_received)");
    expect(proposal.body).toContain("Ada ya Fuliza: KES 0.50 (loan_fee)");
    expect(proposal.body).toContain("Deni la Fuliza sasa ni KES 496.28");
    await deliver(t, webhook({ type: "interactive", interactive: { type: "button_reply", button_reply: proposal.buttons![0] } }));
    const lines = (await t.run((ctx) => ctx.db.query("journal").collect())).flatMap((j) => j.lines);
    expect(lines).toEqual([
      { account: "mpesa", debitCents: 5000, creditCents: 0 },
      { account: "loans", debitCents: 0, creditCents: 5000 },
      { account: "expenses", debitCents: 50, creditCents: 0 },
      { account: "loans", debitCents: 0, creditCents: 50 },
    ]);
  });

  it("never sends to Meta for a simulated shop, even with dry run off", async () => {
    vi.stubEnv("WHATSAPP_DRY_RUN", "");
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const t = convexTest(schema, modules);
    await deliver(t, webhook({ type: "text", text: { body: SMS }, duka_sim: true }));
    const reply = await latest(t);
    expect(reply.body).toContain("Jane Wanjiku");
    expect(reply.dryRun).toBe(true);
    expect(fetchSpy.mock.calls.filter(([url]) => String(url).includes("graph.facebook.com"))).toHaveLength(0);
    fetchSpy.mockRestore();
  });

  it("ignores a webhook retry with the same message id", async () => {
    const t = convexTest(schema, modules);
    const body = webhook({ type: "text", text: { body: SMS } });
    await deliver(t, body);
    await deliver(t, body);
    expect(await t.run((ctx) => ctx.db.query("proposals").collect())).toHaveLength(1);
  });

  it("only lets the owning shop settle a proposal", async () => {
    const t = convexTest(schema, modules);
    await deliver(t, webhook({ type: "text", text: { body: SMS } }));
    const confirm = (await latest(t)).buttons!.find((b) => b.id.startsWith("confirm:"))!;

    const body = JSON.stringify({
      entry: [{ changes: [{ value: { messages: [{ id: "wamid.intruder", from: "254799999999", type: "interactive", interactive: { type: "button_reply", button_reply: confirm } }] } }] }],
    });
    await deliver(t, body);
    expect(await t.run((ctx) => ctx.db.query("journal").collect())).toHaveLength(0);
  });

  it("runs a photo through the stub without downloading it, and posts it on Confirm", async () => {
    vi.stubEnv("EXTRACT_STUB", "1");
    const t = convexTest(schema, modules);
    await deliver(t, webhook({ type: "image", image: { id: "fake-media", mime_type: "image/jpeg" } }));
    const proposal = await latest(t);
    expect(proposal.body).toContain("Unga 2kg");
    await deliver(t, webhook({ type: "interactive", interactive: { type: "button_reply", button_reply: proposal.buttons![0] } }));
    expect(await t.run((ctx) => ctx.db.query("journal").collect())).toHaveLength(2);
  });

  it("stubs extraction for non-M-Pesa text too", async () => {
    vi.stubEnv("EXTRACT_STUB", "1");
    const t = convexTest(schema, modules);
    await deliver(t, webhook({ type: "text", text: { body: "nimeuza unga tatu" } }));
    expect((await latest(t)).body).toContain("Nimepata rekodi 2");
  });

  it("keyword router answers 'faida wiki hii' from journal data", async () => {
    vi.setSystemTime(new Date("2026-10-29T07:00:00+03:00"));
    const t = convexTest(schema, modules);
    const confirmLatest = async () => {
      const button = (await latest(t)).buttons!.find((b) => b.id.startsWith("confirm:"))!;
      await deliver(t, webhook({ type: "interactive", interactive: { type: "button_reply", button_reply: button } }));
    };
    await deliver(t, webhook({ type: "text", text: { body: "TJK4H7XYZ2 Confirmed.You have received Ksh650.00 from JANE WANJIKU 0712345678 on 27/10/26 at 9:14 AM" } }));
    await confirmLatest();
    await deliver(t, webhook({ type: "text", text: { body: "TJP7ABC8DF Confirmed. Ksh480.00 paid to BIDCO DISTRIBUTORS. on 28/10/26 at 11:30 AM.New M-PESA balance is Ksh200.00. Transaction cost, Ksh0.00." } }));
    await confirmLatest();
    // Last week: outside the answer.
    await deliver(t, webhook({ type: "text", text: { body: SMS } }));
    await confirmLatest();

    await deliver(t, webhook({ type: "text", text: { body: "nilipata faida ngapi wiki hii?" } }));
    expect((await latest(t)).body).toBe("Faida wiki hii: KES 170\nMauzo KES 650, manunuzi KES 480, matumizi KES 0.");
    expect(await t.run((ctx) => ctx.db.query("proposals").collect())).toHaveLength(3);
  });
});
