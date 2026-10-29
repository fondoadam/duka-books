# Duka Books: phased roadmap

Written Oct 29 (day 3). The Meta Model API key is still blocked (no card), so the phases are ordered to do
everything that does **not** need the key first. Each model call sits behind a function with a stub, and the
key is plugged in by Phase 7 whenever it arrives.

Deadline and judging weights are in [plan.md](plan.md). Target submit: **Nov 3**.

## How to use this

Say **"implement phase N"**. For every phase:

1. Read this phase and the files it lists. Phases name their dependencies; don't start one whose dependency is open.
2. Write the named tests first, then the code (TDD). Model calls are stubbed in tests; no test may need a key.
3. Done means: `pnpm typecheck` and `pnpm test` pass, the "Done when" check works through `pnpm simulate`
   (or on the phone once Phase 1 is done), and the phase's box in the status table below is ticked.
4. One commit per task, `feat:`/`fix:`/`chore:` prefix. Replies to the owner are in Swahili, matching
   `convex/process.ts`.

**Does WhatsApp need the key?** No. The WhatsApp Cloud API token comes from the Meta developer app and is free;
only the Model API (Muse Spark) needs the card. With `EXTRACT_STUB=1` and the exact M-Pesa parser, the whole
phone loop works today.

## Status

| Phase | Name | Needs model key | Scores on | Status |
| --- | --- | --- | --- | --- |
| 0 | Lock in + model seam | No | Technical depth | [x] |
| 1 | WhatsApp live on the phone | No | Demo | [ ] |
| 2 | Ask the books (agent tools) | No (tools) / Yes (agent) | Meta tooling, Impact | [x] |
| 3 | Corrections ("Si sahihi") | No | Technical depth, Demo | [x] |
| 4 | Summaries, debtors, P&L PDF | No | Impact | [x] |
| 5 | Voice notes | Depends on ASR path | Meta tooling, Impact | [x] stub (real ASR: your step) |
| 6 | SAM 3.1 receipt splitting | No (hosted SAM) | Meta tooling | [x] stub + SAM 3 Space client (token: your step) |
| 7 | Key day: Muse Spark live | **Yes** | Meta tooling, Demo | [ ] prep done; needs key |
| 8 | Real shop week + demo video | Yes | Demo, Impact | [ ] |
| 9 | Write-up and submit | No | All | [ ] |

Suggested calendar: Oct 29 → 0, 1 · Oct 30 → 2, 3 · Oct 31 → 4, 5 · Nov 1 → 6 · Nov 2 → 8 · Nov 3 → 9.
Phase 7 jumps the queue the moment the key works.

**If the key hasn't arrived by Nov 1:** run Phase 7 against Llama 4 open weights (vision-capable) on a
partner host (Fireworks, Together, Groq or Baseten credits). It is still Meta tooling, and Phase 0 makes it an
env change. Say so honestly in the write-up.

---

## Phase 0: Lock in + model seam

**Why:** the M-Pesa parser, outbox, simulator and 34 tests are staged but not committed. And every later phase
needs to swap providers and stubs without touching call sites.

**Files:** `convex/lib/ai.ts`, `convex/lib/extract.ts`, `convex/process.ts`, `.env.example`, `tests/ai.test.ts`

- [x] Commit the staged work as it is (`feat: M-Pesa parser, outbox, simulator, end-to-end tests`). Leave the
      two screenshots and `docs/discord-messages.txt` out unless asked.
- [x] `ai.ts`: read `MODEL_PROVIDER` (`meta` default, or `compat` for any OpenAI-compatible host), with
      `MODEL_BASE_URL`, `MODEL_API_KEY`, `VISION_MODEL`, `TEXT_MODEL`. Export `visionModel()` and `textModel()`
      (Muse Spark for both under `meta`). Keep `supportsStructuredOutputs` behind `MODEL_STRUCTURED=0|1`.
- [x] Move the stub out of `process.ts`: `extractFromImage` / `extractFromText` return the stub when
      `EXTRACT_STUB=1`, so every caller (and later phases) get stubbing for free.
