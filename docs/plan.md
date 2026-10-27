# Duka Books: hackathon plan

Deadline: **Nov 4, 9:00 PM ET = Nov 5, 5:00 AM Nairobi.** Aim to submit by **Nov 3**.
Indie-track judging: creativity, technical ambition, **does it work**. A reliable core loop beats more features.

## Demo story (5 min, all in WhatsApp)

A shopkeeper's real week (ledger photos, receipts, M-Pesa SMS, one voice note) turns into confirmed books,
an evening summary, an answer to "nilipata faida ngapi wiki hii?", and a lender-ready P&L.

## Status

- [x] Repo, Convex schema, signed WhatsApp webhook, dedupe
- [x] Extraction (photo + text) to Zod schema with Muse Spark, proposal + Confirm/Reject buttons
- [x] Double-entry posting on confirm
- [ ] Muse Spark verified against real ledger photos (`pnpm smoke:extract`)
- [ ] WhatsApp test number connected end to end

## Days

| Day | Date | Goal |
| --- | --- | --- |
| 1 | Oct 27 | Rules, Discord, API key, Convex project. Smoke-test extraction on 5+ real photos and SMS. |
| 2 | Oct 28 | WhatsApp round trip live. Voice notes: pick an ASR path and get Swahili working. |
| 3 | Oct 29 | Corrections: "Si sahihi" lets the owner fix a line by replying; save the fixes as per-shop few-shot examples. |
| 4 | Oct 30 | Ask agent: tool calls over the journal (sales, spend, profit, debtors, by period). Numbers come only from tools. |
| 5 | Oct 31 | Evening summary (scheduled, in Swahili). Low-stock and who-owes-me. |
| 6 | Nov 1 | Monthly P&L as a PDF sent in WhatsApp. SAM 3.1 receipt splitting if time allows. |
| 7 | Nov 2 | Collect a real shop's week; fix what breaks; record the demo. |
| 8 | Nov 3 | README, write-up, submit. Nov 4 is buffer only. |

**Cut first if late:** eTIMS draft invoice, then SAM 3.1, then the evening summary schedule (send it on demand instead).

## Open questions

- Official Rules: is pre-existing code allowed? Required submission format (video length, repo, write-up)?
- Does the Meta Model API accept `response_format: json_schema`? If not, set `supportsStructuredOutputs: false`
  in `convex/lib/ai.ts`.
- Speech: does the Meta Model API offer transcription for Swahili, or should Omnilingual ASR (open weights) run on
  Modal/Baseten? Ask on Discord.
- Which partner credits (Baseten/Modal/Fireworks) were granted?
