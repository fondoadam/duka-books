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
- Credits: $150 Meta Model API credit, which must be **claimed through the form in the Oct 26 email**.
  Using it needs a card on file, so set a Spend Limit on the Billing page. Claim by Nov 4, 9 PM ET.
- Models named: Muse Spark, Muse Wonder, Muse Image, SAM 3 / 3.1, Glimmer, Meta open weights, Muse Code.

## Official rules (pasted Oct 29)

Breaking these can disqualify the project:

- **New work only.** Everything presented must be built during the event, Oct 26 to Nov 4. This repo's first
  commit is Oct 27, 06:17 Nairobi.
- **Identify your contributions.** The demo must show only what we built during the event, and judges must be able
  to tell what's new. If they can't, the project is disqualified. The README's "What was built during the
  hackathon" section and the video's closing card both say it.
- **Public repo** at submission time.
- **Teams:** max 4, solo allowed, one track only (Indie), one person submits.
- **Demo video: 3 minutes**, required, one of the main things judges score.
- **Banned:** anything breaking legal, ethical or platform policies; code, data or assets we don't have rights to
  (so: the shop owner's written consent for their records and footage). Generic projects are out, including
  **"simple image analyzers"**. Never pitch this as "reads receipts": it is a bookkeeper (double-entry ledger,
  confirm loop, agent over the books, P&L) and the photo is only one input.
- **Theme:** Build for Your World (Meta's models in a domain we know, solving a real problem). Llama 4 open weights
  count as Meta models, so the Llama fallback stays inside the rules.
- **Submit by Wed Nov 4, 9:00 PM ET** with the public repo, a working demo video link and every team member added.
- Waiver: 18+, and no Meta or Cerebral Valley staff, contractors, government-affiliated people or their households.

## Demo story (3 min, all in WhatsApp)

A shopkeeper's real week (ledger photos, receipts, M-Pesa SMS, one voice note) turns into confirmed books,
an answer to "nilipata faida ngapi wiki hii?", and a lender-ready P&L.

| Time | Beat |
| --- | --- |
| 0:00–0:15 | The problem: an exercise book and M-Pesa SMS, no records, so credit means Fuliza. |
| 0:15–0:55 | Ledger photo → Swahili proposal → *Sawa, andika* → *Si sahihi* `2 = 450` fix. |
| 0:55–1:25 | Pile of receipts captioned *risiti* → SAM numbered photo → one entry per receipt. |
| 1:25–1:45 | Forwarded M-Pesa and Fuliza SMS; the same SMS again is refused. |
| 1:45–2:10 | Voice note (only if ASR is live), then "faida wiki hii?" answered from the books. |
| 2:10–2:35 | Monthly P&L PDF arrives in WhatsApp. |
| 2:35–3:00 | Closing card: built Oct 27–Nov 4, which Meta models ran live, the double-entry journal behind it. |

Cut the voice beat before anything else if it runs long. The evening summary only gets a one-second glimpse.

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
