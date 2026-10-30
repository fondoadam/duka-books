// Runs the demo story (docs/plan.md) against the live deployment as a fresh simulated shop and saves every
// message and real reply to demo/out/run.js, which demo/player.html replays for the video (scripts/demo-video.ts).
//   pnpm demo:run --ledger samples/ledger.jpg --expect 540,450,120,180,95,200 [--receipts samples/receipts.jpg]
// --expect is the page's true amounts, line by line. The first line the model misread is fixed on camera with
// "Si sahihi" + "<line> = <amount>"; if it read every line right (or there's no --expect), the fix beats are skipped.
// Each photo spends free Space quota (ledger: 1 call; receipts: SAM + 1 per receipt), so run it once, after a reset.
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import { basename } from "node:path";

type Out = { body: string; buttons: { id: string; title: string }[] | null; media?: { type: string; link: string; filename: string | null } };
type Beat = { caption: string; send: string; show: { kind: "text" | "photo" | "tap"; text?: string; image?: string }; fix?: boolean };

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const ledger = arg("ledger");
const receipts = arg("receipts");
const expect = arg("expect")?.split(",").map(Number);
if (!ledger) {
  console.error("Usage: pnpm demo:run --ledger <photo> [--receipts <photo>]");
  process.exit(1);
}

mkdirSync("demo/out", { recursive: true });
const keep = (file: string) => {
  const name = `owner-${basename(file)}`;
  copyFileSync(file, `demo/out/${name}`);
  return name;
};

const MPESA = "TJU8K2P4QA Confirmed. You have received Ksh1,250.00 from JANE WANJIKU 0712345678 on 30/10/26 at 8:14 AM. New M-PESA balance is Ksh3,420.00.";
const FULIZA = "UJT5R09EGR Confirmed. Fuliza M-PESA amount is Ksh 50.00. Access Fee charged Ksh 0.50. Total Fuliza M-PESA outstanding amount is Ksh496.28 due on 26/11/26. To check daily charges, Dial *334#OK Select Query Charges";
const tap = (title: string) => ({ kind: "tap" as const, text: title });

const beats: Beat[] = [
  { caption: "A day's sales in an exercise book, sent as a photo. Muse Glimmer reads the handwriting.", send: `photo ${ledger}`, show: { kind: "photo", image: keep(ledger) } },
  { caption: "One line was misread. The owner taps \"Si sahihi\" (not right).", send: "reject", show: tap("Si sahihi"), fix: true },
  { caption: "", send: "", show: { kind: "text" }, fix: true },
  { caption: "\"Sawa, andika\" (OK, write it): posted to a double-entry journal.", send: "confirm", show: tap("Sawa, andika") },
  ...(receipts
    ? [
        { caption: "A pile of receipts captioned \"risiti\". SAM 3 finds each one and numbers it.", send: `risiti ${receipts}`, show: { kind: "photo" as const, image: keep(receipts), text: "risiti" } },
        { caption: "One entry per receipt, confirmed in one tap.", send: "confirm", show: tap("Sawa, andika") },
      ]
    : []),
  { caption: "A forwarded M-Pesa SMS is parsed exactly: amount, sender, transaction code.", send: MPESA, show: { kind: "text", text: MPESA } },
  { caption: "Confirmed.", send: "confirm", show: tap("Sawa, andika") },
  { caption: "The same SMS again is refused: the transaction code is already in the books.", send: MPESA, show: { kind: "text", text: MPESA } },
  { caption: "Fuliza (M-Pesa overdraft): booked as a loan, the access fee as an expense.", send: FULIZA, show: { kind: "text", text: FULIZA } },
  { caption: "Confirmed.", send: "confirm", show: tap("Sawa, andika") },
  { caption: "A typed Swahili note, read by Llama 3.1 8B running on our own Mac.", send: "Leo nimeuza mkate 4 kwa 260 na maziwa 3 kwa 180", show: { kind: "text", text: "Leo nimeuza mkate 4 kwa 260 na maziwa 3 kwa 180" } },
  { caption: "Confirmed.", send: "confirm", show: tap("Sawa, andika") },
  { caption: "\"How much profit did I make this week?\" Answered from the journal, not guessed.", send: "nilipata faida ngapi wiki hii?", show: { kind: "text", text: "nilipata faida ngapi wiki hii?" } },
  { caption: "\"Monthly report\": a lender-ready profit and loss PDF, straight into the chat.", send: "ripoti ya mwezi", show: { kind: "text", text: "ripoti ya mwezi" } },
];

const from = `2547009${String(Date.now()).slice(-5)}`;
const steps: (Beat & { replies: Out[] })[] = [];
// The fix for the first line the model misread, from the photo's proposal; null when there's nothing to fix.
function fixFor(replies: Out[]) {
  if (!expect) return null;
  const read = [...replies.map((r) => r.body).join("\n").matchAll(/^(\d+)\..*KES ([\d,]+)/gm)].map((m) => [Number(m[1]), Number(m[2].replace(/,/g, ""))]);
  const wrong = expect.findIndex((amount, i) => read.find(([n]) => n === i + 1)?.[1] !== amount);
  return wrong < 0 ? null : `${wrong + 1} = ${expect[wrong]}`;
}

let fix: string | null = null;
for (const [i, beat] of beats.entries()) {
  if (beat.fix && !fix) continue;
  if (beat.fix && !beat.send) Object.assign(beat, { send: fix, show: { kind: "text", text: fix }, caption: `"${fix}": line ${fix!.split(" ")[0]} is KES ${fix!.split("= ")[1]}. The fix is exact, no model guessing.` });
  process.stdout.write(`${i + 1}/${beats.length} ${beat.send.slice(0, 50)} … `);
  const raw = execFileSync("pnpm", ["-s", "simulate", beat.send], {
    encoding: "utf8",
    env: { ...process.env, SIM_FROM: from, SIM_JSON: "1" },
    stdio: ["ignore", "pipe", "inherit"],
    timeout: 240_000,
  });
  const replies: Out[] = JSON.parse(raw.trim().split("\n").at(-1)!);
  console.log(replies.map((r) => r.body.split("\n")[0]).join(" | "));
  steps.push({ ...beat, replies: replies.map(({ body, buttons, media }) => ({ body, buttons, media })) });
  if (i === 0) {
    fix = fixFor(replies);
    console.log(fix ? `  model misread a line: fixing with "${fix}"` : "  every line read right: skipping the fix beats");
  }
}

// The P&L PDF's first page as an image, so the video shows the report itself (sips ships with macOS).
const pdf = steps.flatMap((s) => s.replies).find((r) => r.media?.type === "document");
let pnlImage: string | null = null;
if (pdf) {
  writeFileSync("demo/out/pnl.pdf", Buffer.from(await (await fetch(pdf.media!.link)).arrayBuffer()));
  execFileSync("sips", ["-s", "format", "png", "-Z", "1400", "demo/out/pnl.pdf", "--out", "demo/out/pnl.png"], { stdio: "ignore" });
  pnlImage = "pnl.png";
}

writeFileSync("demo/out/run.js", `window.RUN = ${JSON.stringify({ recordedAt: new Date().toISOString(), steps, pnlImage }, null, 2)};\n`);
console.log(`\nSaved demo/out/run.js (${steps.length} steps). Next: pnpm demo:video`);
