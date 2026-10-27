import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { verifySignature } from "./lib/whatsapp";

const http = httpRouter();

// Meta calls this once when you save the webhook URL.
http.route({
  path: "/whatsapp",
  method: "GET",
  handler: httpAction(async (_ctx, req) => {
    const params = new URL(req.url).searchParams;
    const ok =
      params.get("hub.mode") === "subscribe" &&
      params.get("hub.verify_token") === process.env.WHATSAPP_VERIFY_TOKEN;
    return ok ? new Response(params.get("hub.challenge")) : new Response("Forbidden", { status: 403 });
  }),
});

type WaMessage = {
  id: string;
  from: string;
  type: string;
  text?: { body: string };
  image?: { id: string; mime_type: string; caption?: string };
  audio?: { id: string; mime_type: string };
  document?: { id: string; mime_type: string; caption?: string };
  interactive?: { type: string; button_reply?: { id: string; title: string } };
};

http.route({
  path: "/whatsapp",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    const raw = await req.text();
    if (!(await verifySignature(raw, req.headers.get("x-hub-signature-256")))) {
      return new Response("Bad signature", { status: 401 });
    }

    const body = JSON.parse(raw);
    for (const entry of body.entry ?? []) {
      for (const change of entry.changes ?? []) {
        for (const m of (change.value?.messages ?? []) as WaMessage[]) {
          const media = m.image ?? m.audio ?? m.document;
          const button = m.interactive?.button_reply;
          await ctx.runMutation(internal.inbound.record, {
            waId: m.from,
            waMessageId: m.id,
            kind: button
              ? "button"
              : m.type === "text" || m.type === "image" || m.type === "audio" || m.type === "document"
                ? m.type
                : "other",
            text: button?.id ?? m.text?.body ?? m.image?.caption ?? m.document?.caption ?? null,
            mediaId: media?.id ?? null,
            mimeType: media?.mime_type ?? null,
          });
        }
      }
    }
    // Always 200 quickly, or Meta retries the delivery.
    return new Response("ok");
  }),
});

export default http;
