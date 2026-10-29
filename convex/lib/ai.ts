import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { openFetch } from "./space";

type Env = Record<string, string | undefined>;

// MODEL_PROVIDER=meta (default) uses the Meta Model API and Muse Spark for everything.
// MODEL_PROVIDER=compat points at any OpenAI-compatible host (e.g. Llama open weights on a partner),
// which must then name its base URL and models.
// MODEL_PROVIDER=open runs Meta open weights with no Meta key and no card: Muse Glimmer 30B on a free Hugging Face
// ZeroGPU Space (HF_TOKEN), then Llama on our own machine (MODEL_FALLBACK_URL) when the Space is out of quota.
// See ./space.
export function modelConfig(env: Env = process.env) {
  const provider = env.MODEL_PROVIDER ?? "meta";
  if (provider === "open") {
    return {
      provider,
      baseURL: "https://open.invalid/v1", // never fetched: openFetch picks the host
      apiKey: undefined,
      visionModel: "muse-glimmer-30b",
      textModel: "muse-glimmer-30b",
      audioModel: undefined,
      structured: true, // the schema goes into the prompt (./space)
    };
  }
  if (provider !== "meta" && provider !== "compat") throw new Error(`Unknown MODEL_PROVIDER: ${provider}`);
  const fallback = provider === "meta";
  const pick = (name: string, metaDefault: string) => {
    const value = env[name] ?? (fallback ? metaDefault : undefined);
    if (!value) throw new Error(`${name} must be set when MODEL_PROVIDER=compat`);
    return value;
  };
  return {
    provider,
    // Meta Model API speaks the OpenAI Chat Completions format. https://dev.meta.ai/docs/protocols/chat-completions
    baseURL: pick("MODEL_BASE_URL", "https://api.meta.ai/v1"),
    apiKey: env.MODEL_API_KEY,
    // 1.3 is Meta's pick for new work. Its audio input is marked degraded, so voice notes go to 1.2.
    visionModel: pick("VISION_MODEL", "muse-spark-1.3"),
    textModel: pick("TEXT_MODEL", "muse-spark-1.3"),
    audioModel: env.AUDIO_MODEL ?? (fallback ? "muse-spark-1.2" : undefined),
    // Set MODEL_STRUCTURED=0 if the host rejects response_format json_schema; the SDK then falls back to JSON mode.
    structured: env.MODEL_STRUCTURED !== "0",
  };
}

// The one switch. With a model key (Meta Model API, or MODEL_PROVIDER=compat for Llama on a partner host), or
// MODEL_PROVIDER=open with an HF token or a fallback host (Meta open weights), every
// model path is live: photo and text extraction, the ask agent, free-text corrections. Without one, stubs and the
// exact parsers run the whole loop. MODEL_STUB=1 forces the stubs even with a key (a fallback during a live demo).
export function modelsLive(env: Env = process.env) {
  const keyed = env.MODEL_PROVIDER === "open" ? !!(env.HF_TOKEN || env.MODEL_FALLBACK_URL) : !!env.MODEL_API_KEY;
  return keyed && env.MODEL_STUB !== "1";
}

// Live on the Meta Model API itself, so the Meta-only surfaces (SAM 3.1, audio input) are there too.
export function metaLive(env: Env = process.env) {
  return modelsLive(env) && modelConfig(env).provider === "meta";
}

// Meta-only request fields, under the provider's name so a compat host never sees them. Muse Spark always reasons:
// "low" keeps WhatsApp replies quick, "medium" for reading handwriting. A stable prompt_cache_key per task routes
// requests that share the system prompt together, so its prefix is billed at the cached rate.
export function metaOptions(task: "extract" | "ask" | "correct" | "transcribe", reasoningEffort: "low" | "medium") {
  return { meta: { reasoningEffort, prompt_cache_key: `duka-${task}` } };
}

function provider() {
  const config = modelConfig();
  return {
    config,
    models: createOpenAICompatible({
      name: config.provider,
      baseURL: config.baseURL,
      apiKey: config.apiKey,
      supportsStructuredOutputs: config.structured,
      ...(config.provider === "open" ? { fetch: openFetch() } : {}),
    }),
  };
}

export function visionModel() {
  const { config, models } = provider();
  return models(config.visionModel);
}

export function textModel() {
  const { config, models } = provider();
  return models(config.textModel);
}

export function audioModel() {
  const { config, models } = provider();
  if (!config.audioModel) throw new Error(`AUDIO_MODEL must be set when MODEL_PROVIDER=${config.provider}`);
  return models(config.audioModel);
}
