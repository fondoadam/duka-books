// Llama 3.2 Vision on our own Mac as the fallback model (MODEL_PROVIDER=open, see convex/lib/space.ts).
//   pnpm llama:serve
// Needs `brew install ollama cloudflared`, `brew services start ollama` and `ollama pull llama3.2-vision:11b`.
//
// Ollama has no auth, so it is never exposed itself: a small proxy on 127.0.0.1:11435 checks a bearer token and
// forwards only POST /v1/chat/completions. A Cloudflare quick tunnel (no account) gives the proxy a public URL,
// which changes every run, so this script writes it and the token to the Convex env each time it starts.
// Keep it running (caffeinate stops the Mac sleeping) for as long as the bot should have the fallback.
import { spawn, execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { homedir } from "node:os";
import { join } from "node:path";

const OLLAMA = process.env.OLLAMA_URL ?? "http://127.0.0.1:11434";
const PORT = Number(process.env.PROXY_PORT ?? 11435);
const MODEL = process.env.MODEL_FALLBACK_MODEL ?? "llama3.2-vision:11b";
const tokenFile = join(homedir(), ".duka-books-llama-token");
if (!existsSync(tokenFile)) writeFileSync(tokenFile, randomBytes(24).toString("hex"), { mode: 0o600 });
const token = readFileSync(tokenFile, "utf8").trim();

createServer(async (req, res) => {
  if (req.method !== "POST" || req.url !== "/v1/chat/completions" || req.headers.authorization !== `Bearer ${token}`) {
    res.writeHead(404).end();
    return;
  }
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const started = Date.now();
  try {
    const upstream = await fetch(`${OLLAMA}/v1/chat/completions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: Buffer.concat(chunks) });
    res.writeHead(upstream.status, { "Content-Type": "application/json" }).end(Buffer.from(await upstream.arrayBuffer()));
    console.log(`${new Date().toISOString()} ${upstream.status} ${Date.now() - started} ms`);
  } catch (err) {
    res.writeHead(502).end(JSON.stringify({ error: String(err) }));
  }
}).listen(PORT, "127.0.0.1", () => console.log(`proxy on 127.0.0.1:${PORT} -> ${OLLAMA}`));

// Load the model now so the first WhatsApp photo doesn't wait for it, and keep it loaded.
fetch(`${OLLAMA}/api/generate`, { method: "POST", body: JSON.stringify({ model: MODEL, keep_alive: "24h" }) }).catch(() => {});

const tunnel = spawn("cloudflared", ["tunnel", "--no-autoupdate", "--url", `http://127.0.0.1:${PORT}`], { stdio: ["ignore", "ignore", "pipe"] });
let published = false;
tunnel.stderr.on("data", (d) => {
  const url = String(d).match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/)?.[0];
  if (!url || published) return;
  published = true;
  const set = (name, value) => execFileSync("npx", ["convex", "env", "set", name, value], { stdio: "ignore" });
  set("MODEL_FALLBACK_URL", `${url}/v1`);
  set("MODEL_FALLBACK_KEY", token);
  set("MODEL_FALLBACK_MODEL", MODEL);
  console.log(`tunnel ${url} written to Convex (MODEL_FALLBACK_URL, MODEL_FALLBACK_KEY, MODEL_FALLBACK_MODEL)`);
});
tunnel.on("exit", (code) => {
  console.error(`cloudflared exited (${code})`);
  process.exit(1);
});
spawn("caffeinate", ["-is", "-w", String(process.pid)], { stdio: "ignore" });
