# Submission checklist

Deadline **Nov 4, 9:00 PM ET = Nov 5, 5:00 AM Nairobi**. Aim for Nov 3. Form:
https://cerebralvalley.ai/e/meta-ai-developer-hackathon/hackathon/submit

## Before the video

- [x] Models live without a key (Oct 29): `MODEL_PROVIDER=open`, Muse Glimmer 30B on the ZeroGPU Space for photos, Llama 3.1 8B on the Mac mini for text (`com.dukabooks.llama` login agent).
- [ ] Check one real ledger photo on the phone. The free Space quota is a handful of calls a day, so don't spend it on tests on recording day; record the video right after the quota resets.
- [ ] `pnpm eval` on 5–10 real samples: every amount right on at least 8 of 10.
- [ ] SAM: ~~`HF_TOKEN` + `SEGMENT_PROVIDER=hf-space` set~~ (done Oct 29); a photo of 3 real receipts captioned *risiti* gives 3 groups (Phase 6).
- [ ] Voice: a real ASR host, or say plainly in the write-up and video that voice runs on a stub (Phase 5).
- [ ] Phone checks from roadmap Phase 1 pass on the real test number (SMS → confirm → duplicate refused → photo).
- [ ] Clear test data from the real shop if needed, so the week's numbers are clean.
- [x] WhatsApp token is the permanent System User token (confirmed with a real reply, Nov 1). The number changed to +1 555 162 9147 on Nov 1.

## Phase 8: real shop week and video

- [ ] Owner's consent to film and to use their records.
- [ ] A week of real records sent from the phone (ledger photos, receipts, M-Pesa/Fuliza SMS, 2 voice notes).
- [ ] Demo script run twice on the phone. Check `inbound` rows with `status = failed` and fix anything that broke.
- [ ] **3-minute** video (rules; beats in `plan.md`): photo → proposal → confirm → *Si sahihi* fix → SAM receipts (numbered photo) → voice
      note → "faida wiki hii?" → P&L PDF. English captions over the Swahili. Close on a card saying what was built during the event and which
      Meta models ran live. Pitch it as a bookkeeper, never as "reads receipts" (simple image analyzers are banned).
      Check the length (≤ 3:00), then watch it once end to end.
      **Recorded without a phone (Oct 30):** put one exercise-book page (and optionally one receipts photo) in `samples/`, then
      `pnpm demo:run --ledger samples/ledger.jpg --expect 540,450,120,180,95,200 --receipts samples/receipts.jpg` plays the story against the live bot as a fresh
      simulated shop (real models, no WhatsApp sends) and `pnpm demo:video` films the replay (`demo/player.html`) to
      `demo/out/duka-books-demo.mp4`. Run it right after the Space quota resets: the photos take about 5 calls. Preview with
      `demo/player.html?speed=4`. The first misread line gets the "Si sahihi" fix on camera; none misread, no fix beat.
- [ ] Record the real phone clip ([phone-demo-guide.md](phone-demo-guide.md)) and cut it into the video.
- [ ] Upload (YouTube unlisted or as the form asks) and note the link here.

## Repo

- [ ] README "What was built during the hackathon" section still true (rules: judges must tell what's new, or DQ).
- [x] README status table updated to what is actually live (Nov 1; recheck on submit day).
- [x] (Nov 1, full history scanned) No secrets in git: `git log -p | grep -iE "EAA|hf_|sk-|secret="` comes back empty. `.env.local` stays ignored.
- [x] `pnpm typecheck && pnpm test` green on `main` (181 tests, Nov 1).
- [x] (done Nov 1) Make `fondoadam/duka-books` **public** (GitHub → Settings → Danger zone → Change visibility), or add the
      judges as collaborators if the form allows a private repo.
- [ ] Remove or keep the stray screenshots in the repo root (they are untracked; don't commit them).

## Form

- [ ] Project name, one-line pitch: "A WhatsApp bookkeeper for Kenya's dukas, on Meta's models."
- [ ] Repo link, video link, write-up: all text is ready in [submission.md](submission.md).
- [ ] Track: indie. Theme: Build for Your World.
- [ ] Which Meta tools were used: Muse Glimmer 30B (photos, open weights), Llama 3.1 8B (text, agent, corrections, own Mac), SAM 3 (receipt splitting). Muse Spark is wired but never ran; voice notes run on a stub transcript. Name exactly what was live.
- [ ] Claim the $150 Meta credit through the Oct 26 email form by Nov 4, 9 PM ET (even if unused).
- [ ] Every team member added (solo: just you).
- [ ] Submit, then screenshot the confirmation.
