import type { Extraction } from "./extract";

// Deterministic parser for forwarded M-Pesa SMS. They have a fixed shape, so code reads them exactly and the
// model is kept for photos and free text. Returns null when the text isn't (only) M-Pesa confirmations, so the
// caller can fall back to the model.

type Entry = Extraction["entries"][number];

const CODE = /\b([A-Z0-9]{10})\s+Confirmed/g;
const AMOUNT = /Ksh\s?([\d,]+(?:\.\d{1,2})?)/;
const DATE = /on\s+(\d{1,2})\/(\d{1,2})\/(\d{2})/;
const COST = /Transaction cost,?\s*Ksh\s?([\d,]+(?:\.\d{1,2})?)/i;
// Fuliza SMS carry no transaction date (only a due date), so they are dated today.
const FULIZA_USED = /Fuliza M-PESA amount is\s*Ksh\s?([\d,]+(?:\.\d{1,2})?)/i;
const FULIZA_FEE = /Access Fee charged\s*Ksh\s?([\d,]+(?:\.\d{1,2})?)/i;
const FULIZA_OWED = /outstanding amount is\s*Ksh\s?([\d,]+(?:\.\d{1,2})?)\s+due on\s+(\d{1,2}\/\d{1,2}\/\d{2})/i;
const FULIZA_REPAID = /Ksh\s?([\d,]+(?:\.\d{1,2})?)\s+from your M-PESA has been used to (?:fully|partially) pay your outstanding Fuliza/i;

const kesOf = (s: string) => Number(s.replace(/,/g, ""));

// "JANE WANJIKU 0712345678" / "254712***678 JANE WANJIKU" -> "Jane Wanjiku"
function cleanName(raw: string) {
  const name = raw
    .replace(/\+?\d[\d*]{6,}/g, " ")
    .replace(/[.\s]+$/, "")
    .replace(/\s+/g, " ")
    .trim();
  return name ? name.toLowerCase().replace(/\b\p{L}/gu, (c) => c.toUpperCase()) : null;
}

// A Fuliza draw arrives with the same code as the payment it covered, so its refs get a suffix.
function parseFuliza(code: string, sms: string, today: string): { entries: Entry[]; note: string | null } | null {
  const base = { date: today, quantity: null, method: "mpesa" as const, counterparty: "Fuliza" };
  const repaid = sms.match(FULIZA_REPAID);
  if (repaid) {
    return { entries: [{ ...base, description: "Kulipa Fuliza", amountKes: kesOf(repaid[1]), kind: "loan_repaid", ref: code }], note: null };
  }
  const used = sms.match(FULIZA_USED);
  if (!used) return null;
  const entries: Entry[] = [
    { ...base, description: "Mkopo wa Fuliza", amountKes: kesOf(used[1]), kind: "loan_received", ref: `${code}-fuliza` },
  ];
  const fee = sms.match(FULIZA_FEE);
  if (fee && kesOf(fee[1]) > 0) {
    entries.push({ ...base, description: "Ada ya Fuliza", amountKes: kesOf(fee[1]), kind: "loan_fee", ref: `${code}-fuliza-fee` });
  }
  const owed = sms.match(FULIZA_OWED);
  return { entries, note: owed ? `Deni la Fuliza sasa ni KES ${owed[1]}, linalipwa ${owed[2]}.` : null };
}

function parseOne(code: string, sms: string, today: string): Entry[] | null {
  const amount = sms.match(AMOUNT);
  if (!amount) return null;
  const amountKes = kesOf(amount[1]);
  const d = sms.match(DATE);
  const date = d ? `20${d[3]}-${d[2].padStart(2, "0")}-${d[1].padStart(2, "0")}` : today;
  const base = { date, quantity: null, amountKes, method: "mpesa" as const, ref: code };

  let entry: Entry;
  const received = sms.match(/received\s+(?:Ksh\s?[\d,.]+\s+)?from\s+(.+?)\s+on\s+\d/i);
  const paybill = sms.match(/sent to\s+(.+?)\s+for account\s+(\S+?)\s+on\s+\d/i);
  const sent = sms.match(/sent to\s+(.+?)\s+on\s+\d/i);
  const paid = sms.match(/paid to\s+(.+?)\s+on\s+\d/i);

  if (received) {
    const who = cleanName(received[1]);
    // A customer paying the shop. If it settles an earlier debt, the owner corrects it on confirm.
    entry = { ...base, description: `M-Pesa kutoka ${who ?? "mteja"}`, kind: "sale", counterparty: who };
  } else if (paybill) {
    const who = cleanName(paybill[1]);
    entry = { ...base, description: `Paybill ${who ?? ""} (${paybill[2]})`.trim(), kind: "expense", counterparty: who };
  } else if (sent ?? paid) {
    const who = cleanName((sent ?? paid)![1]);
    entry = { ...base, description: `M-Pesa kwa ${who ?? "msambazaji"}`, kind: "purchase", counterparty: who };
  } else {
    return null; // withdrawals, deposits, airtime: not handled yet
  }

  const entries = [entry];
  const cost = sms.match(COST);
  if (cost && kesOf(cost[1]) > 0) {
    entries.push({
      ...base,
      description: "Gharama ya M-Pesa",
      amountKes: kesOf(cost[1]),
      kind: "expense",
      counterparty: "Safaricom",
      ref: `${code}-fee`,
    });
  }
  return entries;
}

export function parseMpesa(text: string, today: string): Extraction | null {
  const starts = [...text.matchAll(CODE)];
  if (starts.length === 0) return null;
  // Anything substantial before the first confirmation is free text the parser can't account for.
  if (text.slice(0, starts[0].index).trim().length > 40) return null;

  // Keyed by ref, not code: a payment and its Fuliza SMS share a code but are different records.
  const seen = new Set<string | null>();
  const entries: Entry[] = [];
  const notes: string[] = [];
  for (let i = 0; i < starts.length; i++) {
    const code = starts[i][1];
    const sms = text.slice(starts[i].index, starts[i + 1]?.index ?? text.length);
    const fuliza = parseFuliza(code, sms, today);
    const parsed = fuliza?.entries ?? parseOne(code, sms, today);
    if (!parsed) return null;
    if (seen.has(parsed[0].ref)) continue; // the same SMS pasted twice
    for (const e of parsed) seen.add(e.ref);
    entries.push(...parsed);
    if (fuliza?.note) notes.push(fuliza.note);
  }
  return { entries, confidence: 1, notes: notes.at(-1) ?? null };
}
