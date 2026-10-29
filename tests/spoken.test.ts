import { afterEach, describe, expect, it, vi } from "vitest";
import { parseSpoken, swahiliNumber } from "../convex/lib/spoken";
import { ASR_STUB_TEXT, transcribe } from "../convex/lib/transcribe";

describe("swahiliNumber", () => {
  it.each([
    ["tatu", 3],
    ["kumi na mbili", 12],
    ["hamsini", 50],
    ["mia moja hamsini", 150],
    ["mia tatu na ishirini", 320],
    ["mia", 100],
    ["elfu mbili mia tano", 2500],
    ["elfu moja", 1000],
    ["elfu kumi na tano", 15000],
    ["150", 150],
    ["1,250", 1250],
  ])("%s = %d", (words, n) => expect(swahiliNumber(words)).toBe(n));

  it.each(["", "unga", "mia tatu unga", "na"])("rejects %j", (words) => expect(swahiliNumber(words)).toBeNull());
});

describe("parseSpoken", () => {
  const today = "2026-10-29";
  it("reads the stub voice note as one cash sale with a quantity", () => {
    expect(parseSpoken(ASR_STUB_TEXT, today)).toEqual({
      entries: [{ date: today, description: "Mkate", quantity: 3, amountKes: 150, kind: "sale", method: "cash", counterparty: null, ref: null }],
      confidence: 1,
      notes: null,
    });
  });

  it.each([
    ["nimenunua sukari kwa elfu mbili", { description: "Sukari", quantity: null, amountKes: 2000, kind: "purchase", method: "cash" }],
    ["Nimetumia stima kwa shilingi 500 kwa mpesa", { description: "Stima", amountKes: 500, kind: "expense", method: "mpesa" }],
    ["nimeuza unga mbili kwa 240 deni", { description: "Unga", quantity: 2, amountKes: 240, kind: "sale", method: "credit" }],
    ["Nimeuza mkate 3 kwa sh 150.", { description: "Mkate", quantity: 3, amountKes: 150 }],
  ])("%s", (text, expected) => {
    expect(parseSpoken(text, today)?.entries[0]).toMatchObject(expected);
  });

  it.each(["nimeuza unga", "nilipata faida ngapi?", "nimeuza unga kwa bei nzuri", "leo nimeuza vitu vingi kwa 500 na nikanunua sukari"])(
    "leaves %j to the model",
    (text) => expect(parseSpoken(text, today)).toBeNull(),
  );
});

describe("transcribe", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("returns the stub sentence with ASR_STUB=1 or no provider", async () => {
    vi.stubEnv("ASR_STUB", "1");
    expect(await transcribe(new Uint8Array(), "audio/ogg")).toBe(ASR_STUB_TEXT);
    vi.stubEnv("ASR_STUB", "");
    expect(await transcribe(new Uint8Array(), "audio/ogg")).toBe(ASR_STUB_TEXT);
  });

  it("posts the audio to an OpenAI-compatible /audio/transcriptions host", async () => {
    vi.stubEnv("ASR_PROVIDER", "compat");
    vi.stubEnv("ASR_BASE_URL", "https://asr.example/v1");
    vi.stubEnv("ASR_MODEL", "omniASR_LLM_7B");
    vi.stubEnv("ASR_API_KEY", "k");
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ text: " Nimeuza unga " })));
    expect(await transcribe(new Uint8Array([1, 2]), "audio/ogg; codecs=opus")).toBe("Nimeuza unga");
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe("https://asr.example/v1/audio/transcriptions");
    expect((init!.headers as Record<string, string>).Authorization).toBe("Bearer k");
    const form = init!.body as FormData;
    expect(form.get("model")).toBe("omniASR_LLM_7B");
    expect(form.get("language")).toBe("sw");
    expect((form.get("file") as File).name).toBe("voice.ogg");
    fetchSpy.mockRestore();
  });
});