- [x] `.env.example`: document the new vars, with a commented Llama-on-partner example.
- [x] Tests: `ai.test.ts` → "picks the meta provider by default", "uses compat base URL and models when set".

**Done when:** `pnpm test` passes and `pnpm simulate` still proposes and confirms an M-Pesa SMS.

---

## Phase 1: WhatsApp live on the phone

**Depends on:** 0. **Needs:** Meta developer app with the WhatsApp product (no card needed).

**Files:** `README.md`, `convex/http.ts` (only if a payload surprises us), `docs/plan.md`

- [x] Convex cloud dev deployment `calm-warbler-133` (webhook: `https://calm-warbler-133.convex.site/whatsapp`),
      `EXTRACT_STUB=1` and `WHATSAPP_DRY_RUN=1` set; simulator loop (SMS, confirm, duplicate, photo) and the
      verify GET checked against it on Oct 29.
- [x] Meta app with WhatsApp: set `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, the real `WHATSAPP_APP_SECRET`
      (also in `.env.local`, or the simulator stops signing correctly), unset `WHATSAPP_DRY_RUN`, connect the
      webhook, subscribe to `messages`. Oct 29: the app had to be **published**, and the WhatsApp account had to
      be linked to it (`POST /1543128266783417/subscribed_apps`); it was only linked to the F8ware app.
- [ ] On the phone: forward a real M-Pesa SMS → proposal → "Sawa, andika" → "Nimeandika rekodi 1". Forward it
      again → "tayari ziko kwenye vitabu". Send a photo → stub proposal.
- [x] Mark messages as read and show the typing indicator while processing (`markRead(messageId)` in
      `lib/whatsapp.ts`, called at the start of `process.inbound`). Small, but the demo feels alive.
- [x] Create a permanent System User token now (Oct 29: `dukabooksbot`, Employee role, in the F8warechat portfolio) (temporary ones die in 24h, likely mid-demo).
- [x] Tick "WhatsApp test number connected end to end" in `plan.md`.
- [ ] Parse Fuliza SMS exactly (draw = loan in, access fee = expense). The first real SMS sent was Fuliza and fell
      through to the stub.

**Done when:** the three phone checks above pass on the real test number.

---

## Phase 2: Ask the books

**Depends on:** 0. The demo line: *"nilipata faida ngapi wiki hii?"* answered with a correct number.

**Rule:** numbers come only from tools. The model chooses tools and words the answer; it never does arithmetic.

**Files:** create `convex/lib/periods.ts`, `convex/reports.ts`, `convex/lib/ask.ts`; modify `convex/process.ts`;
tests `tests/periods.test.ts`, `tests/reports.test.ts`, `tests/ask.test.ts`

- [x] `periods.ts`: `resolvePeriod(name: "today"|"yesterday"|"this_week"|"last_week"|"this_month"|"last_month",
      today: string): { from: string; to: string }`. Weeks start Monday, Nairobi dates.
- [x] `reports.ts` (internal queries over `journal.by_shop_date`), all returning integer cents:
      `totals({ shopId, from, to })` → `{ salesCents, expensesCents, purchasesCents, profitCents, cashCents, mpesaCents }`;
      `debtors({ shopId })` → `{ name, owedCents }[]` (receivables by counterparty, largest first).
      Needs `counterparty` on journal rows: add `counterparty: v.union(v.string(), v.null())` and set it in `settle`.
- [x] `ask.ts`: `answer(question, tools)` with the AI SDK `generateText` + `tools` (`get_totals(period)`,
      `get_debtors()`), `stopWhen: stepCountIs(4)`, Swahili system prompt.
- [x] Guard: every number in the reply must appear in a tool result (formatted as KES); otherwise reply with a
      template built from the tool result instead. `checkFigures(reply, toolResults): boolean`.
- [x] No-key fallback (`EXTRACT_STUB=1` or no key): keyword router (`faida`, `mauzo`, `matumizi`, `deni`,
      `leo`, `wiki`, `mwezi`) → same tools → template reply. The demo works either way.
- [x] `process.ts`: a text that isn't M-Pesa and ends with `?` or starts with a question word goes to `ask`, not extraction.
- [x] Tests: "this_week on a Sunday covers Mon–Sun", "profit = sales − expenses − purchases",
      "credit sale shows in debtors and leaves after payment_received", "checkFigures rejects an invented number",
      "keyword router answers 'faida wiki hii' from journal data".

- [x] Also answers "deni la Fuliza?" from a `reports.loans` query (`get_fuliza_balance` tool), since Fuliza
      SMS are now booked as loans (Oct 29: a real one from the phone had fallen through to the stub).

Oct 29: done against `calm-warbler-133` through the router. The agent path is covered by mock-model tests only;
it switches on in Phase 7 when `MODEL_API_KEY` is set and `EXTRACT_STUB` removed.

**Done when:** after confirming a few entries via `pnpm simulate`, `pnpm simulate "nilipata faida ngapi wiki hii?"`
returns the right figure.

---

## Phase 3: Corrections ("Si sahihi")

**Depends on:** 0. Today "Si sahihi" just rejects. Instead it should let the owner fix the line.

**Files:** `convex/ledger.ts`, `convex/process.ts`, `convex/schema.ts`, create `convex/lib/corrections.ts`,
`tests/corrections.test.ts`, extend `tests/flow.test.ts`

- [x] "Si sahihi" → reply: *"Andika namba ya mstari na kiasi sahihi, mfano: 2 = 450. Au 'futa 2' kuondoa mstari."*
      Proposal status becomes `correcting`; shop remembers `pendingCorrection: Id<"proposals"> | null`.
- [x] `parseCorrection(text): { line: number; amountKes?: number; kind?: EntryKind; delete?: true } | null`,
      exact rules for `2 = 450`, `2 450`, `futa 2`, `2 deni`, `2 mpesa`. Anything else → model fallback later (Phase 7).
- [x] Apply the fix, re-send the proposal with buttons (same id). "Ghairi" cancels.
- [x] Save each fix in a new `corrections` table `{ shopId, before: proposedEntry, after: proposedEntry }`;
      `extract.ts` adds the shop's last 5 as few-shot examples (used once the key works).
- [x] Tests: parse cases above, "fixing line 2 changes only line 2 and re-proposes",
      "a correction from another shop is ignored", "confirm after correction posts the corrected amount".

Oct 29: the proposal stays open while the owner fixes it (buttons become "Sawa, andika" / "Ghairi"), so several
fixes can follow one "Si sahihi". Free-text fixes the rules don't match get a hint; the model fallback is Phase 7.
Simulator shops (signed `duka_sim` flag) are always dry-run, so `pnpm simulate` is safe on the live deployment.

**Done when:** simulate photo → reject → `2 = 450` → confirm posts 450. ✅ Oct 29 on `calm-warbler-133`
(SIM_FROM=254700000901): journal shows Sukari 1kg KES 450 to receivables.

---

## Phase 4: Summaries, debtors, P&L PDF

**Depends on:** 2 (reuses `reports.totals` and `reports.debtors`).

**Files:** create `convex/crons.ts`, `convex/summaries.ts`, `convex/pnl.ts` (`"use node"`), modify
`convex/lib/whatsapp.ts`, `convex/schema.ts`; tests `tests/summaries.test.ts`, `tests/pnl.test.ts`

- [x] Evening summary at 19:00 Nairobi (16:00 UTC cron): sales, spend, profit today, top 3 debtors, one line
      vs yesterday. Only for shops with journal activity today. `shops.summaryOptOut` and "acha ripoti" to stop.
      WhatsApp only allows free-form text within 24h of the owner's last message: skip shops outside it
      (store `lastInboundAt` on shops).
- [x] On demand: "ripoti" sends the same summary now (this is the cut-down version if crons slip).
- [x] "Nani ananidai?" → debtors list (the Phase 2 router already routes it; add the template).
- [x] Monthly P&L PDF with `pdf-lib`: shop name, period, sales, cost of goods (purchases), expenses, net profit,
      cash vs M-Pesa, list of debtors, footer "Imeandaliwa na Duka Books kutoka rekodi zilizothibitishwa na mmiliki".
      Store in Convex file storage, send with `sendDocument(to, link, filename, caption)`.
      Trigger: "P&L", "ripoti ya mwezi", "taarifa ya mkopo".
- [x] Tests: "summary totals match reports.totals", "no summary for a shop with no activity or outside 24h",
      "pnl builds a PDF whose text contains the net profit" (parse with `pdf-lib` or check bytes start `%PDF`).

Oct 29: the summary and the P&L both carry the Fuliza balance. `pdf-lib` runs in the default Convex runtime, so
`pnl.ts` needs no `"use node"`. The P&L labels are bilingual (Swahili / English) for a loan officer, and "this
month" ends today. The cron is live on `calm-warbler-133`: a real shop that booked something today and wrote within
24h gets the summary at 19:00.

**Done when:** `pnpm simulate "ripoti ya mwezi"` logs a document reply with a working storage link. ✅ Oct 29: the
link returned `200 application/pdf`, starting `%PDF-1.7`, and renders as a one-page statement.

---

## Phase 5: Voice notes

**Depends on:** 0. **Open question:** which ASR. Decide at the start of the phase, in this order:
1. Meta Model API transcription, if it exists and handles Swahili (needs key).
2. Omnilingual ASR (Meta open weights, covers Swahili) on Modal or Baseten credits.
3. Muse Spark with audio input, if supported.

**Files:** create `convex/lib/transcribe.ts`, modify `convex/process.ts`; `tests/flow.test.ts`

- [x] `transcribe(bytes: Uint8Array, mimeType: string): Promise<string>`, provider from `ASR_PROVIDER`;
      `ASR_STUB=1` returns *"Nimeuza mkate tatu kwa shilingi mia moja hamsini"*.
      WhatsApp voice notes are `audio/ogg; codecs=opus`; convert only if the provider needs it.
- [x] `process.ts`: audio → transcribe → echo the transcript ("Nimesikia: …") → `extractFromText` → proposal.
      A spoken question goes to `ask` like text.
- [x] Tests: "a voice note with ASR_STUB proposes the transcribed sale".

- [x] Extra: `lib/spoken.ts` reads simple spoken or typed records exactly ("Nimeuza mkate tatu kwa shilingi mia moja
      hamsini" → sale KES 150, qty 3; Swahili number words up to the thousands), so the voice demo books the right
      figure even with extraction stubbed. Anything it isn't sure of goes to the model.

Oct 29: the stub path works end to end on `calm-warbler-133` (`pnpm simulate voice` → "Nimesikia: …" → proposal
"Mkate: KES 150"). **Real ASR is not live**: no free, card-less host serves a Meta ASR model today. Meta's own
Space `facebook/omniasr-transcriptions` is paused (needs an A100), the community copies error out, and no Hugging
Face inference provider serves `facebook/mms-1b-all` or `omniASR`. On the phone a real voice note gets the stub
sentence, labelled "Majaribio".

**Your steps to make it real (any one):**
1. Ask on the hackathon Discord whether the Meta Model API takes audio input for Muse Spark. If yes, tell me and I
   add `ASR_PROVIDER=meta` (a small change in `lib/transcribe.ts`).
2. With partner credits (Modal, Baseten): deploy `infra/modal_app.py` (`modal deploy infra/modal_app.py`, see the
   file's header). It serves Omnilingual ASR at `/v1/audio/transcriptions`. Then on the deployment:
   `npx convex env set ASR_PROVIDER compat`, `ASR_BASE_URL https://<app>.modal.run/v1`, `ASR_MODEL omniASR_LLM_7B`,
   `ASR_API_KEY <the token you set in Modal>`.
