import { generateText, stepCountIs, tool, type LanguageModel } from "ai";
import { z } from "zod";
import { kes } from "./money";
import { PERIODS, type Period } from "./periods";

// Answers the owner's questions about their books. Numbers come only from tools: the model picks the tools and
// words the answer, and a reply with any figure the tools didn't return is swapped for a template.

export type Totals = {
  salesCents: number;
  purchasesCents: number;
  expensesCents: number;
  profitCents: number;
  cashCents: number;
  mpesaCents: number;
};
export type AskTools = {
  totals(period: Period): Promise<Totals>;
  debtors(): Promise<{ name: string; owedCents: number }[]>;
  loans(): Promise<{ owedCents: number }>;
};

type Topic = "profit" | "sales" | "expenses" | "debtors" | "loans";

const LABEL: Record<Period, string> = {
  today: "leo",
  yesterday: "jana",
  this_week: "wiki hii",
  last_week: "wiki iliyopita",
  this_month: "mwezi huu",
  last_month: "mwezi uliopita",
};

const QUESTION_WORDS = /^(je|nani|nini|lini|wapi|vipi|kiasi|mbona|kwa nini|how|what|who|when|which)\b/i;

export function isQuestion(text: string) {
  const t = text.trim();
  return t.endsWith("?") || QUESTION_WORDS.test(t) || /\bngapi\b/i.test(t);
}

// The no-key path, and the fallback when the model fails. Order matters: "deni la Fuliza" is about Fuliza.
export function route(question: string): { topic: Topic; period: Period } {
  const q = question.toLowerCase();
  const has = (re: RegExp) => re.test(q);
  const period: Period = has(/wiki (iliyopita|jana|ya jana)|last week/)
    ? "last_week"
    : has(/mwezi (uliopita|jana|wa jana)|last month/)
      ? "last_month"
      : has(/wiki|week/)
        ? "this_week"
        : has(/mwezi|month/)
          ? "this_month"
          : has(/jana|yesterday/)
            ? "yesterday"
            : "today";
  const topic: Topic = has(/fuliza/)
    ? "loans"
    : has(/anadai|wanadai|ananidai|wananidai|deni|madeni|debt|owe/)
      ? "debtors"
      : has(/mauzo|nimeuza|sales/)
        ? "sales"
        : has(/matumizi|gharama|nimetumia|expense|spent/)
          ? "expenses"
          : "profit";
  return { topic, period };
}

const templates = {
  profit: (t: Totals, p: Period) =>
    `Faida ${LABEL[p]}: ${kes(t.profitCents)}\nMauzo ${kes(t.salesCents)}, manunuzi ${kes(t.purchasesCents)}, matumizi ${kes(t.expensesCents)}.`,
  sales: (t: Totals, p: Period) => `Mauzo ${LABEL[p]}: ${kes(t.salesCents)}`,
  expenses: (t: Totals, p: Period) => `Matumizi ${LABEL[p]}: ${kes(t.expensesCents)}, na manunuzi ya bidhaa ${kes(t.purchasesCents)}.`,
  debtors: (list: { name: string; owedCents: number }[]) =>
    list.length === 0
      ? "Hakuna mteja anayedaiwa kwa sasa."
      : [
          "Wateja wanaodaiwa:",
          ...list.map((d, i) => `${i + 1}. ${d.name}: ${kes(d.owedCents)}`),
          `Jumla: ${kes(list.reduce((sum, d) => sum + d.owedCents, 0))}`,
        ].join("\n"),
  loans: ({ owedCents }: { owedCents: number }) =>
    owedCents > 0 ? `Deni lako la Fuliza ni ${kes(owedCents)}.` : "Huna deni la Fuliza.",
};

async function routed(question: string, tools: AskTools) {
  const { topic, period } = route(question);
  if (topic === "debtors") return templates.debtors(await tools.debtors());
  if (topic === "loans") return templates.loans(await tools.loans());
  return templates[topic](await tools.totals(period), period);
}

const numbers = (text: string) =>
  [...text.matchAll(/\d[\d,]*(?:\.\d+)?/g)].map((m) => Math.abs(Number(m[0].replace(/,/g, ""))));

// True when every number in the reply appears in some tool result. List numbering ("1. ") is not a figure.
export function checkFigures(reply: string, toolResults: unknown[]) {
  const allowed = new Set(numbers(JSON.stringify(toolResults)));
  return numbers(reply.replace(/^\s*\d+\.\s/gm, "")).every((n) => allowed.has(n));
}

const SYSTEM = `Wewe ni mhasibu wa duka dogo Kenya. Jibu swali la mwenye duka kwa Kiswahili rahisi, sentensi 1 hadi 3.
Tumia zana (tools) kupata kila namba. Usihesabu wala usibuni namba yoyote: andika namba kama zana zilivyozirudisha.
Kama zana haziwezi kujibu swali, sema hivyo.`;

// With a model: it chooses tools and words the reply. Tool outputs are already formatted as KES so the model
// never converts or adds. Without one (no key, or the call fails): the keyword router answers.
export async function answer(question: string, tools: AskTools, model?: LanguageModel): Promise<string> {
  if (!model) return routed(question, tools);

  const calls: { output: object; template: string }[] = [];
  const record = (output: object, template: string) => {
    calls.push({ output, template });
    return output;
  };
  try {
    const { text } = await generateText({
      model,
      system: SYSTEM,
      prompt: `<swali>${question}</swali>`,
      stopWhen: stepCountIs(4),
      tools: {
        get_totals: tool({
          description: "Mauzo, manunuzi, matumizi na faida kwa kipindi kimoja",
          inputSchema: z.object({ period: z.enum(PERIODS) }),
          execute: async ({ period }) => {
            const t = await tools.totals(period);
            return record(
              {
                period: LABEL[period],
                profit: kes(t.profitCents),
                sales: kes(t.salesCents),
                purchases: kes(t.purchasesCents),
                expenses: kes(t.expensesCents),
                cash_in: kes(t.cashCents),
                mpesa_in: kes(t.mpesaCents),
              },
              templates.profit(t, period),
            );
          },
        }),
        get_debtors: tool({
          description: "Wateja wanaodaiwa na duka, mkubwa kwanza",
          inputSchema: z.object({}),
          execute: async () => {
            const list = await tools.debtors();
            return record({ debtors: list.map((d) => ({ name: d.name, owed: kes(d.owedCents) })) }, templates.debtors(list));
          },
        }),
        get_fuliza_balance: tool({
          description: "Deni la Fuliza (M-Pesa overdraft) ambalo duka bado linadaiwa",
          inputSchema: z.object({}),
          execute: async () => {
            const loans = await tools.loans();
            return record({ fuliza_owed: kes(loans.owedCents) }, templates.loans(loans));
          },
        }),
      },
    });
    if (text.trim() && checkFigures(text, calls.map((c) => c.output))) return text.trim();
    return calls.at(-1)?.template ?? (await routed(question, tools));
  } catch (err) {
    console.error("ask: model failed, using the keyword router", err);
    return routed(question, tools);
  }
}
