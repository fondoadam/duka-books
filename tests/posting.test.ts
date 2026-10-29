import { describe, expect, it } from "vitest";
import { post } from "../convex/lib/posting";

const kinds = ["sale", "purchase", "expense", "payment_received", "payment_made", "loan_received", "loan_repaid", "loan_fee"] as const;
const methods = ["cash", "mpesa", "credit", "unknown"] as const;

describe("post", () => {
  for (const kind of kinds)
    for (const method of methods)
      it(`balances ${kind} / ${method}`, () => {
        const lines = post({ date: "2026-10-27", description: "x", quantity: null, amountCents: 65000, kind, method, counterparty: null, ref: null });
        const debits = lines.reduce((s, l) => s + l.debitCents, 0);
        const credits = lines.reduce((s, l) => s + l.creditCents, 0);
        expect(debits).toBe(65000);
        expect(credits).toBe(65000);
        expect(new Set(lines.map((l) => l.account)).size).toBe(2);
      });

  it("puts a credit sale into receivables", () => {
    const [debit] = post({ date: "2026-10-27", description: "Sukari", quantity: 2, amountCents: 36000, kind: "sale", method: "credit", counterparty: "Mama Njeri", ref: null });
    expect(debit.account).toBe("receivables");
  });

  it("books Fuliza as a loan: draw adds to it, the fee is an expense owed on it, repayment clears it", () => {
    const base = { date: "2026-10-29", description: "Fuliza", quantity: null, method: "mpesa" as const, counterparty: "Fuliza", ref: null };
    const pairs = (kind: "loan_received" | "loan_fee" | "loan_repaid") =>
      post({ ...base, amountCents: 5000, kind }).map((l) => (l.debitCents ? `+${l.account}` : `-${l.account}`));
    expect(pairs("loan_received")).toEqual(["+mpesa", "-loans"]);
    expect(pairs("loan_fee")).toEqual(["+expenses", "-loans"]);
    expect(pairs("loan_repaid")).toEqual(["+loans", "-mpesa"]);
  });
});
