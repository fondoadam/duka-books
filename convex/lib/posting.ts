import type { Infer } from "convex/values";
import type { account, proposedEntry } from "../schema";

type Account = Infer<typeof account>;
type Entry = Infer<typeof proposedEntry>;

// Turns one confirmed entry into balanced journal lines (debit account, credit account).
export function post(entry: Entry): { account: Account; debitCents: number; creditCents: number }[] {
  const money: Account = entry.method === "mpesa" ? "mpesa" : "cash";
  const cents = entry.amountCents;
  const [debit, credit]: [Account, Account] = (() => {
    switch (entry.kind) {
      case "sale":
        return [entry.method === "credit" ? "receivables" : money, "sales"];
      case "purchase":
        return ["inventory", entry.method === "credit" ? "payables" : money];
      case "expense":
        return ["expenses", entry.method === "credit" ? "payables" : money];
      case "payment_received":
        return [money, "receivables"];
      case "payment_made":
        return ["payables", money];
    }
  })();
  return [
    { account: debit, debitCents: cents, creditCents: 0 },
    { account: credit, debitCents: 0, creditCents: cents },
  ];
}