3. Send a real Swahili voice note from the phone and check that the "Nimesikia" echo is right.

**Done when:** a real Swahili voice note on the phone becomes a correct proposal (or, without ASR access, the stub path works and the gap is noted in `plan.md`).

---

## Phase 6: SAM 3.1 receipt splitting

**Depends on:** 0. One photo of several receipts → one extraction per receipt. This is the most visible
"beyond basic" Meta tooling moment, so keep it even if other things are cut.

**Files:** create `convex/lib/segment.ts`, modify `convex/process.ts`; `tests/segment.test.ts`

- [x] Host SAM 3.1 (open weights) on Modal/Baseten/Replicate, or use Meta's hosted endpoint if one exists.
      Text prompt `"receipt"`; return boxes/masks.
- [x] `segmentReceipts(bytes, mimeType): Promise<{ bytes: Uint8Array; box: [x, y, w, h] }[]>`: crop each box
      (pad 2%), drop boxes under 5% of the image area. `SEGMENT_STUB=1` returns the whole image once.
- [x] `process.ts`: caption or owner text "risiti" (or a cheap model check later) → segment → extract each crop in
      parallel → one proposal grouping entries by receipt ("Risiti 1: …, Risiti 2: …").
      One receipt found → same as today's single-photo path.
- [x] Save an annotated image (boxes + numbers) and send it back before the proposal: makes the SAM step visible in the demo video.
- [x] Tests: "crops fall inside the image", "tiny boxes are dropped", "two stub crops give one proposal with both receipts' entries".

