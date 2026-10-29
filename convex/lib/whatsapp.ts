// Minimal WhatsApp Cloud API client. https://developers.facebook.com/docs/whatsapp/cloud-api
const GRAPH = `https://graph.facebook.com/${process.env.GRAPH_VERSION ?? "v23.0"}`;

function authHeaders() {
  const token = process.env.WHATSAPP_TOKEN;
  if (!token) throw new Error("WHATSAPP_TOKEN is not set");
  return { Authorization: `Bearer ${token}` };
}

// Dry run for the whole deployment (WHATSAPP_DRY_RUN=1) or for one simulated shop. Replies are still logged in the outbox.
export const isDryRun = (shop?: { simulated?: boolean }) => process.env.WHATSAPP_DRY_RUN === "1" || shop?.simulated === true;

async function send(payload: Record<string, unknown>, dryRun = false) {
  if (dryRun || isDryRun()) return;
  const res = await fetch(`${GRAPH}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", ...payload }),
  });
  if (!res.ok) throw new Error(`WhatsApp send failed: ${res.status} ${await res.text()}`);
}

export function sendText(to: string, body: string, dryRun = false) {
  return send({ to, type: "text", text: { body } }, dryRun);
}

// Up to 3 reply buttons; titles max 20 chars.
export function sendButtons(to: string, body: string, buttons: { id: string; title: string }[], dryRun = false) {
  return send({
    to,
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: body },
      action: { buttons: buttons.map((b) => ({ type: "reply", reply: b })) },
    },
  }, dryRun);
}

// Media go by link: Meta fetches the file from our Convex storage URL. Captions max 1024 chars.
export function sendDocument(to: string, link: string, filename: string, caption: string, dryRun = false) {
  return send({ to, type: "document", document: { link, filename, caption } }, dryRun);
}

export function sendImage(to: string, link: string, caption: string, dryRun = false) {
  return send({ to, type: "image", image: { link, caption } }, dryRun);
}

// Blue ticks plus "typing…" on the owner's phone while we work. The indicator clears on our reply (or after 25 s).
export function markRead(messageId: string, dryRun = false) {
  return send({ status: "read", message_id: messageId, typing_indicator: { type: "text" } }, dryRun);
}

export async function downloadMedia(mediaId: string) {
  const meta = await fetch(`${GRAPH}/${mediaId}`, { headers: authHeaders() });
  if (!meta.ok) throw new Error(`Media lookup failed: ${meta.status}`);
  const { url, mime_type } = (await meta.json()) as { url: string; mime_type: string };
  const file = await fetch(url, { headers: authHeaders() });
  if (!file.ok) throw new Error(`Media download failed: ${file.status}`);
  return { bytes: new Uint8Array(await file.arrayBuffer()), mimeType: mime_type };
}

export async function verifySignature(body: string, header: string | null) {
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret || !header?.startsWith("sha256=")) return false;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(body)));
  const hex = Array.from(sig, (b) => b.toString(16).padStart(2, "0")).join("");
  const expected = header.slice("sha256=".length);
  if (hex.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < hex.length; i++) diff |= hex.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}
