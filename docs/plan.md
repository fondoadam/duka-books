# Duka Books: hackathon plan

Deadline: **Nov 4, 9:00 PM ET = Nov 5, 5:00 AM Nairobi.** Aim to submit by **Nov 3**.
Submit at https://cerebralvalley.ai/e/meta-ai-developer-hackathon/hackathon/submit (the page lists a 6-hour
grace period; don't plan on it).

## Rules that shape the build (from the event details page, Oct 27)

Judging of submitted projects:

| Weight | Criterion | What it means for Duka Books |
| --- | --- | --- |
| 30% | **Impact**: who benefits, could people really use it, fits a theme | Real duka owner, real records, a lender-ready P&L. Say how many dukas exist in Kenya. |
| 25% | **Use of Meta AI tooling**: creative, beyond basic integration, unexpected capabilities | Use several Meta tools, each where it clearly helps: Muse Spark vision on handwritten Swahili, SAM 3.1 receipt splitting, an agent loop, open weights for the cheap step. |
| 20% | **Technical depth**: sound, refined, real craft | Signed webhook, dedupe, double-entry ledger, the model only proposes and the owner confirms, figures checked against tool results. |
| 25% | **Demo**: works live, holds up, quality of the demo video | Plan the video from day 1 and record on day 7. |

- Indie track: solo or a team of up to 4. Prizes: $150k / $100k / $75k / $50k / $25k. Bonus prizes of up to
  $50k in total, which may include a community vote and a most-viral award.
- The submission must be **your own original work**. Open source is allowed if its licences are followed.
  The rules don't ban code written before the event, but this repo starts fresh on Oct 27 to be safe.
- Credits: $150 Meta Model API credit, which must be **claimed through the form in the Oct 26 email**.
  Using it needs a card on file, so set a Spend Limit on the Billing page. Claim by Nov 4, 9 PM ET.
- Models named: Muse Spark, Muse Wonder, Muse Image, SAM 3 / 3.1, Glimmer, Meta open weights, Muse Code.

## Demo story (5 min, all in WhatsApp)

A shopkeeper's real week (ledger photos, receipts, M-Pesa SMS, one voice note) turns into confirmed books,
an evening summary, an answer to "nilipata faida ngapi wiki hii?", and a lender-ready P&L.

## Status

Work now runs phase by phase from [roadmap.md](roadmap.md) ("implement phase N").

- [x] Repo, Convex schema, signed WhatsApp webhook, dedupe
- [x] Extraction (photo + text) to Zod schema with Muse Spark, proposal + Confirm/Reject buttons
- [x] Double-entry posting on confirm
- [x] Exact M-Pesa SMS parser (received, Till, sent, paid, paybill, transaction cost); duplicate codes refused
- [x] Dry-run outbox + `pnpm simulate`; 34 tests incl. the full signed-webhook -> confirm -> journal loop
- [ ] Muse Spark verified against real ledger photos (`pnpm smoke:extract`)
- [x] WhatsApp test number connected end to end (Oct 29)
- [x] Oct 29: corrections, summaries + cron + P&L PDF, voice (stub ASR), SAM 3 receipt splitting (Space client +
      stub), one model switch, sum check, `pnpm eval`, README. 158 tests. Status per phase in [roadmap.md](roadmap.md).

## Days

| Day | Date | Goal |
| --- | --- | --- |
| 1 | Oct 27 | Rules, Discord, API key, Convex project. Smoke-test extraction on 5+ real photos and SMS. |
| 2 | Oct 28 | WhatsApp round trip live. Voice notes: pick an ASR path and get Swahili working. |
| 3 | Oct 29 | Corrections: "Si sahihi" lets the owner fix a line by replying; save the fixes as per-shop few-shot examples. |
| 4 | Oct 30 | Ask agent: tool calls over the journal (sales, spend, profit, debtors, by period). Numbers come only from tools. |
| 5 | Oct 31 | Evening summary (scheduled, in Swahili). Low-stock and who-owes-me. |
| 6 | Nov 1 | SAM 3.1 receipt splitting (one photo of a pile of receipts becomes one entry per receipt). Monthly P&L as a PDF in WhatsApp. |
| 7 | Nov 2 | Collect a real shop's week; fix what breaks; record the demo video. |
| 8 | Nov 3 | README, write-up, submit. Nov 4 is buffer only. |

**Cut first if late:** eTIMS draft invoice, then the scheduled evening summary (send it on demand instead).
Keep SAM 3.1: "Use of Meta AI tooling" is 25% of the score.

## Open questions

- Submission form fields (video length, repo link, write-up): open the submit page while signed in.
- What is Glimmer, and does it fit (Discord / workshops)?
- ~~Does the Meta Model API accept `response_format: json_schema`?~~ Yes, strict subset; our schemas fit
  (docs/meta-api-review.md).
- Speech, **answered Oct 29 from the docs** (docs/meta-api-review.md): `muse-voice-transcribe-1.0` has no
  Swahili, but Muse Spark takes audio input (WAV/MP3). `ASR_PROVIDER=meta` decodes the Opus note and asks
  `muse-spark-1.2`; it turns on with the key. Original question: does the Meta Model API offer transcription for Swahili, or should Omnilingual ASR (open weights) run on
  Modal/Baseten? Ask on Discord. **Gap (Oct 29):** voice notes run on the ASR stub. No card-less host serves a
  Meta ASR model (the official `facebook/omniasr-transcriptions` Space is paused; no HF inference provider serves
  MMS or omniASR). The code takes any OpenAI-compatible `/audio/transcriptions` host by env; steps in roadmap Phase 5.
- Which partner credits (Baseten/Modal/Fireworks) were granted?
