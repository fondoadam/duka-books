import { describe, expect, it } from "vitest";
import { modelConfig } from "../convex/lib/ai";

describe("modelConfig", () => {
  it("picks the meta provider and Muse Spark by default", () => {
    expect(modelConfig({ MODEL_API_KEY: "k" })).toEqual({
      provider: "meta",
      baseURL: "https://api.meta.ai/v1",
      apiKey: "k",
      visionModel: "muse-spark-1.1",
      textModel: "muse-spark-1.1",
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
