import { v } from "convex/values";
import { internalAction, type ActionCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { extractFromImage, extractFromText, type Extraction } from "./lib/extract";
import { kes } from "./lib/money";
import { parseMpesa } from "./lib/mpesa";
import { downloadMedia, markRead, sendButtons, sendText } from "./lib/whatsapp";

const nairobiToday = () => new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Nairobi" });

// Logs every reply to the outbox, then sends it (unless WHATSAPP_DRY_RUN=1).
function replier(ctx: ActionCtx, to: string) {
  return {
    text: async (body: string) => {
      await ctx.runMutation(internal.outbox.log, { to, body, buttons: null });
      await sendText(to, body);
    },
    buttons: async (body: string, buttons: { id: string; title: string }[]) => {
      await ctx.runMutation(internal.outbox.log, { to, body, buttons });
      await sendButtons(to, body, buttons);
    },
  };
}
type Reply = ReturnType<typeof replier>;

export const inbound = internalAction({
  args: { inboundId: v.id("inbound") },
  handler: async (ctx, { inboundId }) => {
    const found = await ctx.runQuery(internal.inbound.get, { inboundId });
    if (!found) return;
    const { inbound, shop } = found;
    const to = shop.waId;
    const reply = replier(ctx, to);
    // Cosmetic: never let a failed read receipt stop the reply.
    await markRead(inbound.waMessageId).catch(() => {});

    try {
      if (inbound.kind === "button" && inbound.text) {
        const [action, proposalId] = inbound.text.split(":");
        const result = await ctx.runMutation(internal.ledger.settle, {
          proposalId,
          shopId: shop._id,
          confirm: action === "confirm",
        });
        if (!result) await reply.text("Hii tayari imeshughulikiwa.");
        else if (!result.confirmed) await reply.text("Sawa, sijaandika. Tuma picha au ujumbe tena ukiwa tayari.");
        else if (result.count === 0) await reply.text("Rekodi hizi tayari ziko kwenye vitabu. Sijaandika tena.");
        else await reply.text(`✅ Nimeandika rekodi ${result.count} kwenye vitabu.`);
      } else {
        let extraction: Extraction | null = null;
        const today = nairobiToday();
        if (inbound.kind === "image" && inbound.mediaId) {
          // Stubbed extraction skips the download, so the simulator can send fake media ids.
          const media = process.env.EXTRACT_STUB === "1"
            ? { bytes: new Uint8Array(), mimeType: "image/jpeg" }
            : await downloadMedia(inbound.mediaId);
          extraction = await extractFromImage(media.bytes, media.mimeType, today);
        } else if (inbound.kind === "text" && inbound.text) {
          extraction = parseMpesa(inbound.text, today) ?? (await extractFromText(inbound.text, today));
        } else if (inbound.kind === "audio") {
          // TODO(day 2): transcribe Swahili/Sheng voice notes, then extractFromText.
          await reply.text("Sauti bado haijawezeshwa. Tafadhali tuma picha au ujumbe wa maandishi.");
        } else {
          await reply.text("Tuma picha ya daftari au risiti, au ujumbe wa M-Pesa.");
        }

        if (extraction) await propose(ctx, shop._id, inboundId, reply, extraction);
      }
      await ctx.runMutation(internal.inbound.setStatus, { inboundId, status: "processed", error: null });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await ctx.runMutation(internal.inbound.setStatus, { inboundId, status: "failed", error: message });
      await reply.text("Samahani, kuna tatizo. Jaribu tena baada ya muda mfupi.").catch(() => {});
      throw err;
    }
  },
});

async function propose(
  ctx: ActionCtx,
  shopId: Id<"shops">,
  inboundId: Id<"inbound">,
  reply: Reply,
  extraction: Extraction,
) {
  if (extraction.entries.length === 0) {
    await reply.text(`Sikuona rekodi yoyote ya pesa.${extraction.notes ? `\n${extraction.notes}` : ""}`);
    return;
  }
  const proposed = extraction.entries.map((e) => ({
    date: e.date,
    description: e.description,
    quantity: e.quantity,
    amountCents: Math.round(e.amountKes * 100),
    kind: e.kind,
    method: e.method,
    counterparty: e.counterparty,
    ref: e.ref,
  }));
  const { proposalId, entries, duplicates } = await ctx.runMutation(internal.ledger.propose, {
    shopId,
    inboundId,
    entries: proposed,
    confidence: extraction.confidence,
  });
  const dupeNote = duplicates > 0 ? `ℹ️ Rekodi ${duplicates} tayari ziko kwenye vitabu, nimeziruka.` : "";
  if (!proposalId) {
    await reply.text(dupeNote);
    return;
  }

  const lines = entries.map((e, i) => `${i + 1}. ${e.description}: ${kes(e.amountCents)} (${e.kind})`);
  const body = [
    `Nimepata rekodi ${entries.length}:`,
    ...lines,
    dupeNote && `\n${dupeNote}`,
    extraction.notes ? `\n⚠️ ${extraction.notes}` : "",
  ]
    .filter(Boolean)
    .join("\n")
    .slice(0, 1024);
  await reply.buttons(body, [
    { id: `confirm:${proposalId}`, title: "Sawa, andika" },
    { id: `reject:${proposalId}`, title: "Si sahihi" },
  ]);
}
