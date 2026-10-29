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
| 0 | Lock in + model seam | No | Technical depth | [ ] |
| 1 | WhatsApp live on the phone | No | Demo | [ ] |
| 2 | Ask the books (agent tools) | No (tools) / Yes (agent) | Meta tooling, Impact | [ ] |
| 3 | Corrections ("Si sahihi") | No | Technical depth, Demo | [ ] |
| 4 | Summaries, debtors, P&L PDF | No | Impact | [ ] |
| 5 | Voice notes | Depends on ASR path | Meta tooling, Impact | [ ] |
| 6 | SAM 3.1 receipt splitting | No (hosted SAM) | Meta tooling | [ ] |
| 7 | Key day: Muse Spark live | **Yes** | Meta tooling, Demo | [ ] |
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

- [ ] Commit the staged work as it is (`feat: M-Pesa parser, outbox, simulator, end-to-end tests`). Leave the
      two screenshots and `docs/discord-messages.txt` out unless asked.
- [ ] `ai.ts`: read `MODEL_PROVIDER` (`meta` default, or `compat` for any OpenAI-compatible host), with
      `MODEL_BASE_URL`, `MODEL_API_KEY`, `VISION_MODEL`, `TEXT_MODEL`. Export `visionModel()` and `textModel()`
      (Muse Spark for both under `meta`). Keep `supportsStructuredOutputs` behind `MODEL_STRUCTURED=0|1`.
- [ ] Move the stub out of `process.ts`: `extractFromImage` / `extractFromText` return the stub when
      `EXTRACT_STUB=1`, so every caller (and later phases) get stubbing for free.
- [ ] `.env.example`: document the new vars, with a commented Llama-on-partner example.
- [ ] Tests: `ai.test.ts` → "picks the meta provider by default", "uses compat base URL and models when set".

**Done when:** `pnpm test` passes and `pnpm simulate` still proposes and confirms an M-Pesa SMS.

---

## Phase 1: WhatsApp live on the phone

**Depends on:** 0. **Needs:** Meta developer app with the WhatsApp product (no card needed).

**Files:** `README.md`, `convex/http.ts` (only if a payload surprises us), `docs/plan.md`

- [ ] Create a Convex cloud dev deployment (`npx convex login`, `pnpm dev`), set WhatsApp env vars plus
      `EXTRACT_STUB=1`, connect the webhook, subscribe to `messages`.
- [ ] On the phone: forward a real M-Pesa SMS → proposal → "Sawa, andika" → "Nimeandika rekodi 1". Forward it
      again → "tayari ziko kwenye vitabu". Send a photo → stub proposal.
- [ ] Mark messages as read and show the typing indicator while processing (`markRead(messageId)` in
      `lib/whatsapp.ts`, called at the start of `process.inbound`). Small, but the demo feels alive.
- [ ] Create a permanent System User token now (temporary ones die in 24h, likely mid-demo).
- [ ] Tick "WhatsApp test number connected end to end" in `plan.md`.

**Done when:** the three phone checks above pass on the real test number.

---

## Phase 2: Ask the books

**Depends on:** 0. The demo line: *"nilipata faida ngapi wiki hii?"* answered with a correct number.

**Rule:** numbers come only from tools. The model chooses tools and words the answer; it never does arithmetic.

**Files:** create `convex/lib/periods.ts`, `convex/reports.ts`, `convex/lib/ask.ts`; modify `convex/process.ts`;
tests `tests/periods.test.ts`, `tests/reports.test.ts`, `tests/ask.test.ts`

- [ ] `periods.ts`: `resolvePeriod(name: "today"|"yesterday"|"this_week"|"last_week"|"this_month"|"last_month",
      today: string): { from: string; to: string }`. Weeks start Monday, Nairobi dates.
- [ ] `reports.ts` (internal queries over `journal.by_shop_date`), all returning integer cents:
      `totals({ shopId, from, to })` → `{ salesCents, expensesCents, purchasesCents, profitCents, cashCents, mpesaCents }`;
      `debtors({ shopId })` → `{ name, owedCents }[]` (receivables by counterparty, largest first).
      Needs `counterparty` on journal rows: add `counterparty: v.union(v.string(), v.null())` and set it in `settle`.
