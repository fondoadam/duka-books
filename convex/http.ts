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
      // Usually a WHATSAPP_APP_SECRET that isn't this app's secret.
      console.warn("Rejected webhook: bad X-Hub-Signature-256");
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

// Meta asks for a privacy policy and data-deletion URL before the app can be published.
const PRIVACY = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Duka Books privacy</title>
<style>body{font:16px/1.6 system-ui,sans-serif;max-width:40rem;margin:2rem auto;padding:0 1rem;color:#1a1a1a;background:#fff}</style>
</head><body>
<h1>Duka Books privacy policy</h1>
<p>Duka Books is a WhatsApp bookkeeper for small shops, built for the Meta AI Developer Hackathon.</p>
<h2>What we store</h2>
<p>Your WhatsApp number, the messages, photos and voice notes you send the Duka Books number, the records read
from them, and the entries you confirm. Photos and voice notes are sent to Meta's AI models to read them.</p>
<h2>What we don't do</h2>
<p>We don't sell or share your data, use it for advertising, or message anyone but you.</p>
<h2 id="deletion">Deleting your data</h2>
<p>Send "futa data yangu" or "delete my data" to the Duka Books number. We delete your shop and all its
records within 7 days.</p>
</body></html>`;

http.route({
  path: "/privacy",
  method: "GET",
  handler: httpAction(async () => new Response(PRIVACY, { headers: { "content-type": "text/html; charset=utf-8" } })),
});

export default http;
