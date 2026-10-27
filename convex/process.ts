import { v } from "convex/values";
import { internalAction, type ActionCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { extractFromImage, extractFromText, type Extraction } from "./lib/extract";
import { downloadMedia, sendButtons, sendText } from "./lib/whatsapp";

const nairobiToday = () => new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Nairobi" });
const kes = (cents: number) => `KES ${(cents / 100).toLocaleString("en-KE")}`;

export const inbound = internalAction({
  args: { inboundId: v.id("inbound") },
  handler: async (ctx, { inboundId }) => {
    const found = await ctx.runQuery(internal.inbound.get, { inboundId });
    if (!found) return;
    const { inbound, shop } = found;
    const to = shop.waId;

    try {
      if (inbound.kind === "button" && inbound.text) {
        const [action, proposalId] = inbound.text.split(":");
        const result = await ctx.runMutation(internal.ledger.settle, {
          proposalId,
          shopId: shop._id,
          confirm: action === "confirm",
        });
        if (!result) await sendText(to, "Hii tayari imeshughulikiwa.");
        else if (result.confirmed) await sendText(to, `✅ Nimeandika rekodi ${result.count} kwenye vitabu.`);
        else await sendText(to, "Sawa, sijaandika. Tuma picha au ujumbe tena ukiwa tayari.");
      } else {
        let extraction: Extraction | null = null;
        if (inbound.kind === "image" && inbound.mediaId) {
          const media = await downloadMedia(inbound.mediaId);
          extraction = await extractFromImage(media.bytes, media.mimeType, nairobiToday());
        } else if (inbound.kind === "text" && inbound.text) {
          extraction = await extractFromText(inbound.text, nairobiToday());
        } else if (inbound.kind === "audio") {
          // TODO(day 2): transcribe Swahili/Sheng voice notes, then extractFromText.
          await sendText(to, "Sauti bado haijawezeshwa. Tafadhali tuma picha au ujumbe wa maandishi.");
        } else {
          await sendText(to, "Tuma picha ya daftari au risiti, au ujumbe wa M-Pesa.");
        }

        if (extraction) await propose(ctx, shop._id, inboundId, to, extraction);
      }
      await ctx.runMutation(internal.inbound.setStatus, { inboundId, status: "processed", error: null });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await ctx.runMutation(internal.inbound.setStatus, { inboundId, status: "failed", error: message });
      await sendText(to, "Samahani, kuna tatizo. Jaribu tena baada ya muda mfupi.").catch(() => {});
      throw err;
    }
  },
});

async function propose(
  ctx: ActionCtx,
  shopId: Id<"shops">,
  inboundId: Id<"inbound">,
  to: string,
  extraction: Extraction,
) {
  if (extraction.entries.length === 0) {
    await sendText(to, `Sikuona rekodi yoyote ya pesa.${extraction.notes ? `\n${extraction.notes}` : ""}`);
    return;
  }
  const entries = extraction.entries.map((e) => ({
    date: e.date,
    description: e.description,
    quantity: e.quantity,
    amountCents: Math.round(e.amountKes * 100),
    kind: e.kind,
    method: e.method,
    counterparty: e.counterparty,
  }));
  const proposalId = await ctx.runMutation(internal.ledger.propose, {
    shopId,
    inboundId,
    entries,
    confidence: extraction.confidence,
  });

  const lines = entries.map((e, i) => `${i + 1}. ${e.description}: ${kes(e.amountCents)} (${e.kind})`);
  const body = [`Nimepata rekodi ${entries.length}:`, ...lines, extraction.notes ? `\n⚠️ ${extraction.notes}` : ""]
    .join("\n")
    .slice(0, 1024);
  await sendButtons(to, body, [
    { id: `confirm:${proposalId}`, title: "Sawa, andika" },
    { id: `reject:${proposalId}`, title: "Si sahihi" },
  ]);
}