Oct 29: built in `convex/lib/segment.ts` with three providers. `jpeg-js` crops and draws the numbered boxes
inside the normal Convex runtime (it needs a two-line `Buffer` shim there).
- **stub** (default, live today): a real photo stays one receipt. The simulator's empty photo becomes a generated
  three-receipt fixture, so `pnpm simulate risiti` shows the annotated photo and a proposal grouped "Risiti 1/2/3".
  ✅ checked on `calm-warbler-133`.
- **`hf-space`**: SAM 3 on the free ZeroGPU Space `prithivMLmods/SAM3-Demo` through its Gradio API
  (upload → `run_image_segmentation(image, "receipt", 0.25)` → one mask PNG per receipt → boxes). Tried live
  from this machine: two calls returned receipt masks, then the anonymous quota ran out ("ZeroGPU runs limit").
  A free HF token lifts the quota. The protocol is covered by a mocked test.
- **`http`**: your own SAM 3.1 server, `infra/modal_app.py` (also serves Omnilingual ASR). **Untested**: no
  Modal access or SAM 3.1 weight approval here.

**Your steps to make it real (no card needed for the first):**
1. Make a free Hugging Face account → Settings → Access Tokens → a **read** token.
2. `npx convex env set HF_TOKEN hf_...` and `npx convex env set SEGMENT_PROVIDER hf-space` on `calm-warbler-133`.
3. From the phone, send a photo of 3 receipts with the caption **risiti**. Expect the numbered photo, then one
   proposal with three groups. (Until the model key works, each group holds the stub lines; the split itself
   is real.) If boxes are missed, try `npx convex env set SEGMENT_THRESHOLD 0.15`.