- [ ] `ask.ts`: `answer(question, tools)` with the AI SDK `generateText` + `tools` (`get_totals(period)`,
      `get_debtors()`), `stopWhen: stepCountIs(4)`, Swahili system prompt.
- [ ] Guard: every number in the reply must appear in a tool result (formatted as KES); otherwise reply with a
      template built from the tool result instead. `checkFigures(reply, toolResults): boolean`.
- [ ] No-key fallback (`EXTRACT_STUB=1` or no key): keyword router (`faida`, `mauzo`, `matumizi`, `deni`,
      `leo`, `wiki`, `mwezi`) → same tools → template reply. The demo works either way.
- [ ] `process.ts`: a text that isn't M-Pesa and ends with `?` or starts with a question word goes to `ask`, not extraction.
- [ ] Tests: "this_week on a Sunday covers Mon–Sun", "profit = sales − expenses − purchases",
      "credit sale shows in debtors and leaves after payment_received", "checkFigures rejects an invented number",
      "keyword router answers 'faida wiki hii' from journal data".

**Done when:** after confirming a few entries via `pnpm simulate`, `pnpm simulate "nilipata faida ngapi wiki hii?"`
returns the right figure.

---

## Phase 3: Corrections ("Si sahihi")

**Depends on:** 0. Today "Si sahihi" just rejects. Instead it should let the owner fix the line.

**Files:** `convex/ledger.ts`, `convex/process.ts`, `convex/schema.ts`, create `convex/lib/corrections.ts`,
`tests/corrections.test.ts`, extend `tests/flow.test.ts`

- [ ] "Si sahihi" → reply: *"Andika namba ya mstari na kiasi sahihi, mfano: 2 = 450. Au 'futa 2' kuondoa mstari."*
      Proposal status becomes `correcting`; shop remembers `pendingCorrection: Id<"proposals"> | null`.
- [ ] `parseCorrection(text): { line: number; amountKes?: number; kind?: EntryKind; delete?: true } | null`,
      exact rules for `2 = 450`, `2 450`, `futa 2`, `2 deni`, `2 mpesa`. Anything else → model fallback later (Phase 7).
- [ ] Apply the fix, re-send the proposal with buttons (same id). "Ghairi" cancels.
- [ ] Save each fix in a new `corrections` table `{ shopId, before: proposedEntry, after: proposedEntry }`;
      `extract.ts` adds the shop's last 5 as few-shot examples (used once the key works).
- [ ] Tests: parse cases above, "fixing line 2 changes only line 2 and re-proposes",
      "a correction from another shop is ignored", "confirm after correction posts the corrected amount".

**Done when:** simulate photo → reject → `2 = 450` → confirm posts 450.

---

## Phase 4: Summaries, debtors, P&L PDF

**Depends on:** 2 (reuses `reports.totals` and `reports.debtors`).

**Files:** create `convex/crons.ts`, `convex/summaries.ts`, `convex/pnl.ts` (`"use node"`), modify
`convex/lib/whatsapp.ts`, `convex/schema.ts`; tests `tests/summaries.test.ts`, `tests/pnl.test.ts`

- [ ] Evening summary at 19:00 Nairobi (16:00 UTC cron): sales, spend, profit today, top 3 debtors, one line
      vs yesterday. Only for shops with journal activity today. `shops.summaryOptOut` and "acha ripoti" to stop.
      WhatsApp only allows free-form text within 24h of the owner's last message: skip shops outside it
      (store `lastInboundAt` on shops).
- [ ] On demand: "ripoti" sends the same summary now (this is the cut-down version if crons slip).
- [ ] "Nani ananidai?" → debtors list (the Phase 2 router already routes it; add the template).
- [ ] Monthly P&L PDF with `pdf-lib`: shop name, period, sales, cost of goods (purchases), expenses, net profit,
      cash vs M-Pesa, list of debtors, footer "Imeandaliwa na Duka Books kutoka rekodi zilizothibitishwa na mmiliki".
      Store in Convex file storage, send with `sendDocument(to, link, filename, caption)`.
      Trigger: "P&L", "ripoti ya mwezi", "taarifa ya mkopo".
