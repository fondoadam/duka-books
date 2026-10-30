import { v } from "convex/values";
import { internalAction, type ActionCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { modelsLive, textModel } from "./lib/ai";
import { answer, isQuestion } from "./lib/ask";
import { interpretCorrection, parseCorrection, type Correction } from "./lib/corrections";
import { extractFromImage, extractFromText, type Extraction } from "./lib/extract";
import { kes } from "./lib/money";
import { parseMpesa } from "./lib/mpesa";
import { nairobiToday, resolvePeriod } from "./lib/periods";
import { replier, type Reply } from "./lib/reply";
import { segmentReceipts, segmentStubbed } from "./lib/segment";
import { parseSpoken } from "./lib/spoken";
import { asrStubbed, transcribe } from "./lib/transcribe";
import { downloadMedia, isDryRun, markRead } from "./lib/whatsapp";
import { sendPnl } from "./pnl";
import { SIM_STORAGE } from "./sim";
import { buildSummary } from "./summaries";

const HANDLED = "Hii tayari imeshughulikiwa.";
const CANCELLED = "Sawa, nimeghairi. Sijaandika chochote.";
const CORRECTION_HELP =
  "Andika namba ya mstari na kiasi sahihi, mfano: 2 = 450. Au 'futa 2' kuondoa mstari.\n" +
  "Unaweza pia kuandika '2 deni', '2 mpesa' au '2 cash'.";

export const inbound = internalAction({
  args: { inboundId: v.id("inbound") },
  handler: async (ctx, { inboundId }) => {
    const found = await ctx.runQuery(internal.inbound.get, { inboundId });
    if (!found) return;
    const { inbound, shop } = found;
    const reply = replier(ctx, shop);
    // Cosmetic: never let a failed read receipt stop the reply.
    await markRead(inbound.waMessageId, isDryRun(shop)).catch(() => {});

    try {
      const today = nairobiToday();
      if (inbound.kind === "button" && inbound.text) {
        await onButton(ctx, shop, reply, inbound.text);
      } else if (inbound.kind === "text" && inbound.text) {
        await onText(ctx, shop, inboundId, reply, inbound.text, today);
      } else if (inbound.kind === "image" && inbound.mediaId) {
        const receipts = /risiti|receipt/i.test(inbound.text ?? "");
        const media = await fetchMedia(ctx, shop, inbound.mediaId, "image/jpeg", modelsLive() || (receipts && !segmentStubbed()));
        if (receipts) await onReceipts(ctx, shop._id, inboundId, reply, media, today);
        else {
          const examples = await ctx.runQuery(internal.ledger.recentCorrections, { shopId: shop._id });
          await propose(ctx, shop._id, inboundId, reply, await extractFromImage(media.bytes, media.mimeType, today, examples));
        }
      } else if (inbound.kind === "audio" && inbound.mediaId) {
        await onVoice(ctx, shop, inboundId, reply, inbound.mediaId, inbound.mimeType, today);
      } else {
        await reply.text("Tuma picha ya daftari au risiti, au ujumbe wa M-Pesa.");
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

// Downloads a photo or voice note only when a live step will read it. Simulated shops send made-up media ids, so
// they never download; the stubs (and the receipt fixture) take the empty bytes. A simulated "sim-storage:<id>"
// is a real file the simulator uploaded to Convex storage (`pnpm simulate photo <file>`), read like a download.
async function fetchMedia(ctx: ActionCtx, shop: Doc<"shops">, mediaId: string, mimeType: string, needed: boolean) {
  if (!needed) return { bytes: new Uint8Array(), mimeType };
  if (shop.simulated) {
    const stored = mediaId.startsWith(SIM_STORAGE) ? await ctx.storage.get(mediaId.slice(SIM_STORAGE.length) as Id<"_storage">) : null;
    return { bytes: stored ? new Uint8Array(await stored.arrayBuffer()) : new Uint8Array(), mimeType: stored?.type || mimeType };
  }
  return downloadMedia(mediaId);
}

// Button ids are "<action>:<proposalId>": confirm, reject ("Si sahihi" starts a correction) or cancel ("Ghairi").
async function onButton(ctx: ActionCtx, shop: Doc<"shops">, reply: Reply, payload: string) {
  const [action, proposalId] = payload.split(":");
  const shopId = shop._id;
  if (action === "reject") {
    const id = await ctx.runMutation(internal.ledger.startCorrection, { proposalId, shopId });
    if (!id) return reply.text(HANDLED);
    return reply.buttons(CORRECTION_HELP, [{ id: `cancel:${id}`, title: "Ghairi" }]);
  }
  if (action === "cancel") {
    return reply.text((await ctx.runMutation(internal.ledger.cancel, { shopId, proposalId })) ? CANCELLED : HANDLED);
  }
  const result = await ctx.runMutation(internal.ledger.settle, { proposalId, shopId, confirm: action === "confirm" });
  if (!result) await reply.text(HANDLED);
  else if (!result.confirmed) await reply.text(CANCELLED);
  else if (result.count === 0) await reply.text("Rekodi hizi tayari ziko kwenye vitabu. Sijaandika tena.");
  else await reply.text(`✅ Nimeandika rekodi ${result.count} kwenye vitabu.`);
}

async function onText(ctx: ActionCtx, shop: Doc<"shops">, inboundId: Id<"inbound">, reply: Reply, text: string, today: string) {
  const correcting = !!shop.pendingCorrection;
  if (correcting && /^\s*ghairi\s*$/i.test(text)) {
    return reply.text((await ctx.runMutation(internal.ledger.cancel, { shopId: shop._id })) ? CANCELLED : HANDLED);
  }
  const fix = correcting ? parseCorrection(text) : null;
  if (fix) return correct(ctx, shop._id, reply, fix);
  if (await onCommand(ctx, shop, reply, text, today)) return;

  // Exact parsers first (M-Pesa SMS, simple spoken records); the model only sees what they can't read.
  const exact = parseMpesa(text, today) ?? parseSpoken(text, today);
  if (exact) return propose(ctx, shop._id, inboundId, reply, exact);
  if (isQuestion(text)) return reply.text(await ask(ctx, shop._id, text, today));
  if (correcting) {
    // Live only: the model maps a free-form fix onto the same correction shape.
    const entries = modelsLive() ? await ctx.runQuery(internal.ledger.correcting, { shopId: shop._id }) : null;
    const guess = entries ? await interpretCorrection(text, entries, textModel()) : null;
    if (guess) return correct(ctx, shop._id, reply, guess);
    return reply.text(`Sijaelewa marekebisho hayo.\n${CORRECTION_HELP}\nAu andika 'Ghairi'.`);
  }
  const examples = await ctx.runQuery(internal.ledger.recentCorrections, { shopId: shop._id });
  return propose(ctx, shop._id, inboundId, reply, await extractFromText(text, today, examples));
}

// A voice note is transcribed, echoed back so the owner can check what was heard, then handled like text.
async function onVoice(
  ctx: ActionCtx,
  shop: Doc<"shops">,
  inboundId: Id<"inbound">,
  reply: Reply,
  mediaId: string,
  mimeType: string | null,
  today: string,
) {
  const stub = asrStubbed();
  const media = await fetchMedia(ctx, shop, mediaId, mimeType ?? "audio/ogg", !stub);
  const transcript = await transcribe(media.bytes, media.mimeType);
  if (!transcript) return reply.text("Sikusikia maneno yoyote. Jaribu tena, au andika ujumbe.");
  await reply.text(`🎙️ Nimesikia: "${transcript}"${stub ? "\n(Majaribio: sauti yako haijasomwa bado.)" : ""}`);
  await onText(ctx, shop, inboundId, reply, transcript, today);
}

// A photo captioned "risiti": SAM 3 finds each receipt, the owner gets the numbered boxes back, every crop is
// read in parallel, and one proposal groups the lines by receipt (numbering stays continuous for corrections).
async function onReceipts(
  ctx: ActionCtx,
  shopId: Id<"shops">,
  inboundId: Id<"inbound">,
  reply: Reply,
  media: { bytes: Uint8Array; mimeType: string },
  today: string,
) {
  // A SAM failure (a used-up Space quota, a cold start) shouldn't lose the photo: read it whole instead.
  const { crops, annotated } = await segmentReceipts(media.bytes, media.mimeType).catch((err) => {
    console.error("SAM failed, reading the photo whole:", err);
    return { crops: [], annotated: null };
  });
  const examples = await ctx.runQuery(internal.ledger.recentCorrections, { shopId });
  if (crops.length <= 1) {
    return propose(ctx, shopId, inboundId, reply, await extractFromImage(crops[0]?.bytes ?? media.bytes, media.mimeType, today, examples));
  }
  if (annotated) {
    const storageId = await ctx.storage.store(new Blob([new Uint8Array(annotated)], { type: "image/jpeg" }));
    const link = await ctx.storage.getUrl(storageId);
    const test = media.bytes.length === 0 ? "\n(Majaribio: picha ya mfano, si yako.)" : "";
    if (link) await reply.image(link, `🧾 Nimeona risiti ${crops.length} kwenye picha. Nazisoma moja moja…${test}`);
  }
  const read = await Promise.all(crops.map((c) => extractFromImage(c.bytes, "image/jpeg", today, examples)));
  const notes = read.map((r) => r.notes);
  await propose(ctx, shopId, inboundId, reply, {
    entries: read.flatMap((r, i) => r.entries.map((e) => ({ ...e, group: i + 1 }))),
    confidence: Math.min(...read.map((r) => r.confidence)),
    notes: notes.every((n) => n === notes[0])
      ? notes[0]
      : notes.map((n, i) => n && `Risiti ${i + 1}: ${n}`).filter(Boolean).join("\n") || null,
  });
}

const PNL = /^(p\s*&\s*l|pnl|ripoti ya mwezi|taarifa ya (mkopo|mwezi)|faida na hasara)\b/;

// Fixed phrases the owner can type: the P&L PDF, today's summary, and turning the evening summary off or on.
async function onCommand(ctx: ActionCtx, shop: Doc<"shops">, reply: Reply, text: string, today: string) {
  const t = text.trim().toLowerCase().replace(/[.!?]+$/, "");
  if (PNL.test(t)) {
    await sendPnl(ctx, shop, reply, /uliopita|iliyopita|last/.test(t) ? "last_month" : "this_month", today);
  } else if (/^ripoti( ya leo)?$/.test(t)) {
    await reply.text(await buildSummary(ctx, shop._id, today));
  } else if (/^acha ripoti/.test(t)) {
    await ctx.runMutation(internal.summaries.setOptOut, { shopId: shop._id, optOut: true });
    await reply.text("Sawa, sitatuma ripoti ya jioni tena. Andika 'anza ripoti' kuzirudisha.");
  } else if (/^(anza|washa) ripoti/.test(t)) {
    await ctx.runMutation(internal.summaries.setOptOut, { shopId: shop._id, optOut: false });
    await reply.text("Sawa, nitatuma ripoti kila jioni saa moja (7:00 PM) siku ukiwa na rekodi.");
  } else {
    return false;
  }
  return true;
}

async function correct(ctx: ActionCtx, shopId: Id<"shops">, reply: Reply, fix: Correction) {
  const result = await ctx.runMutation(internal.ledger.correct, { shopId, fix });
  if (result.status === "none") return reply.text(HANDLED);
  if (result.status === "no_line") return reply.text(`Hakuna mstari ${fix.line}. Rekodi hii ina mistari ${result.count}.`);
  if (result.status === "emptied") return reply.text("Umefuta mistari yote, kwa hiyo sijaandika chochote.");
  const body = [`Nimerekebisha. Rekodi ${result.entries.length}:`, ...lines(result.entries), "", "Andika marekebisho mengine, au bonyeza Sawa."];
  await reply.buttons(body.join("\n").slice(0, 1024), [
    { id: `confirm:${result.proposalId}`, title: "Sawa, andika" },
    { id: `cancel:${result.proposalId}`, title: "Ghairi" },
  ]);
}

// One line per entry, numbered for corrections; lines from a split photo sit under "Risiti N" headers.
function lines(entries: { description: string; amountCents: number; kind: string; group?: number }[]) {
  const out: string[] = [];
  entries.forEach((e, i) => {
    if (e.group && e.group !== entries[i - 1]?.group) out.push(`🧾 Risiti ${e.group}:`);
    out.push(`${i + 1}. ${e.description}: ${kes(e.amountCents)} (${e.kind})`);
  });
  return out;
}

// The agent needs a working model; until the key arrives (see modelsLive) the keyword router answers.
function ask(ctx: ActionCtx, shopId: Id<"shops">, question: string, today: string) {
  return answer(
    question,
    {
      totals: (period) => ctx.runQuery(internal.reports.totals, { shopId, ...resolvePeriod(period, today) }),
      debtors: () => ctx.runQuery(internal.reports.debtors, { shopId }),
      loans: () => ctx.runQuery(internal.reports.loans, { shopId }),
    },
    modelsLive() ? textModel() : undefined,
  );
}

// An extraction whose lines may carry the receipt they came from.
type Grouped = Omit<Extraction, "entries"> & { entries: (Extraction["entries"][number] & { group?: number })[] };

async function propose(
  ctx: ActionCtx,
  shopId: Id<"shops">,
  inboundId: Id<"inbound">,
  reply: Reply,
  extraction: Grouped,
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
    ...(e.group && { group: e.group }),
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

  const body = [
    `Nimepata rekodi ${entries.length}:`,
    ...lines(entries),
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
