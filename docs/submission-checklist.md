# Submission checklist

Deadline **Nov 4, 9:00 PM ET = Nov 5, 5:00 AM Nairobi**. Aim for Nov 3. Form:
https://cerebralvalley.ai/e/meta-ai-developer-hackathon/hackathon/submit

## Before the video

- [ ] Model key (or Llama fallback) live: `npx convex env set MODEL_API_KEY …`. Check one real ledger photo on the phone (roadmap Phase 7).
- [ ] `pnpm eval` on 5–10 real samples: every amount right on at least 8 of 10.
- [ ] SAM: ~~`HF_TOKEN` + `SEGMENT_PROVIDER=hf-space` set~~ (done Oct 29); a photo of 3 real receipts captioned *risiti* gives 3 groups (Phase 6).
- [ ] Voice: a real ASR host, or say plainly in the write-up and video that voice runs on a stub (Phase 5).
- [ ] Phone checks from roadmap Phase 1 pass on the real test number (SMS → confirm → duplicate refused → photo).
- [ ] Clear test data from the real shop if needed, so the week's numbers are clean.
- [ ] WhatsApp token is the permanent System User token (not the 24h one).

## Phase 8: real shop week and video

- [ ] Owner's consent to film and to use their records.
- [ ] A week of real records sent from the phone (ledger photos, receipts, M-Pesa/Fuliza SMS, 2 voice notes).
- [ ] Demo script run twice on the phone. Check `inbound` rows with `status = failed` and fix anything that broke.
- [ ] **3-minute** video (rules; beats in `plan.md`): photo → proposal → confirm → *Si sahihi* fix → SAM receipts (numbered photo) → voice
      note → "faida wiki hii?" → P&L PDF. English captions over the Swahili. Close on a card saying what was built during the event and which
      Meta models ran live. Pitch it as a bookkeeper, never as "reads receipts" (simple image analyzers are banned).
      Check the length (≤ 3:00), then watch it once end to end.
- [ ] Upload (YouTube unlisted or as the form asks) and note the link here.

## Repo

- [ ] README "What was built during the hackathon" section still true (rules: judges must tell what's new, or DQ).
- [ ] README status table updated to what is actually live on submit day (be honest about stubs).
- [ ] No secrets in git: `git log -p | grep -iE "EAA|hf_|sk-|secret="` comes back empty. `.env.local` stays ignored.
- [ ] `pnpm typecheck && pnpm test` green on `main`.
- [ ] Make `fondoadam/duka-books` **public** (GitHub → Settings → Danger zone → Change visibility), or add the
      judges as collaborators if the form allows a private repo.
- [ ] Remove or keep the stray screenshots in the repo root (they are untracked; don't commit them).

## Form

- [ ] Project name, one-line pitch: "A WhatsApp bookkeeper for Kenya's dukas, on Meta's models."
- [ ] Repo link, video link, write-up (the README's first sections work as the write-up).
- [ ] Track: indie. Theme: Build for Your World.
- [ ] Which Meta tools were used: Muse Spark (vision, tools agent), SAM 3, Omnilingual ASR / Llama fallback. Name exactly what was live.
- [ ] Claim the $150 Meta credit through the Oct 26 email form by Nov 4, 9 PM ET (even if unused).
- [ ] Every team member added (solo: just you).
- [ ] Submit, then screenshot the confirmation.
