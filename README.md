# Duka Books

A WhatsApp bookkeeper for Kenya's informal shops, running on Meta's models.
Built for the [Meta Global AI Developer Hackathon](https://cerebralvalley.ai/e/meta-ai-developer-hackathon)
(indie track, theme "Build for Your World"). Submissions due **Nov 4, 9:00 PM ET** (5:00 AM Nov 5, Nairobi).

The owner messages a WhatsApp number with a photo of their ledger or receipts, a forwarded M-Pesa SMS, or a
voice note. Muse Spark extracts the entries, the owner confirms with one tap, and the entries are posted to a
double-entry ledger. The model proposes; it never writes to the books on its own.

## Stack

- **Convex**: database, WhatsApp webhook (HTTP actions), scheduler
- **Meta Model API** (`muse-spark-1.1`), OpenAI-compatible, through the Vercel AI SDK. `MODEL_PROVIDER=compat`
  switches to Llama open weights on any OpenAI-compatible host (see `.env.example`)
- **WhatsApp Cloud API**, test number for the demo

## Layout

```
convex/
  schema.ts         shops, inbound messages, proposals, journal
  http.ts           GET /whatsapp (verify) and POST /whatsapp (signed messages)
  inbound.ts        dedupe + store each message, schedule processing
  process.ts        image/text -> extraction -> proposal with Confirm/Reject buttons
  ledger.ts         propose, and settle (confirm -> journal lines); refuses a transaction code twice
  outbox.ts         log of every reply (read by the simulator and tests)
  lib/ai.ts         model provider (Meta Model API, or any OpenAI-compatible host)
  lib/extract.ts    extraction prompt + Zod schema
  lib/mpesa.ts      exact parser for forwarded M-Pesa SMS (the model handles everything else)
  lib/posting.ts    entry -> balanced debit/credit lines
  lib/whatsapp.ts   send text/buttons, download media, verify signature
scripts/
  smoke-extract.ts  try extraction on a photo or SMS from the terminal
  simulate.ts       play the shop owner against a deployment, no phone needed
tests/              posting, M-Pesa parser, and the full webhook -> confirm -> journal loop
docs/plan.md        scope, day-by-day plan, open questions
samples/            your test photos (git-ignored)
```

## Setup

```bash
pnpm install
cp .env.example .env.local      # fill in MODEL_API_KEY at least
pnpm dev                        # first run: log in and create the Convex project
```

The repo was scaffolded against an anonymous local deployment. To use your Convex account instead, run
`npx convex login` and then `pnpm dev`, and choose to create a new project.

### 1. Check that Muse Spark can read the records (do this first)

```bash
pnpm smoke:extract samples/ledger.jpg
pnpm smoke:extract "QK12AB34 Confirmed. Ksh650.00 received from JANE WANJIKU 0712345678 on 27/10/26 at 9:14 AM"
```

### 2. Connect WhatsApp

1. In [developers.facebook.com](https://developers.facebook.com), create an app and add **WhatsApp**.
   Under API Setup, copy the temporary token and the phone number ID, and add your own number as a recipient.
2. Set the Convex env vars:
   ```bash
   npx convex env set MODEL_API_KEY ...
   npx convex env set WHATSAPP_TOKEN ...
   npx convex env set WHATSAPP_PHONE_NUMBER_ID ...
   npx convex env set WHATSAPP_VERIFY_TOKEN some-random-string
   npx convex env set WHATSAPP_APP_SECRET ...      # App settings > Basic
   ```
3. WhatsApp > Configuration > Webhook: the callback URL is `<CONVEX_SITE_URL>/whatsapp` (the `.convex.site`
   URL, not `.convex.cloud`). Use the same verify token, then subscribe to **messages**.
4. Send the test number a photo of a receipt.

The temporary token expires after 24 hours. Before the demo, create a System User token in Business Settings.

## Without a phone or model key

Set `WHATSAPP_DRY_RUN=1` (replies go to the `outbox` table, not Meta) and `EXTRACT_STUB=1` (photos and
non-M-Pesa text return fixed entries) on the deployment, and put the same `WHATSAPP_APP_SECRET` in `.env.local`. Then:

```bash
pnpm simulate "TJM1QRS3TU Confirmed. Ksh2,500.00 sent to JOHN KAMAU 0722000000 on 27/10/26 at 10:02 AM. ..."
pnpm simulate confirm
pnpm simulate photo     # a fake photo, answered by the stub
```

## Scripts

| Command | What it does |
| --- | --- |
| `pnpm dev` | Run Convex dev: pushes functions on save |
| `pnpm typecheck` | Type-check `convex/` |
| `pnpm test` | Unit tests and the end-to-end WhatsApp loop (convex-test) |
| `pnpm smoke:extract <file or text>` | Run extraction once, outside WhatsApp |
| `pnpm simulate <text \| confirm \| reject \| photo>` | Send a signed fake webhook and print the replies |
| `pnpm deploy` | Deploy to Convex production |
