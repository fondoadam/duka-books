// Films demo/player.html (replaying demo/out/run.js from `pnpm demo:run`) in the installed Chrome and writes
// demo/out/duka-books-demo.mp4 at 1920x1080.
//   pnpm demo:video
import { execFileSync } from "node:child_process";
import { existsSync, renameSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright-core";

if (!existsSync("demo/out/run.js")) {
  console.error("No demo/out/run.js yet. Run `pnpm demo:run --ledger <photo>` first.");
  process.exit(1);
}

const size = { width: 1920, height: 1080 };
const browser = await chromium.launch({ channel: "chrome" });
const context = await browser.newContext({ viewport: size, recordVideo: { dir: "demo/out/raw", size } });
const page = await context.newPage();
const started = Date.now();
await page.goto(`file://${resolve("demo/player.html")}`);
await page.waitForFunction(() => (window as unknown as { DEMO_DONE?: boolean }).DEMO_DONE === true, null, { timeout: 300_000, polling: 500 });
const raw = await page.video()!.path();
await context.close();
await browser.close();
console.log(`Replay took ${Math.round((Date.now() - started) / 1000)} s`);

renameSync(raw, "demo/out/raw.webm");
rmSync("demo/out/raw", { recursive: true, force: true });
execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", "demo/out/raw.webm", "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-pix_fmt", "yuv420p", "-r", "30", "-movflags", "+faststart", "demo/out/duka-books-demo.mp4"], { stdio: "inherit" });
console.log("Saved demo/out/duka-books-demo.mp4");
