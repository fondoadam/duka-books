// Day-1 check: can Muse Spark read a real duka ledger photo or an M-Pesa SMS?
//   pnpm smoke:extract samples/ledger.jpg
//   pnpm smoke:extract "QK12AB34 Confirmed. Ksh650.00 received from JANE W..."
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { extname } from "node:path";
import { extractFromImage, extractFromText } from "../convex/lib/extract";

const input = process.argv[2];
if (!input) {
  console.error("Usage: pnpm smoke:extract <image path | text>");
  process.exit(1);
}

const today = new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Nairobi" });
const types: Record<string, string> = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" };

const started = Date.now();
const result = existsSync(input)
  ? await extractFromImage(new Uint8Array(await readFile(input)), types[extname(input).toLowerCase()] ?? "image/jpeg", today)
  : await extractFromText(input, today);

console.log(JSON.stringify(result, null, 2));
console.log(`\n${result.entries.length} entries, confidence ${result.confidence}, ${Date.now() - started} ms`);