4. If the Space is down or slow on the day, duplicate it to your account, or use `infra/modal_app.py` with
   partner credits and `SEGMENT_PROVIDER=http`.

**Done when:** a photo of 3 real receipts yields 3 groups in one proposal.

---

## Phase 7: Key day: Muse Spark live

**Depends on:** the key (or the Llama fallback from Phase 0). Do this the day it arrives.

**Files:** `convex/lib/ai.ts`, `convex/lib/extract.ts`, create `scripts/eval.ts`, `samples/expected/*.json`

- [ ] Answer the open questions in `plan.md` first: does `response_format: json_schema` work? (`MODEL_STRUCTURED`)
      Image size limits? Latency per photo?
- [x] `pnpm eval`: runs extraction over `samples/*` and compares to `samples/expected/*.json` (hand-written for
      5–10 real ledger photos and receipts). Prints per-file line recall and amount accuracy. Re-run after every prompt change.
- [ ] Tune the prompt until amounts are right on the eval set. If a line can't be read, it must be left out and
      named in notes, never guessed.
- [x] Turn the live paths on: one switch, `modelsLive()` in `lib/ai.ts` = `MODEL_API_KEY` set (and `MODEL_STUB`
      not `1`). It drives photo/text extraction, the Phase 2 agent and the Phase 3 model fallback for free-text
      corrections (`interpretCorrection`). `EXTRACT_STUB` is retired and ignored.
