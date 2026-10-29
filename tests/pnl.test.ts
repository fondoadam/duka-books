import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { buildPnlPdf, pnlLines, type PnlInput } from "../convex/lib/pnl";

const input: PnlInput = {
  shopName: "Duka la Mama Achieng 🛒",
  waId: "254700000101",
  period: { from: "2026-10-01", to: "2026-10-31" },
  generatedOn: "2026-10-29",
  totals: { salesCents: 1250000, purchasesCents: 700000, expensesCents: 85050, profitCents: 464950, cashCents: 300000, mpesaCents: 250000 },
  debtors: [{ name: "Mama Njeri", owedCents: 45000 }],
  fulizaOwedCents: 49628,
};

describe("P&L", () => {
  it("lists net profit, cost of goods, Fuliza and debtors", () => {
    const text = pnlLines(input).map((l) => `${l.text} ${l.amount ?? ""}`).join("\n");
    expect(text).toContain("Mauzo (Sales)");
    expect(text).toContain("KES 12,500");
    expect(text).toContain("Gharama ya bidhaa (Cost of goods)");
    expect(text).toContain("KES 7,000");
    expect(text).toContain("Faida halisi (Net profit)");
    expect(text).toContain("KES 4,649.50");
    expect(text).toContain("Mama Njeri");
    expect(text).toContain("Fuliza");
    expect(text).toContain("KES 496.28");
    expect(text).toContain("Imeandaliwa na Duka Books kutoka rekodi zilizothibitishwa na mmiliki");
  });

  it("builds a one-page PDF, even with characters the font can't draw", async () => {
    const bytes = await buildPnlPdf(input);
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1);
    expect(doc.getSubject()).toContain("KES 4,649.50");
  });
});
