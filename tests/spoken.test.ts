import { readFileSync } from "node:fs";
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

describe("transcribe with Muse Spark audio", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("is the default once the Meta key is live: Opus is decoded to 16 kHz WAV and sent as input_audio", async () => {
    vi.stubEnv("MODEL_API_KEY", "k");
    const voice = new Uint8Array(readFileSync(new URL("./fixtures/voice.ogg", import.meta.url)));
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({
        id: "c1", object: "chat.completion", created: 0, model: "muse-spark-1.2",
        choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: ' "Nimeuza sukari kilo mbili kwa mia mbili" ' } }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      }),
    );
    expect(await transcribe(voice, "audio/ogg; codecs=opus")).toBe("Nimeuza sukari kilo mbili kwa mia mbili");
    const body = JSON.parse(String(fetchSpy.mock.calls[0][1]!.body));
    expect(body).toMatchObject({ model: "muse-spark-1.2", reasoning_effort: "low" });
    const part = body.messages[1].content[0];
    expect(part.type).toBe("input_audio");
    expect(part.input_audio.format).toBe("wav");
    const wav = Uint8Array.from(atob(part.input_audio.data), (c) => c.charCodeAt(0));
    const v = new DataView(wav.buffer);
    expect(new TextDecoder().decode(wav.slice(0, 4))).toBe("RIFF");
    expect(v.getUint32(24, true)).toBe(16000);
    expect(v.getUint16(22, true)).toBe(1);
    // 1.5 s of audio at 16 kHz, 16-bit
    expect(Math.abs(v.getUint32(40, true) / 2 / 16000 - 1.5)).toBeLessThan(0.05);
  });
});
