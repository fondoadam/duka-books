import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

// Meta Model API speaks the OpenAI Chat Completions format. https://ai.developer.meta.com/docs/
export function muse() {
  const meta = createOpenAICompatible({
    name: "meta",
    baseURL: process.env.META_API_BASE ?? "https://api.meta.ai/v1",
    apiKey: process.env.MODEL_API_KEY,
    // Flip to false if the API rejects response_format json_schema; the SDK then falls back to JSON mode.
    supportsStructuredOutputs: true,
  });
  return meta(process.env.MUSE_MODEL ?? "muse-spark-1.1");
}
