import type { Totals } from "./ask";
import { kes } from "./money";

// The evening summary (and "ripoti" on demand). Every figure is a reports.* result; the only arithmetic is the
// difference from yesterday, done here in code.

export type SummaryInput = {
  today: Totals;
  yesterday: Totals;
  debtors: { name: string; owedCents: number }[];
  fulizaOwedCents: number;
};

export function summaryText({ today, yesterday, debtors, fulizaOwedCents }: SummaryInput) {
  const diff = today.profitCents - yesterday.profitCents;
  const vsYesterday =
    diff === 0 ? "sawa na jana" : diff > 0 ? `${kes(diff)} zaidi ya jana` : `${kes(-diff)} chini ya jana`;
  const top = debtors.slice(0, 3).map((d) => `${d.name} ${kes(d.owedCents)}`);
  return [
    "📒 Ripoti ya leo",
    `Mauzo: ${kes(today.salesCents)}`,
    `Manunuzi: ${kes(today.purchasesCents)}`,
    `Matumizi: ${kes(today.expensesCents)}`,
    `Faida: ${kes(today.profitCents)} (${vsYesterday})`,
    top.length > 0 && `Wateja wanaodaiwa zaidi: ${top.join(", ")}`,
    fulizaOwedCents > 0 && `Deni la Fuliza: ${kes(fulizaOwedCents)}`,
  ]
    .filter(Boolean)
    .join("\n");
}
