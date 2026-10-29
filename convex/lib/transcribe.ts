// Voice notes to text. WhatsApp voice notes arrive as audio/ogg (Opus).
//
// ASR_PROVIDER:
//   unset or "stub"  fixed Swahili sentence (also forced by ASR_STUB=1), so the voice loop runs without a host
//   "compat"         any OpenAI-compatible POST {ASR_BASE_URL}/audio/transcriptions, e.g. Meta's Omnilingual ASR
//                    or MMS behind a small server, or a partner host. ASR_MODEL names the model; ASR_API_KEY
//                    (or MODEL_API_KEY) authenticates. Ogg/Opus is sent as is: those servers decode it.

export const ASR_STUB_TEXT = "Nimeuza mkate tatu kwa shilingi mia moja hamsini";

export const asrStubbed = () => process.env.ASR_STUB === "1" || (process.env.ASR_PROVIDER ?? "stub") === "stub";

export async function transcribe(bytes: Uint8Array, mimeType: string): Promise<string> {
  if (asrStubbed()) return ASR_STUB_TEXT;
  const provider = process.env.ASR_PROVIDER;
  if (provider !== "compat") throw new Error(`Unknown ASR_PROVIDER: ${provider}`);
  const base = process.env.ASR_BASE_URL;
  if (!base) throw new Error("ASR_BASE_URL must be set when ASR_PROVIDER=compat");

  const ext = mimeType.includes("ogg") ? "ogg" : mimeType.includes("mpeg") ? "mp3" : mimeType.includes("mp4") ? "m4a" : "wav";
  const form = new FormData();
  form.append("file", new File([new Uint8Array(bytes)], `voice.${ext}`, { type: mimeType.split(";")[0] }));
  form.append("model", process.env.ASR_MODEL ?? "omniASR_LLM_7B");
  form.append("language", "sw");
  const key = process.env.ASR_API_KEY ?? process.env.MODEL_API_KEY;
  const res = await fetch(`${base.replace(/\/$/, "")}/audio/transcriptions`, {
    method: "POST",
    headers: key ? { Authorization: `Bearer ${key}` } : {},
    body: form,
  });
  if (!res.ok) throw new Error(`Transcription failed: ${res.status} ${await res.text()}`);
  const { text } = (await res.json()) as { text: string };
  return text.trim();
}
