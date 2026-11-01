import { afterEach, describe, expect, it, vi } from "vitest";
import { MockLanguageModelV4 } from "ai/test";
import { interpretCorrection } from "../convex/lib/corrections";
import { extractFromImage, extractFromText, finish, pinDates, sumCheck } from "../convex/lib/extract";

const usage = { inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 1, text: 1, reasoning: 0 } };
const replying = (json: object) =>
  new MockLanguageModelV4({
    doGenerate: async () => ({ content: [{ type: "text", text: JSON.stringify(json) }], finishReason: { unified: "stop", raw: undefined }, usage, warnings: [] }),
  });

const line = (amountKes: number, kind: "sale" | "expense" | "purchase" = "sale") => ({
  date: "2026-10-29", description: "x", quantity: null, amountKes, kind, method: "cash" as const, counterparty: null, ref: null,
});

describe("sumCheck", () => {
  it("is quiet without a written total or when the lines add up", () => {
    expect(sumCheck([line(540), line(360)], null)).toBeNull();
    expect(sumCheck([line(540), line(360)], 900)).toBeNull();
    // A page total that only counts the sales still adds up.
    expect(sumCheck([line(540), line(360), line(100, "expense")], 900)).toBeNull();
  });

  it("warns when the written total and the lines differ", () => {
    expect(sumCheck([line(540), line(360)], 1350)).toBe(
      "Jumla iliyoandikwa ni KES 1,350, lakini mistari niliyosoma inajumlisha KES 900. Huenda kuna mstari niliokosa au kusoma vibaya.",
    );
  });

  it("finish() moves the warning into notes and drops the total field", () => {
    const out = finish({ entries: [line(540)], confidence: 0.9, notes: "Mstari 3 hausomeki.", writtenTotalKes: 900 });
    expect(out).toEqual({ entries: [line(540)], confidence: 0.9, notes: expect.stringMatching(/^Mstari 3 hausomeki\. Jumla iliyoandikwa ni KES 900/) });
    expect("writtenTotalKes" in out).toBe(false);
  });

  it("finish() keeps only the first sentence of a model's notes, capped", () => {
    const chatty = "Date interpreted as 30/10 from the page. Method for items 1-5 is not written, set to unknown.";
    expect(finish({ entries: [line(540)], confidence: 0.9, notes: chatty, writtenTotalKes: null }).notes).toBe("Date interpreted as 30/10 from the page.");
    expect(finish({ entries: [line(540)], confidence: 0.9, notes: "x".repeat(400), writtenTotalKes: null }).notes).toHaveLength(160);
    expect(finish({ entries: [line(540)], confidence: 0.9, notes: "  ", writtenTotalKes: null }).notes).toBeNull();
  });
});

describe("interpretCorrection (model fallback, live only)", () => {
  const entries = [
    { date: "2026-10-29", description: "Unga", quantity: null, amountCents: 54000, kind: "sale" as const, method: "cash" as const, counterparty: null, ref: null },
    { date: "2026-10-29", description: "Sukari", quantity: null, amountCents: 36000, kind: "sale" as const, method: "cash" as const, counterparty: null, ref: null },
  ];

  it("turns free text into a correction", async () => {
    const model = replying({ line: 2, amountKes: 450, method: null, kind: null, delete: false });
    expect(await interpretCorrection("sukari ilikuwa mia nne hamsini", entries, model)).toEqual({ line: 2, amountKes: 450 });
  });

  it("returns null when the model finds no correction", async () => {
    const model = replying({ line: null, amountKes: null, method: null, kind: null, delete: false });
    expect(await interpretCorrection("habari yako", entries, model)).toBeNull();
  });

  it("maps a delete", async () => {
    const model = replying({ line: 1, amountKes: null, method: null, kind: null, delete: true });
    expect(await interpretCorrection("ondoa unga", entries, model)).toEqual({ line: 1, delete: true });
  });
});

