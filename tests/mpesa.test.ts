import { describe, expect, it } from "vitest";
import { parseMpesa } from "../convex/lib/mpesa";

const today = "2026-10-27";

describe("parseMpesa", () => {
  it("reads a personal 'you have received' SMS", () => {
    const r = parseMpesa(
      "TJK4H7XYZ1 Confirmed.You have received Ksh650.00 from JANE WANJIKU 0712345678 on 25/10/26 at 9:14 AM  New M-PESA balance is Ksh12,345.00. Earn interest daily on Ziidi MMF",
      today,
    );
    expect(r?.entries).toEqual([
      { date: "2026-10-25", description: "M-Pesa kutoka Jane Wanjiku", quantity: null, amountKes: 650, kind: "sale", method: "mpesa", counterparty: "Jane Wanjiku", ref: "TJK4H7XYZ1" },
    ]);
  });

  it("reads a Till (buy goods) merchant SMS with a masked number", () => {
    const r = parseMpesa("TJL8ABC2DE Confirmed. Ksh1,250.00 received from 254712***678 PETER OTIENO on 26/10/26 at 6:40 PM. New Account balance is Ksh8,900.00.", today);
    expect(r?.entries[0]).toMatchObject({ amountKes: 1250, kind: "sale", counterparty: "Peter Otieno", date: "2026-10-26" });
  });

  it("reads a payment to a supplier and books the transaction cost", () => {
    const r = parseMpesa("TJM1QRS3TU Confirmed. Ksh2,500.00 sent to JOHN KAMAU 0722000000 on 27/10/26 at 10:02 AM. New M-PESA balance is Ksh5,000.00. Transaction cost, Ksh33.00.", today);
    expect(r?.entries).toHaveLength(2);
    expect(r?.entries[0]).toMatchObject({ amountKes: 2500, kind: "purchase", counterparty: "John Kamau", ref: "TJM1QRS3TU" });
    expect(r?.entries[1]).toMatchObject({ amountKes: 33, kind: "expense", ref: "TJM1QRS3TU-fee" });
  });

  it("reads paybill as an expense with the account number", () => {
    const r = parseMpesa("TJN5VWX6YZ Confirmed. Ksh1,000.00 sent to KPLC PREPAID for account 54321098765 on 27/10/26 at 8:00 PM New M-PESA balance is Ksh4,000.00. Transaction cost, Ksh0.00.", today);
    expect(r?.entries).toEqual([
      expect.objectContaining({ description: "Paybill Kplc Prepaid (54321098765)", kind: "expense", amountKes: 1000 }),
    ]);
  });

  it("reads 'paid to' (buy goods by the shop)", () => {
    const r = parseMpesa("TJP7ABC8DE Confirmed. Ksh4,800.00 paid to BIDCO DISTRIBUTORS. on 27/10/26 at 11:30 AM.New M-PESA balance is Ksh200.00. Transaction cost, Ksh0.00.", today);
    expect(r?.entries[0]).toMatchObject({ kind: "purchase", counterparty: "Bidco Distributors", amountKes: 4800 });
  });

  it("splits several forwarded SMS and skips a repeat", () => {
    const a = "TJK4H7XYZ1 Confirmed.You have received Ksh650.00 from JANE WANJIKU 0712345678 on 25/10/26 at 9:14 AM New M-PESA balance is Ksh12,345.00.";
    const b = "TJL8ABC2DE Confirmed. Ksh1,250.00 received from 254712***678 PETER OTIENO on 26/10/26 at 6:40 PM.";
    const r = parseMpesa(`${a}\n\n${b}\n\n${a}`, today);
    expect(r?.entries.map((e) => e.ref)).toEqual(["TJK4H7XYZ1", "TJL8ABC2DE"]);
  });

  // Real SMS forwarded from a phone on Oct 29. Fuliza sends it with the same code as the payment it covered.
  const FULIZA = "UJT5R09EGR Confirmed. Fuliza M-PESA amount is Ksh 50.00. Access Fee charged Ksh 0.50. Total Fuliza M-PESA outstanding amount is Ksh496.28 due on 26/11/26. To check daily charges, Dial *334#OK Select Query Charges";

  it("books a Fuliza draw as a loan and its access fee as an expense, dated today (not the due date)", () => {
    const r = parseMpesa(FULIZA, today);
    expect(r?.entries).toEqual([
      { date: today, description: "Mkopo wa Fuliza", quantity: null, amountKes: 50, kind: "loan_received", method: "mpesa", counterparty: "Fuliza", ref: "UJT5R09EGR-fuliza" },
      { date: today, description: "Ada ya Fuliza", quantity: null, amountKes: 0.5, kind: "loan_fee", method: "mpesa", counterparty: "Fuliza", ref: "UJT5R09EGR-fuliza-fee" },
    ]);
    expect(r?.notes).toBe("Deni la Fuliza sasa ni KES 496.28, linalipwa 26/11/26.");
  });

  it("keeps both the payment and its Fuliza SMS when they share a code", () => {
    const paid = "UJT5R09EGR Confirmed. Ksh50.00 sent to JOHN KAMAU 0722000000 on 29/10/26 at 7:02 AM. New M-PESA balance is Ksh0.00. Transaction cost, Ksh0.00.";
    const r = parseMpesa(`${paid}\n${FULIZA}\n${FULIZA}`, today);
    expect(r?.entries.map((e) => e.ref)).toEqual(["UJT5R09EGR", "UJT5R09EGR-fuliza", "UJT5R09EGR-fuliza-fee"]);
  });

  it("books a Fuliza repayment, full or partial", () => {
    const full = parseMpesa("UJU1ABC2DE Confirmed. Ksh 496.28 from your M-PESA has been used to fully pay your outstanding Fuliza M-PESA. Available Fuliza M-PESA limit is Ksh 1,000.00. M-PESA balance is Ksh 3.72.", today);
    expect(full?.entries).toEqual([
      { date: today, description: "Kulipa Fuliza", quantity: null, amountKes: 496.28, kind: "loan_repaid", method: "mpesa", counterparty: "Fuliza", ref: "UJU1ABC2DE" },
    ]);
    const part = parseMpesa("UJU3FGH4JK Confirmed. Ksh 100.00 from your M-PESA has been used to partially pay your outstanding Fuliza M-PESA. Available Fuliza M-PESA limit is Ksh 600.00. M-PESA balance is Ksh 0.00.", today);
    expect(part?.entries[0]).toMatchObject({ amountKes: 100, kind: "loan_repaid" });
  });

  it("leaves non-M-Pesa text to the model", () => {
    expect(parseMpesa("Nimeuza unga 3 kwa 540, sukari 2 deni Mama Njeri", today)).toBeNull();
    expect(parseMpesa("Leo nimeuza mengi sana sokoni na pia nimepokea: TJK4H7XYZ1 Confirmed.You have received Ksh650.00 from JANE on 25/10/26", today)).toBeNull();
  });

  it("hands unsupported M-Pesa types (withdrawals) to the model", () => {
    expect(parseMpesa("TJQ9FGH0JK Confirmed.on 27/10/26 at 1:00 PMWithdraw Ksh5,000.00 from 123456 - AGENT New M-PESA balance is Ksh1.00.", today)).toBeNull();
  });
});
