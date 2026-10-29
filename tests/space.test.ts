import { afterEach, describe, expect, it, vi } from "vitest";
import { cutJson, openFetch, toChoice, toTurns, type ChatRequest } from "../convex/lib/space";

const tools: ChatRequest["tools"] = [{ type: "function", function: { name: "get_debtors", description: "Wateja wanaodaiwa", parameters: { type: "object" } } }];

describe("toTurns", () => {
  it("folds the schema into the system prompt and keeps images on the user turn", () => {
    const { system, turns } = toTurns({
      model: "m",
      messages: [
        { role: "system", content: "Read the ledger." },
        { role: "user", content: [{ type: "text", text: "Extract." }, { type: "image_url", image_url: { url: "data:image/jpeg;base64,AA==" } }] },
      ],
      response_format: { type: "json_schema", json_schema: { schema: { type: "object", properties: { entries: {} } } } },
    });
    expect(system).toContain("Read the ledger.");
    expect(system).toContain('"entries"');
    expect(turns).toEqual([{ role: "user", text: "Extract.", images: ["data:image/jpeg;base64,AA=="] }]);
  });

  it("turns a tool call and its result into an assistant turn and a user turn", () => {
    const { system, turns } = toTurns({
      model: "m",
      tools,
      messages: [
        { role: "user", content: "Nani ananidai?" },
        { role: "assistant", content: null, tool_calls: [{ id: "c1", type: "function", function: { name: "get_debtors", arguments: "{}" } }] },
        { role: "tool", tool_call_id: "c1", content: '{"debtors":[{"name":"Mama Njeri","owed":"KES 250"}]}' },
      ],
    });
    expect(system).toContain("get_debtors");
    expect(turns.map((t) => t.role)).toEqual(["user", "assistant", "user"]);
    expect(turns[1].text).toBe('{"tool":"get_debtors","arguments":{}}');
    expect(turns[2].text).toContain("Tool result (get_debtors)");
  });
});

describe("cutJson and toChoice", () => {
  it("cuts JSON out of fences and prose", () => {
    expect(cutJson('Here:\n```json\n{"a":1}\n```')).toBe('{"a":1}');
    expect(cutJson("no json here")).toBeNull();
  });

  it("reads a known tool request as a tool call, and anything else as text", () => {
    const call = toChoice({ model: "m", messages: [], tools }, '{"tool": "get_debtors", "arguments": {}}');
    expect(call.finish_reason).toBe("tool_calls");
    expect(call.message).toMatchObject({ tool_calls: [{ function: { name: "get_debtors", arguments: "{}" } }] });
    expect(toChoice({ model: "m", messages: [], tools }, "Mama Njeri anadaiwa KES 250.")).toMatchObject({ finish_reason: "stop", message: { content: "Mama Njeri anadaiwa KES 250." } });
  });
});

describe("openFetch", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("falls back to the own-machine host when the Space is out of quota", async () => {
    const fetchMock = vi.fn(async (url: string | URL) => {
      const u = String(url);
      if (u.endsWith("/gradio_api/call/chat")) return Response.json({ event_id: "e1" });
      if (u.includes("/gradio_api/call/chat/e1")) return new Response('event: error\ndata: {"title": "ZeroGPU quota exceeded"}\n\n');
      if (u === "https://mac.example/v1/chat/completions") return Response.json({ choices: [{ message: { content: '```json\n{"line":2}\n```' } }] });
      return new Response("unexpected", { status: 500 });
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const res = await openFetch({ HF_TOKEN: "hf", MODEL_FALLBACK_URL: "https://mac.example/v1", MODEL_FALLBACK_KEY: "k" })("x", {
      body: JSON.stringify({ model: "m", messages: [{ role: "user", content: "fix" }], response_format: { type: "json_object" } }),
    });
    const body = (await res.json()) as { model: string; choices: { message: { content: string } }[] };
    expect(body.model).toBe("llama3.2-vision:11b");
    expect(body.choices[0].message.content).toBe('{"line":2}');
    const sent = fetchMock.mock.calls.find(([u]) => String(u).startsWith("https://mac.example"))!;
    expect((sent[1] as RequestInit).headers).toMatchObject({ Authorization: "Bearer k" });
  });

  it("says so when nothing is configured", async () => {
    await expect(openFetch({ MODEL_SPACE: "off" })("x", { body: JSON.stringify({ model: "m", messages: [{ role: "user", content: "hi" }] }) })).rejects.toThrow("No open-weights model answered");
  });
});
