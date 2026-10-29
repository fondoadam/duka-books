import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { Totals } from "./ask";
import { kes } from "./money";

// The monthly profit-and-loss statement an owner can hand a lender or SACCO. Bilingual labels: the owner reads
// Swahili, a loan officer may want English. Figures come from reports.*, never from a model.

export type PnlInput = {
  shopName: string | null;
  waId: string;
  period: { from: string; to: string };
  generatedOn: string;
  totals: Totals;
  debtors: { name: string; owedCents: number }[];
  fulizaOwedCents: number;
};

type Line = { text: string; amount?: string; size?: number; bold?: boolean; gap?: number };

export const FOOTER = "Imeandaliwa na Duka Books kutoka rekodi zilizothibitishwa na mmiliki.";

// "+254 700 000 101", so a lender can call the owner.
const phone = (waId: string) => `+${waId.slice(0, 3)} ${waId.slice(3, 6)} ${waId.slice(6, 9)} ${waId.slice(9)}`;

export function pnlLines(p: PnlInput): Line[] {
  const t = p.totals;
  const debtorsTotal = p.debtors.reduce((sum, d) => sum + d.owedCents, 0);
  return [
    { text: "Taarifa ya Faida na Hasara (Profit & Loss)", size: 16, bold: true },
    { text: p.shopName ?? "Duka", size: 13, bold: true, gap: 4 },
    { text: `Simu (Phone): ${phone(p.waId)}` },
    { text: `Kipindi (Period): ${p.period.from} hadi ${p.period.to}` },
    { text: `Tarehe (Prepared): ${p.generatedOn}`, gap: 14 },

    { text: "Mauzo (Sales)", amount: kes(t.salesCents) },
    { text: "Gharama ya bidhaa (Cost of goods)", amount: kes(t.purchasesCents) },
    { text: "Matumizi (Expenses, incl. M-Pesa and Fuliza fees)", amount: kes(t.expensesCents) },
    { text: "Faida halisi (Net profit)", amount: kes(t.profitCents), bold: true, gap: 14 },

    { text: "Pesa iliyoingia, kwa njia (Net money in, by channel)", bold: true },
    { text: "Taslimu (Cash)", amount: kes(t.cashCents) },
    { text: "M-Pesa", amount: kes(t.mpesaCents), gap: 14 },

    { text: "Wateja wanaodaiwa (Owed by customers)", amount: kes(debtorsTotal), bold: true },
    ...p.debtors.slice(0, 10).map((d) => ({ text: `   ${d.name}`, amount: kes(d.owedCents) })),
    ...(p.debtors.length > 10 ? [{ text: `   na wengine ${p.debtors.length - 10} (and others)` }] : []),
    { text: "Deni la Fuliza (Fuliza overdraft owed)", amount: kes(p.fulizaOwedCents), bold: true, gap: 20 },

    { text: FOOTER, size: 9 },
    { text: "Prepared by Duka Books from records confirmed by the owner (double-entry ledger).", size: 9 },
  ];
}

// Standard fonts only draw WinAnsi; anything else (emoji, some names) becomes "?" rather than crashing.
const printable = (s: string) => s.replace(/[^\x20-\x7E -ÿ]/gu, "?").replace(/\?+/g, "?").trim();

export async function buildPnlPdf(p: PnlInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const net = kes(p.totals.profitCents);
  doc.setTitle(`P&L ${p.period.from} - ${p.period.to}`);
  doc.setSubject(`Net profit ${net}`);
  doc.setProducer("Duka Books");
  doc.setCreator("Duka Books");
  const page = doc.addPage([595, 842]); // A4
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const left = 56;
  const right = 595 - 56;
  let y = 842 - 64;
  for (const line of pnlLines(p)) {
    const size = line.size ?? 11;
    const font = line.bold ? bold : regular;
    page.drawText(printable(line.text), { x: left, y, size, font, color: rgb(0.1, 0.1, 0.1) });
    if (line.amount) {
      const width = font.widthOfTextAtSize(line.amount, size);
      page.drawText(line.amount, { x: right - width, y, size, font });
    }
    y -= size + 8 + (line.gap ?? 0);
  }
  return await doc.save();
}
