import type { Infer } from "convex/values";
import type { entryKind, paymentMethod, proposedEntry } from "../schema";

// The owner fixes a proposal by replying with a line number: "2 = 450", "2 450", "futa 2", "2 deni", "2 mpesa".
// Exact rules only; free-form fixes go to the model once a key works (Phase 7).

type Entry = Infer<typeof proposedEntry>;
export type Correction = {
  line: number;
  amountKes?: number;
  method?: Infer<typeof paymentMethod>;
  kind?: Infer<typeof entryKind>;
  delete?: true;
};

const METHODS: Record<string, Correction["method"]> = {
  deni: "credit",
  mkopo: "credit",
  credit: "credit",
  mpesa: "mpesa",
  "m-pesa": "mpesa",
  cash: "cash",
  taslimu: "cash",
  pesa: "cash",
};

const KINDS: Record<string, Correction["kind"]> = {
  mauzo: "sale",
  sale: "sale",
  manunuzi: "purchase",
  purchase: "purchase",
  matumizi: "expense",
  gharama: "expense",
  expense: "expense",
};

export function parseCorrection(text: string): Correction | null {
  const t = text.trim().toLowerCase();
  const del = t.match(/^futa\s+(\d{1,2})$/);
  if (del) return Number(del[1]) > 0 ? { line: Number(del[1]), delete: true } : null;

  const m = t.match(/^(\d{1,2})(?:\s*=\s*|\s+)(.+)$/);
  if (!m || Number(m[1]) === 0) return null;
  const fix: Correction = { line: Number(m[1]) };
  for (const word of m[2].split(/\s+/)) {
    if (/^\d[\d,]*(?:\.\d+)?$/.test(word) && fix.amountKes === undefined) fix.amountKes = Number(word.replace(/,/g, ""));
    else if (METHODS[word] && !fix.method) fix.method = METHODS[word];
    else if (KINDS[word] && !fix.kind) fix.kind = KINDS[word];
    else return null; // anything unrecognised: not an exact correction
  }
  return fix;
}

export function applyCorrection(
  entries: Entry[],
  fix: Correction,
): { ok: true; entries: Entry[]; before: Entry; after: Entry | null } | { ok: false } {
  const i = fix.line - 1;
  const before = entries[i];
  if (!before) return { ok: false };
  if (fix.delete) return { ok: true, entries: entries.filter((_, j) => j !== i), before, after: null };
  const after: Entry = {
    ...before,
    ...(fix.amountKes !== undefined && { amountCents: Math.round(fix.amountKes * 100) }),
    ...(fix.method && { method: fix.method }),
    ...(fix.kind && { kind: fix.kind }),
  };
  return { ok: true, entries: entries.map((e, j) => (j === i ? after : e)), before, after };
}
