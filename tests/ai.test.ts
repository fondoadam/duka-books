import { describe, expect, it } from "vitest";
import { modelConfig, modelsLive } from "../convex/lib/ai";

describe("modelConfig", () => {
  it("picks the meta provider and Muse Spark by default", () => {
    expect(modelConfig({ MODEL_API_KEY: "k" })).toEqual({
      provider: "meta",
      baseURL: "https://api.meta.ai/v1",
      apiKey: "k",
      visionModel: "muse-spark-1.3",
      textModel: "muse-spark-1.3",
      audioModel: "muse-spark-1.2",
      structured: true,
    });
  });

  it("uses the compat base URL and models when set", () => {
    const config = modelConfig({
      MODEL_PROVIDER: "compat",
      MODEL_BASE_URL: "https://host.example/v1",
      VISION_MODEL: "llama-vision",
      TEXT_MODEL: "llama-text",
      MODEL_STRUCTURED: "0",
    });
    expect(config).toMatchObject({
      provider: "compat",
      baseURL: "https://host.example/v1",
      visionModel: "llama-vision",
      textModel: "llama-text",
      structured: false,
    });
  });

  it("refuses compat without a base URL or models, and unknown providers", () => {
    expect(() => modelConfig({ MODEL_PROVIDER: "compat", VISION_MODEL: "a", TEXT_MODEL: "b" })).toThrow("MODEL_BASE_URL");
    expect(() => modelConfig({ MODEL_PROVIDER: "openai" })).toThrow("Unknown MODEL_PROVIDER");
  });
});

describe("modelsLive", () => {
  it("is the one switch: a key turns every model path live, MODEL_STUB=1 forces the stubs", () => {
    expect(modelsLive({})).toBe(false);
    expect(modelsLive({ EXTRACT_STUB: "1" })).toBe(false);
    expect(modelsLive({ MODEL_API_KEY: "k" })).toBe(true);
    expect(modelsLive({ MODEL_API_KEY: "k", EXTRACT_STUB: "1" })).toBe(true); // retired: ignored
    expect(modelsLive({ MODEL_API_KEY: "k", MODEL_STUB: "1" })).toBe(false);
    expect(modelsLive({ MODEL_PROVIDER: "compat", MODEL_API_KEY: "fw_k" })).toBe(true);
  });
});