- [x] Sum check: if a ledger page shows a written total, compare it to the sum of extracted lines and warn the owner when they differ.
      (`writtenTotalKes` in the model schema; `sumCheck` accepts a total matching all lines or one kind of line.)

Oct 29 prep, without a key: everything above marked [x] is built and tested with mock models. Still open (needs
the key): the questions in `plan.md`, real answer keys, prompt tuning.

**Your steps on key day (or with the Llama fallback):**
1. Meta key: put `MODEL_API_KEY=...` in `.env.local`, run `pnpm smoke:extract samples/<a ledger photo>.jpg`.
   If it errors on `response_format`, add `MODEL_STRUCTURED=0`. Note the latency it prints.
   Llama fallback instead: `MODEL_PROVIDER=compat`, `MODEL_BASE_URL`, `VISION_MODEL`, `TEXT_MODEL`,
   `MODEL_API_KEY` (example in `.env.example`).
2. Put 5–10 real photos in `samples/` and write `samples/expected/<name>.json` for each (format in
   `samples/README.md`). Run `pnpm eval`. Send me the output and I'll tune the prompt.
3. Go live on the deployment, same values: `npx convex env set MODEL_API_KEY ...` (plus the compat vars for
   Llama). That single change makes photos, free text, "ask" and free-text corrections use the model. You can
   `npx convex env remove EXTRACT_STUB` to tidy up; it is already ignored. If the model misbehaves during a demo:
   `npx convex env set MODEL_STUB 1`.

**Done when:** `pnpm eval` reports every amount correct on at least 8 of 10 samples, and the phone loop works with no stubs.

---

## Phase 8: Real shop week + demo video

**Depends on:** 1–7 (whatever is done; cut the rest).

- [ ] Get a real duka's week: ledger pages, receipts, forwarded M-Pesa SMS, 2 voice notes. Get the owner's consent to film.
- [ ] `scripts/seed-week.ts`: replays that week through `simulate` so the "ask" and P&L moments have real data
      even if live sends are slow.
- [ ] Run the full demo script on the phone twice. Fix whatever breaks (log failures from `inbound.status = failed`).
- [ ] Record the 5-minute video (story in `plan.md`): photo → proposal → confirm → SAM receipts → voice note →
      "faida wiki hii?" → evening summary → P&L PDF. Screen-record the phone; caption the Swahili in English.

**Done when:** the video file is exported and watched once end to end.

---

## Phase 9: Write-up and submit

- [ ] README: what it does, which Meta models and where (Muse Spark vision, SAM 3.1, ASR, agent tools), how the
      ledger stays correct (signed webhook, dedupe, owner confirms, double entry, numbers only from tools).
- [ ] Architecture diagram (Mermaid in README).
- [ ] Impact paragraph: number of dukas/MSEs in Kenya (cite the source), and why a confirmed P&L matters for credit.
- [ ] Fill the submit form at the link in `plan.md`: repo, video, write-up. Submit by Nov 3; Nov 4 is buffer.

---

## Cut order if late

1. Phase 4 cron (keep "ripoti" on demand) 2. Phase 3 few-shot memory (keep the fix flow)
3. Phase 5 real ASR (keep the stubbed path, say so) 4. P&L PDF (send the P&L as text).
Never cut Phase 6 or the Phase 2 agent: Meta tooling is 25% of the score.
