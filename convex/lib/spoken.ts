import type { Extraction } from "./extract";

// Exact reader for the simplest spoken (or typed) records: "Nimeuza mkate tatu kwa shilingi mia moja hamsini".
// Like the M-Pesa parser it only answers when it is certain; anything else (several items, prices per unit,
// names) returns null and goes to the model.

const UNITS: Record<string, number> = { moja: 1, mbili: 2, tatu: 3, nne: 4, tano: 5, sita: 6, saba: 7, nane: 8, tisa: 9 };
const TENS: Record<string, number> = {
  kumi: 10, ishirini: 20, thelathini: 30, arobaini: 40, hamsini: 50, sitini: 60, sabini: 70, themanini: 80, tisini: 90,
};

// Below 1000: [mia [unit]] [tens] [na] [unit]. Returns null if any word is left over.
function below1000(words: string[]): number | null {
  let i = 0;
  let n = 0;
  const skipNa = () => {
    if (words[i] === "na") i++;
  };
  if (words[i] === "mia") {
    i++;
    const hundreds = UNITS[words[i]] ?? 1;
    if (UNITS[words[i]]) i++;
    n += hundreds * 100;
    skipNa();
  }
  if (TENS[words[i]]) n += TENS[words[i++]];
  skipNa();
  if (UNITS[words[i]]) n += UNITS[words[i++]];
  return i === words.length && n > 0 ? n : null;
}

// "elfu mbili mia tano" = 2500. Digits ("1,250") pass straight through.
export function swahiliNumber(text: string): number | null {
  const t = text.trim().toLowerCase();
  if (/^\d[\d,]*(\.\d+)?$/.test(t)) return Number(t.replace(/,/g, ""));
  const words = t.split(/\s+/).filter(Boolean);
  if (words.length === 0) return null;
  if (words[0] !== "elfu") return below1000(words);
  // "elfu <n>" = n thousand; the multiplier runs until "mia" (or "na mia").
  const rest = words.slice(1);
  let end = rest.indexOf("mia");
  if (end === -1) end = rest.length;
  const multiplierWords = rest.slice(0, end);
  if (multiplierWords.at(-1) === "na") multiplierWords.pop(); // "elfu mbili na mia tano"
  const thousands = multiplierWords.length === 0 ? 1 : below1000(multiplierWords);
  if (thousands === null) return null;
  const remainder = rest.slice(end);
  const tail = remainder.length === 0 ? 0 : below1000(remainder);
  return tail === null ? null : thousands * 1000 + tail;
}

const NUMBER_WORDS = /^(mia|elfu|na|moja|mbili|tatu|nne|tano|sita|saba|nane|tisa|kumi|ishirini|thelathini|arobaini|hamsini|sitini|sabini|themanini|tisini)$/;

// An amount spelled in Swahili words ("mia nne hamsini") read exactly, when the message holds exactly one. Small
// models misread these (450 came back as 440, or 4,500), so callers let the exact reading win over the model's.
export function spokenAmount(text: string): number | null {
  const runs: string[][] = [[]];
  for (const w of text.toLowerCase().split(/[^a-z]+/)) {
    if (NUMBER_WORDS.test(w)) runs.at(-1)!.push(w);
    else if (runs.at(-1)!.length) runs.push([]);
  }
  const values = runs
    .map((r) => (r.at(-1) === "na" ? r.slice(0, -1) : r))
    .filter((r) => r.length && r[0] !== "na")
    .map((r) => swahiliNumber(r.join(" ")));
  return values.length === 1 && values[0] !== null ? values[0] : null;
}

const VERBS: Record<string, "sale" | "purchase" | "expense"> = {
  uza: "sale",
  nunua: "purchase",
  tumia: "expense",
  lipa: "expense",
  lipia: "expense",
};

const SPOKEN = new RegExp(
  "^nime(uza|nunua|tumia|lipia|lipa)\\s+(.+?)\\s+kwa\\s+(?:shilingi\\s+|sh\\.?\\s+|ksh\\.?\\s*|kes\\s+|bob\\s+)?(.+?)" +
    "(?:\\s+(?:kwa\\s+)?(m-?pesa|cash|taslimu|deni))?$",
);

export function parseSpoken(text: string, today: string): Extraction | null {
  const t = text.trim().toLowerCase().replace(/[.!]+$/, "");
  const m = t.match(SPOKEN);
  if (!m) return null;
  const amountKes = swahiliNumber(m[3]);
  if (amountKes === null) return null;

  // "mkate tatu" = 3 loaves; the item itself must be plain words.
  const item = m[2].split(/\s+/);
  const last = item.length > 1 ? swahiliNumber(item.at(-1)!) : null;
  const name = (last === null ? item : item.slice(0, -1)).join(" ");
  if (!/^[\p{L}\s-]+$/u.test(name)) return null;

  const method = !m[4] ? "cash" : m[4] === "deni" ? "credit" : m[4].includes("pesa") ? "mpesa" : "cash";
  return {
    entries: [
      {
        date: today,
        description: name.charAt(0).toUpperCase() + name.slice(1),
        quantity: last,
        amountKes,
        kind: VERBS[m[1]],
        method,
        counterparty: null,
        ref: null,
      },
    ],
    confidence: 1,
    notes: null,
  };
}
