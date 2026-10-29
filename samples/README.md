# Samples

Real ledger photos, receipts and SMS go here. They are git-ignored (they are a real shop's books); only this
README and the answer-key format are committed.

For each sample, write an answer key in `expected/<name>.json` by reading the photo yourself:

```json
{
  "file": "ledger-1.jpg",
  "entries": [
    { "description": "Unga 2kg", "amountKes": 540, "kind": "sale" },
    { "description": "Sukari", "amountKes": 360, "kind": "sale" }
  ],
  "writtenTotalKes": 900,
  "note": "Line 3 is crossed out: not an entry."
}
```

- `entries`: every money line on the page, as the owner means it. `kind` is optional (sale, purchase, expense,
  payment_received, payment_made, loan_received, loan_repaid, loan_fee).
- `writtenTotalKes`: the total written on the page, if any (the sum check compares against it).
- Keys starting with `_` are skipped (`_example.json` documents the format).

Then `pnpm eval` (needs `MODEL_API_KEY` in `.env.local`) prints per-file line recall and amount accuracy.
Target: every amount right on at least 8 of 10 samples.