describe("Meta Model API request", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("sends Muse Spark 1.3, a strict json_schema, medium reasoning and a cache key, with the photo inline", async () => {
    vi.stubEnv("MODEL_API_KEY", "k");
    const output = { entries: [], confidence: 1, notes: null, writtenTotalKes: null };
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({
        id: "c1", object: "chat.completion", created: 0, model: "muse-spark-1.3",
        choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: JSON.stringify(output) } }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      }),
    );
    await extractFromImage(new Uint8Array([0xff, 0xd8, 0xff]), "image/jpeg", "2026-10-29");
    const [url, init] = fetchSpy.mock.calls[0];
    expect(String(url)).toBe("https://api.meta.ai/v1/chat/completions");
    const body = JSON.parse(String(init!.body));
    expect(body).toMatchObject({ model: "muse-spark-1.3", reasoning_effort: "medium", prompt_cache_key: "duka-extract" });
    expect(body.response_format.type).toBe("json_schema");
    expect(body.response_format.json_schema.schema.additionalProperties).toBe(false);
    // Params Meta rejects with HTTP 400 are never sent.
    for (const k of ["stop", "seed", "n", "logprobs", "frequency_penalty", "presence_penalty", "temperature"]) expect(body[k]).toBeUndefined();
    expect(body.messages[1].content[1]).toEqual({ type: "image_url", image_url: { url: "data:image/jpeg;base64,/9j/" } });
  });
});

describe("extractFromText on a small model", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  const reading = (amounts: number[]) => {
    vi.stubEnv("MODEL_PROVIDER", "open");
    vi.stubEnv("MODEL_SPACE", "off");
    vi.stubEnv("MODEL_FALLBACK_URL", "https://mac.example/v1");
    const content = JSON.stringify({ entries: amounts.map((a) => ({ ...line(a), description: "sukari" })), confidence: 0.9, notes: null, writtenTotalKes: null });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ choices: [{ message: { content } }] }));
  };

  it("takes a one-line amount spelled in words from the exact reader, not the model", async () => {
    reading([4500]);
    expect((await extractFromText("sukari ilikuwa mia nne hamsini", "2026-10-29")).entries[0].amountKes).toBe(450);
  });

  it("leaves the model's amounts alone when digits are written or there are several lines", async () => {
    reading([360]);
    expect((await extractFromText("unga mbili kwa 360", "2026-10-29")).entries[0].amountKes).toBe(360);
    reading([300, 200]);
    expect((await extractFromText("unga mia tatu, sukari mia mbili", "2026-10-29")).entries.map((e) => e.amountKes)).toEqual([300, 200]);
  });
});

describe("pinDates", () => {
  const TODAY = "2026-11-01";
  const dated = (...dates: string[]) => ({ entries: dates.map((date) => ({ ...line(100), date })), confidence: 0.9, notes: null });

  it("moves a misread year-old date to today and says so", () => {
    const out = pinDates(dated("2026-01-01", "2026-01-01"), TODAY);
    expect(out.entries.map((e) => e.date)).toEqual([TODAY, TODAY]);
    expect(out.notes).toContain("leo");
  });

  it("moves a future date to today", () => {
    expect(pinDates(dated("2026-11-02"), TODAY).entries[0].date).toBe(TODAY);
  });

  it("keeps a recent page's date and adds no note", () => {
    const out = pinDates(dated("2026-10-30", TODAY, "2026-09-05"), TODAY);
    expect(out.entries.map((e) => e.date)).toEqual(["2026-10-30", TODAY, "2026-09-05"]);
    expect(out.notes).toBeNull();
  });

  it("keeps a note the model already wrote", () => {
    const out = pinDates({ ...dated("2025-11-01"), notes: "Mstari mmoja haukusomeka." }, TODAY);
    expect(out.notes).toMatch(/^Mstari mmoja haukusomeka\.\n/);
  });
});