- [ ] Tests: "summary totals match reports.totals", "no summary for a shop with no activity or outside 24h",
      "pnl builds a PDF whose text contains the net profit" (parse with `pdf-lib` or check bytes start `%PDF`).

**Done when:** `pnpm simulate "ripoti ya mwezi"` logs a document reply with a working storage link.

---

## Phase 5: Voice notes

**Depends on:** 0. **Open question:** which ASR. Decide at the start of the phase, in this order:
1. Meta Model API transcription, if it exists and handles Swahili (needs key).
2. Omnilingual ASR (Meta open weights, covers Swahili) on Modal or Baseten credits.
3. Muse Spark with audio input, if supported.

**Files:** create `convex/lib/transcribe.ts`, modify `convex/process.ts`; `tests/flow.test.ts`

- [ ] `transcribe(bytes: Uint8Array, mimeType: string): Promise<string>`, provider from `ASR_PROVIDER`;
      `ASR_STUB=1` returns *"Nimeuza mkate tatu kwa shilingi mia moja hamsini"*.
      WhatsApp voice notes are `audio/ogg; codecs=opus`; convert only if the provider needs it.
- [ ] `process.ts`: audio → transcribe → echo the transcript ("Nimesikia: …") → `extractFromText` → proposal.
      A spoken question goes to `ask` like text.
- [ ] Tests: "a voice note with ASR_STUB proposes the transcribed sale".

**Done when:** a real Swahili voice note on the phone becomes a correct proposal (or, without ASR access, the stub path works and the gap is noted in `plan.md`).

---

## Phase 6: SAM 3.1 receipt splitting

**Depends on:** 0. One photo of several receipts → one extraction per receipt. This is the most visible
"beyond basic" Meta tooling moment, so keep it even if other things are cut.

**Files:** create `convex/lib/segment.ts`, modify `convex/process.ts`; `tests/segment.test.ts`

- [ ] Host SAM 3.1 (open weights) on Modal/Baseten/Replicate, or use Meta's hosted endpoint if one exists.
      Text prompt `"receipt"`; return boxes/masks.
- [ ] `segmentReceipts(bytes, mimeType): Promise<{ bytes: Uint8Array; box: [x, y, w, h] }[]>`: crop each box
      (pad 2%), drop boxes under 5% of the image area. `SEGMENT_STUB=1` returns the whole image once.
- [ ] `process.ts`: caption or owner text "risiti" (or a cheap model check later) → segment → extract each crop in
      parallel → one proposal grouping entries by receipt ("Risiti 1: …, Risiti 2: …").
      One receipt found → same as today's single-photo path.
- [ ] Save an annotated image (boxes + numbers) and send it back before the proposal: makes the SAM step visible in the demo video.
- [ ] Tests: "crops fall inside the image", "tiny boxes are dropped", "two stub crops give one proposal with both receipts' entries".

**Done when:** a photo of 3 real receipts yields 3 groups in one proposal.

---

## Phase 7: Key day: Muse Spark live

**Depends on:** the key (or the Llama fallback from Phase 0). Do this the day it arrives.

**Files:** `convex/lib/ai.ts`, `convex/lib/extract.ts`, create `scripts/eval.ts`, `samples/expected/*.json`

- [ ] Answer the open questions in `plan.md` first: does `response_format: json_schema` work? (`MODEL_STRUCTURED`)
      Image size limits? Latency per photo?
- [ ] `pnpm eval`: runs extraction over `samples/*` and compares to `samples/expected/*.json` (hand-written for
      5–10 real ledger photos and receipts). Prints per-file line recall and amount accuracy. Re-run after every prompt change.
- [ ] Tune the prompt until amounts are right on the eval set. If a line can't be read, it must be left out and
      named in notes, never guessed.
- [ ] Turn the live paths on: remove `EXTRACT_STUB`, enable the Phase 2 agent and Phase 3 model fallback for
      free-text corrections.
- [ ] Sum check: if a ledger page shows a written total, compare it to the sum of extracted lines and warn the owner when they differ.

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
