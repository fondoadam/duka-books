import { describe, expect, it } from "vitest";
import { MockLanguageModelV4 } from "ai/test";
import { answer, checkFigures, isQuestion, route, type AskTools } from "../convex/lib/ask";

const tools: AskTools = {
  totals: async () => ({ salesCents: 85000, purchasesCents: 30000, expensesCents: 5050, profitCents: 49950, cashCents: -10000, mpesaCents: 65000 }),
  debtors: async () => [{ name: "Mama Njeri", owedCents: 36000 }],
  loans: async () => ({ owedCents: 3050 }),
};

const usage = { inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 1, text: 1, reasoning: 0 } };
// A model that calls get_totals(this_week), then says `finalText`.
const model = (finalText: string) =>
  new MockLanguageModelV4({
    doGenerate: [
      { content: [{ type: "tool-call", toolCallId: "1", toolName: "get_totals", input: '{"period":"this_week"}' }], finishReason: { unified: "tool-calls", raw: undefined }, usage, warnings: [] },
      { content: [{ type: "text", text: finalText }], finishReason: { unified: "stop", raw: undefined }, usage, warnings: [] },
    ],
  });

describe("isQuestion", () => {
  it("spots questions, not records", () => {
    expect(isQuestion("nilipata faida ngapi wiki hii?")).toBe(true);
    expect(isQuestion("Nani ananidai")).toBe(true);
    expect(isQuestion("faida ni ngapi leo")).toBe(true);
    expect(isQuestion("Nimeuza unga 3 kwa 540")).toBe(false);
  });
});

describe("route", () => {
  it("reads topic and period from Swahili keywords", () => {
    expect(route("nilipata faida ngapi wiki hii?")).toEqual({ topic: "profit", period: "this_week" });
    expect(route("mauzo ya jana")).toEqual({ topic: "sales", period: "yesterday" });
    expect(route("matumizi mwezi uliopita?")).toEqual({ topic: "expenses", period: "last_month" });
    expect(route("Nani ananidai?")).toEqual({ topic: "debtors", period: "today" });
    expect(route("deni la Fuliza ni ngapi?")).toEqual({ topic: "loans", period: "today" });
  });
});

describe("checkFigures", () => {
  const results = [{ period: "wiki hii", profit: "KES 499.50", sales: "KES 1,250" }];
  it("accepts figures that came from a tool", () => {
    expect(checkFigures("Faida wiki hii ni KES 499.50 kutoka mauzo ya KES 1,250.", results)).toBe(true);
    expect(checkFigures("1. Mama Njeri: KES 1,250", results)).toBe(true);
    expect(checkFigures("Sijui bado.", results)).toBe(true);
  });
  it("rejects an invented number", () => {
    expect(checkFigures("Faida wiki hii ni KES 500.", results)).toBe(false);
    expect(checkFigures("Umepata KES 750.50 zaidi ya mauzo.", results)).toBe(false);
  });
});

describe("answer", () => {
  it("answers from the keyword router without a model", async () => {
    expect(await answer("nilipata faida ngapi wiki hii?", tools)).toBe(
      "Faida wiki hii: KES 499.50\nMauzo KES 850, manunuzi KES 300, matumizi KES 50.50.",
    );
    expect(await answer("Nani ananidai?", tools)).toBe("Wateja wanaodaiwa:\n1. Mama Njeri: KES 360");
    expect(await answer("deni la fuliza?", tools)).toBe("Deni lako la Fuliza ni KES 30.50.");
  });

  it("keeps the model's words when every figure came from a tool", async () => {
    expect(await answer("faida wiki hii?", tools, model("Wiki hii umepata faida ya KES 499.50. Hongera!"))).toBe(
      "Wiki hii umepata faida ya KES 499.50. Hongera!",
    );
  });

  it("swaps an invented figure for the template from the tool result", async () => {
    expect(await answer("faida wiki hii?", tools, model("Wiki hii umepata faida ya KES 520."))).toBe(
      "Faida wiki hii: KES 499.50\nMauzo KES 850, manunuzi KES 300, matumizi KES 50.50.",
    );
  });

  it("falls back to the router when the model fails", async () => {
    const broken = new MockLanguageModelV4({ doGenerate: async () => { throw new Error("401"); } });
    expect(await answer("mauzo wiki hii?", tools, broken)).toBe("Mauzo wiki hii: KES 850");
  });
});
