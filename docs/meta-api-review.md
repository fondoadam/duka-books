# Meta Model API: what it supports, and what changed in Duka Books

Read Oct 29 from the developer docs at https://dev.meta.ai/docs (overview, models, pricing and rate limits, chat
completions, structured output, image understanding, speech-to-text, file handling, tool calling, reasoning,
prompt caching, error handling, SAM pages). Nothing here could be run against the real API yet: there is no key.
Every request shape below is pinned by a test that checks the exact body we send.

## What the API offers (the parts that matter to us)

| Area | What the docs say | What it means for us |
| --- | --- | --- |
| Models | `muse-spark-1.3` (recommended for new work), `1.2`, `1.1`; `muse-wonder-1.0` (preview, 3x the price); `muse-voice-transcribe-1.0`; `sam-3.1`; `muse-image-1.0` | We defaulted to 1.1. Now 1.3 |
| Protocols | Chat Completions (OpenAI-compatible), Responses, Messages (Anthropic-compatible); base `https://api.meta.ai/v1`, `Authorization: Bearer` | Our AI SDK client (`@ai-sdk/openai-compatible`) is right |
| Structured output | `response_format: json_schema` works. Output is always constrained to the schema. With `strict: true` the schema must be the strict subset: every object `additionalProperties: false`, every key `required`, no `oneOf`/`allOf`, `anyOf` only below the root | The SDK sends `strict: true`. Our Zod schemas already fit (nullable, never optional). Open question in `plan.md` answered: no `MODEL_STRUCTURED=0` needed |
| Rejected params (HTTP 400) | `stop`, `n > 1`, `logprobs`, `seed`, `modalities`, `audio`, `verbosity`, `logit_bias`, penalties; `tool_choice` other than `auto`; `reasoning_effort: "none"` | We send none of them (asserted in `tests/extract.test.ts`). `temperature` is left at Meta's tuned default |
| Reasoning | Muse Spark always reasons. `reasoning_effort` `minimal` to `xhigh` (`max` on 1.3); reasoning tokens are billed as output | We now send `medium` for reading handwriting, `low` for the agent, corrections and transcription, to keep WhatsApp replies quick |
| Images | `image_url` with a base64 data URL; JPEG/PNG/WebP/GIF; 50 MB per image; 50 images per request; ~1,300–1,500 tokens for a 1280 px photo | Fine as is. A WhatsApp photo costs roughly $0.002 to read |
| Audio into Muse Spark | Chat Completions `input_audio`, **WAV or MP3 only**. 1.3's audio is "not fully supported, quality may be degraded"; 1.2 is recommended for audio | **New voice path**, see below |
| Muse Voice Transcribe | `POST /v1/asr/transcribe`, WAV only, 25 languages. **Swahili is not one of them** (`languageBias` is only a hint) | Not used. Muse Spark transcribes instead |
| SAM 3.1 | `POST /v1/responses`, model `sam-3.1`, `input_text` (one short noun phrase) + `input_image` (URL or base64). Output: text tokens `<|box;x1;y1;x2;y2;w;h;c|>` in source pixels, plus a base85 mask token. `metadata.include_confidence: "true"` adds `c`. $2.50 per 1,000 images | **New SAM path**, see below. Boxes come directly, so there are no masks to decode |
| Tools | `tools` + `tool_choice: auto` only; parallel calls on by default; results as `tool` messages with `tool_call_id` | The ask agent (AI SDK `tool()`) already matches |
| Prompt caching | Automatic prefix caching; stable content first; optional `prompt_cache_key` (one per use case, not per user) | Our system prompts come first and the date is in the user message. We now send `prompt_cache_key: duka-<task>` |
| Errors | 429 (`Retry-After`), 500, 503 retryable; 504 not; 400 `content_policy_violation` for media | The AI SDK retries twice with backoff. A SAM failure reads the photo whole instead of failing |
| Price and limits | Muse Spark $1.25 in / $4.25 out per M tokens; 3,000 RPM. **Contributor** models (`-contributor`) cost ~10x less but Meta may train on the content | We stay on Standard: these are a shop owner's books. The $150 credit covers tens of thousands of photos |
| PDF input | Muse Spark accepts PDFs (`file` block) | Possible later: M-Pesa statements are PDFs (password-protected, so it needs a password flow). Not built |

## What changed

1. **Muse Spark 1.3 by default** (`VISION_MODEL`/`TEXT_MODEL` still override it). `convex/lib/ai.ts`.
2. **Reasoning effort and cache key per task** through `metaOptions()` in `convex/lib/ai.ts`. They are keyed to the
   `meta` provider, so a Llama compat host never receives them.
3. **Voice notes on Muse Spark audio** (`ASR_PROVIDER=meta`, the default once the Meta key is live):
   `convex/lib/audio.ts` decodes WhatsApp's Ogg/Opus with WebAssembly (`ogg-opus-decoder`), mixes it to mono,
   resamples it to 16 kHz and wraps it as WAV. `muse-spark-1.2` (`AUDIO_MODEL`) is asked for a verbatim transcript.
   Tested in Convex's real runtime (a 1.5 s Opus clip came out as 1.5 s of WAV). Swahili quality is unknown until
   there is a key. If it is poor, the Omnilingual ASR route (`ASR_PROVIDER=compat`, `infra/modal_app.py`) is still there.
4. **SAM 3.1 on the Meta API** (`SEGMENT_PROVIDER=meta`, the default once the Meta key is live): one call per
   photo. It reads the box tokens, drops matches below `SEGMENT_THRESHOLD` confidence (0.25), then the same crop,
   annotate and group steps run.
5. Explicit env vars still win. The dev deployment has `SEGMENT_PROVIDER=hf-space` set, so it keeps the free
   Hugging Face Space until you change it.

## Your steps on key day (adds to roadmap Phase 7)

1. `npx convex env set MODEL_API_KEY ...`. That turns on extraction, the agent, corrections **and voice**.
2. Switch SAM to Meta's own API: `npx convex env set SEGMENT_PROVIDER meta`. Or keep `hf-space`, which is free.
   Meta's is the stronger story for judging ("all on the Meta Model API") and costs $0.0025 a photo.
3. From the phone, send a Swahili voice note ("nimeuza sukari kilo mbili kwa mia mbili") and check the
   "Nimesikia" echo. If it mangles Swahili, try `npx convex env set AUDIO_MODEL muse-spark-1.3`, or fall back to
   Omnilingual ASR (roadmap Phase 5).
4. Send three receipts captioned *risiti*. If a receipt is missed, lower `SEGMENT_THRESHOLD` (for example 0.15).
