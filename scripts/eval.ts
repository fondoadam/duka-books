// Extraction eval over real records. For every samples/expected/<name>.json (not starting with "_"), reads
// samples/<file> with the live model and compares it to the answer key. Re-run after every prompt change.
//   pnpm eval                 all samples
//   pnpm eval ledger-1        one sample
// Needs MODEL_API_KEY (and MODEL_PROVIDER etc. for the Llama fallback) in .env.local.
import { readFile, readdir } from "node:fs/promises";
import { extname, join } from "node:path";
import { modelsLive } from "../convex/lib/ai";
import { extractFromImage, extractFromText } from "../convex/lib/extract";
import { score, type Expected } from "./score";

if (!modelsLive()) {
  console.error("pnpm eval needs a live model: set MODEL_API_KEY in .env.local (and unset MODEL_STUB).");
  process.exit(1);
}

const dir = "samples";
const only = process.argv[2];
const keys = (await readdir(join(dir, "expected"))).filter((f) => f.endsWith(".json") && !f.startsWith("_") && (!only || f.startsWith(only)));
if (keys.length === 0) {
  console.error("No answer keys in samples/expected/. See samples/README.md.");
  process.exit(1);
}

const types: Record<string, string> = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" };
const today = new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Nairobi" });
let perfect = 0;
let lines = 0;
let found = 0;
for (const key of keys) {
  const want = JSON.parse(await readFile(join(dir, "expected", key), "utf8")) as Expected;
  const path = join(dir, want.file);
  const started = Date.now();
  const ext = extname(path).toLowerCase();
  const out = types[ext]
    ? await extractFromImage(new Uint8Array(await readFile(path)), types[ext], today)
    : await extractFromText(await readFile(path, "utf8"), today);
  const s = score(want.entries, out.entries);
  perfect += s.allAmountsRight ? 1 : 0;
  lines += s.expected;
  found += s.matched;
  console.log(
    `${s.allAmountsRight ? "✅" : "❌"} ${want.file}: ${s.matched}/${s.expected} lines, ${s.extra.length} extra, ` +
      `kinds ${Math.round(s.kindAccuracy * 100)}%, ${Date.now() - started} ms`,
  );
  for (const m of s.missed) console.log(`     missed: ${m.description} ${m.amountKes}`);
  for (const e of s.extra) console.log(`     extra:  ${e.description} ${e.amountKes} (${e.kind})`);
  if (out.notes) console.log(`     notes:  ${out.notes}`);
}
console.log(`\n${perfect}/${keys.length} samples with every amount right; line recall ${found}/${lines}.`);
console.log(perfect >= Math.ceil(keys.length * 0.8) ? "PASS (target: 8 of 10)" : "Below target (8 of 10): tune the prompt in convex/lib/extract.ts.");
