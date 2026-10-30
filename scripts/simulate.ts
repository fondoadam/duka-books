// Plays the shop owner against a running deployment, without a phone or Meta. Sends a signed webhook to
// CONVEX_SITE_URL and prints the replies from the outbox. The deployment needs the same WHATSAPP_APP_SECRET as
// .env.local. Messages carry a signed duka_sim flag, so the shop they create never gets real WhatsApp sends, even
// on a live deployment. Use a made-up SIM_FROM (e.g. 254700000901), never a real owner's number.
//   pnpm simulate "TJK4H7XYZ1 Confirmed.You have received Ksh650.00 from JANE ..."
//   pnpm simulate confirm        tap "Sawa, andika" on the latest proposal
//   pnpm simulate reject         tap "Si sahihi"
//   pnpm simulate photo          send a photo (the media id is fake: simulated shops never download media)
//   pnpm simulate photo <file>   send a real photo: uploaded to Convex storage, so the live models read it
//   pnpm simulate risiti [file]  a photo captioned "risiti": receipt splitting (stub: three fixture receipts)
//   pnpm simulate voice          send a voice note (the stubbed transcriber ignores the fake media id)
//   pnpm simulate ripoti         today's summary; "ripoti ya mwezi" sends the P&L PDF (its link is printed)
// SIM_JSON=1 prints the replies as one JSON line instead (scripts/demo-record.ts reads it).
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { extname } from "node:path";
import { createHmac, randomUUID } from "node:crypto";

const from = process.env.SIM_FROM ?? "254700000001";
const site = process.env.CONVEX_SITE_URL;
const secret = process.env.WHATSAPP_APP_SECRET;
const input = process.argv.slice(2).join(" ").trim();
if (!site || !secret || !input) {
  console.error('Usage: pnpm simulate "<message>" | confirm | reject | photo   (needs CONVEX_SITE_URL and WHATSAPP_APP_SECRET)');
  process.exit(1);
}

type Out = {
  _id: string;
  body: string;
  buttons: { id: string; title: string }[] | null;
  media?: { type: "document" | "image"; link: string; filename: string | null };
};
const outbox = (): Out[] =>
  JSON.parse(execFileSync("npx", ["convex", "run", "outbox:recent", JSON.stringify({ to: from, limit: 10 })], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }));

async function upload(file: string, mime: string) {
  const url: string = JSON.parse(execFileSync("npx", ["convex", "run", "sim:uploadUrl"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }));
  const res = await fetch(url, { method: "POST", headers: { "content-type": mime }, body: readFileSync(file) });
  if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
  return ((await res.json()) as { storageId: string }).storageId;
}

const before = outbox();
let message: Record<string, unknown>;
if (input === "confirm" || input === "reject") {
  const button = before.flatMap((m) => m.buttons ?? []).find((b) => b.id.startsWith(`${input}:`));
  if (!button) throw new Error("No proposal with buttons in the outbox yet. Send a message first.");
  message = { type: "interactive", interactive: { type: "button_reply", button_reply: button } };
} else if (input === "voice") {
  message = { type: "audio", audio: { id: `sim-media-${randomUUID()}`, mime_type: "audio/ogg; codecs=opus", voice: true } };
} else if (/^(photo|risiti)( |$)/.test(input)) {
  const [kind, file] = [input.split(" ")[0], input.slice(input.indexOf(" ") + 1)];
  const caption = kind === "risiti" ? { caption: "risiti" } : {};
  const mime = /\.png$/i.test(extname(file)) ? "image/png" : "image/jpeg";
  const id = file !== input ? `sim-storage:${await upload(file, mime)}` : `sim-media-${randomUUID()}`;
  message = { type: "image", image: { id, mime_type: mime, ...caption } };
} else {
  message = { type: "text", text: { body: input } };
}

const body = JSON.stringify({
  object: "whatsapp_business_account",
  entry: [{ changes: [{ field: "messages", value: { messages: [{ id: `wamid.sim-${randomUUID()}`, from, duka_sim: true, ...message }] } }] }],
});
const res = await fetch(`${site}/whatsapp`, {
  method: "POST",
  body,
  headers: { "content-type": "application/json", "x-hub-signature-256": `sha256=${createHmac("sha256", secret).update(body).digest("hex")}` },
});
if (!res.ok || process.env.SIM_JSON !== "1") console.error(`webhook -> ${res.status}`);

const seen = new Set(before.map((m) => m._id));
for (let i = 0; i < 30; i++) {
  await new Promise((r) => setTimeout(r, 1000));
  const fresh = outbox().filter((m) => !seen.has(m._id)).reverse();
  if (fresh.length === 0) continue;
  if (process.env.SIM_JSON === "1") {
    // Some steps reply twice (a voice note's echo, then its proposal): wait until 5 s pass with nothing new.
    let all = fresh;
    for (let quiet = 0; quiet < 5; ) {
      await new Promise((r) => setTimeout(r, 1000));
      const more = outbox().filter((m) => !seen.has(m._id)).reverse();
      quiet = more.length > all.length ? 0 : quiet + 1;
      all = more;
    }
    console.log(JSON.stringify(all));
    process.exit(0);
  }
  for (const m of fresh) {
    console.log(`\n< ${m.body.replace(/\n/g, "\n  ")}`);
    if (m.buttons) console.log(`  [${m.buttons.map((b) => b.title).join("] [")}]`);
    if (m.media) console.log(`  📎 ${m.media.type}${m.media.filename ? ` ${m.media.filename}` : ""}: ${m.media.link}`);
  }
  process.exit(0);
}
console.error("No reply after 30 s. Check `npx convex logs`.");
process.exit(1);
