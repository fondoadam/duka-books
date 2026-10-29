import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

type Env = Record<string, string | undefined>;

// MODEL_PROVIDER=meta (default) uses the Meta Model API and Muse Spark for everything.
// MODEL_PROVIDER=compat points at any OpenAI-compatible host (e.g. Llama open weights on a partner),
// which must then name its base URL and models.
export function modelConfig(env: Env = process.env) {
  const provider = env.MODEL_PROVIDER ?? "meta";
  if (provider !== "meta" && provider !== "compat") throw new Error(`Unknown MODEL_PROVIDER: ${provider}`);
  const fallback = provider === "meta";
  const pick = (name: string, metaDefault: string) => {
    const value = env[name] ?? (fallback ? metaDefault : undefined);
    if (!value) throw new Error(`${name} must be set when MODEL_PROVIDER=compat`);
    return value;
  };
  return {
    provider,
    // Meta Model API speaks the OpenAI Chat Completions format. https://ai.developer.meta.com/docs/
    baseURL: pick("MODEL_BASE_URL", "https://api.meta.ai/v1"),
    apiKey: env.MODEL_API_KEY,
    visionModel: pick("VISION_MODEL", "muse-spark-1.1"),
    textModel: pick("TEXT_MODEL", "muse-spark-1.1"),
    // Set MODEL_STRUCTURED=0 if the host rejects response_format json_schema; the SDK then falls back to JSON mode.
    structured: env.MODEL_STRUCTURED !== "0",
  };
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
