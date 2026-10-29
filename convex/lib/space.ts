// Meta open weights without a Meta key, behind the OpenAI Chat Completions shape the rest of the app speaks.
// createOpenAICompatible gets openFetch as its fetch, and each /chat/completions request goes to:
//   1. Muse Glimmer 30B on a Hugging Face ZeroGPU Space (MODEL_SPACE; MODEL_SPACE=off skips it). Free with
//      HF_TOKEN, but the free daily GPU quota is a handful of calls, so when it fails we go to
//   2. MODEL_FALLBACK_URL: any OpenAI-compatible host, e.g. Llama 3.1 8B in Ollama on our own Mac behind
//      infra/local-llama.mjs (MODEL_FALLBACK_MODEL, MODEL_FALLBACK_KEY). Text only unless MODEL_FALLBACK_VISION=1:
//      no Meta vision model fits a 16 GB Mac, so photos are only read by Muse Glimmer.
//
// Neither takes tools, and the Space takes no JSON schema either, so both are done in the prompt:
//   response_format json_schema  the schema is added to the system prompt and the JSON is cut out of the reply
//   tools                        the tools are listed in the system prompt; a reply of {"tool": ..., "arguments": ...}
//                                becomes a tool call, and tool results go back as a user turn
// Photos go to the Space first; everything else goes to the fallback first, to save the Space's quota for photos.
// SPACE_GPU_SECONDS caps the GPU time asked for per Space call.

export const DEFAULT_MODEL_SPACE = "https://taf2023-muse-glimmer-30b-dflash.hf.space";

type Part = { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } };
type ToolCall = { id: string; type: "function"; function: { name: string; arguments: string } };
type Message =
  | { role: "system" | "user"; content: string | Part[] }
  | { role: "assistant"; content?: string | null; tool_calls?: ToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };
type Tool = { type: "function"; function: { name: string; description?: string; parameters?: unknown } };
export type ChatRequest = {
  model: string;
  messages: Message[];
  max_tokens?: number;
  temperature?: number;
  response_format?: { type: "json_object" } | { type: "json_schema"; json_schema: { schema: unknown } };
  tools?: Tool[];
};

type Turn = { role: "user" | "assistant"; text: string; images: string[] }; // images: data URLs

const textOf = (content: string | Part[] | null | undefined) =>
  typeof content === "string" ? content : (content ?? []).flatMap((p) => (p.type === "text" ? [p.text] : [])).join("\n");

// The request as the Space sees it: one system prompt, then alternating turns ending on the user.
export function toTurns(req: ChatRequest): { system: string; turns: Turn[] } {
  const system: string[] = [];
  const turns: Turn[] = [];
  const names = new Map<string, string>();
  const push = (role: Turn["role"], text: string, images: string[] = []) => {
    const last = turns.at(-1);
    if (last?.role === role) {
      last.text += `\n\n${text}`;
      last.images.push(...images);
    } else turns.push({ role, text, images });
  };
  for (const m of req.messages) {
    if (m.role === "system") system.push(textOf(m.content));
    else if (m.role === "user") {
      const images = typeof m.content === "string" ? [] : m.content.flatMap((p) => (p.type === "image_url" ? [p.image_url.url] : []));
      push("user", textOf(m.content), images);
    } else if (m.role === "assistant") {
      for (const c of m.tool_calls ?? []) names.set(c.id, c.function.name);
      const calls = (m.tool_calls ?? []).map((c) => JSON.stringify({ tool: c.function.name, arguments: JSON.parse(c.function.arguments || "{}") }));
      push("assistant", [m.content ?? "", ...calls].filter(Boolean).join("\n"));
    } else if (m.role === "tool") push("user", `Tool result (${names.get(m.tool_call_id) ?? "tool"}): ${m.content}`);
  }

  if (req.tools?.length) {
    const list = req.tools.map((t) => `- ${t.function.name}: ${t.function.description ?? ""} Arguments (JSON Schema): ${JSON.stringify(t.function.parameters ?? {})}`);
    system.push(
      `You can call these tools:\n${list.join("\n")}\n` +
        `To call one, reply with only {"tool": "<name>", "arguments": {...}} and nothing else; its result comes back in the next message. ` +
        `When you have what you need, reply with your answer as plain text.`,
    );
  }
  const format = req.response_format;
  if (format?.type === "json_schema") system.push(`Reply with only one JSON object that matches this JSON Schema, no other text:\n${JSON.stringify(format.json_schema.schema)}`);
  else if (format?.type === "json_object") system.push("Reply with only one JSON object, no other text.");
  return { system: system.join("\n\n"), turns };
}

// The outermost {...} of a reply (models like to wrap JSON in ```json fences or a sentence).
export function cutJson(text: string): string | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  const candidate = text.slice(start, end + 1);
  try {
    JSON.parse(candidate);
    return candidate;
  } catch {
    return null;
  }
}

// The Space's answer as an OpenAI choice: a tool call when it asked for a known tool, else the text (or JSON).
export function toChoice(req: ChatRequest, content: string) {
  const json = cutJson(content);
  if (req.tools?.length && json) {
    const call = JSON.parse(json) as { tool?: string; arguments?: unknown };
    if (call.tool && req.tools.some((t) => t.function.name === call.tool)) {
      return {
        message: {
          role: "assistant",
          content: null,
          tool_calls: [{ id: `call_${crypto.randomUUID()}`, type: "function", function: { name: call.tool, arguments: JSON.stringify(call.arguments ?? {}) } }],
        },
        finish_reason: "tool_calls",
      };
    }
  }
  const text = req.response_format && json ? json : content.trim();
  return { message: { role: "assistant", content: text }, finish_reason: "stop" };
}

function dataUrlFile(url: string, n: number): File {
  const match = url.match(/^data:([^;,]+);base64,(.*)$/);
  if (!match) throw new Error("Only data: URLs are supported for images on the Space");
  const bin = atob(match[2]);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const ext = match[1].split("/")[1]?.replace("jpeg", "jpg") ?? "jpg";
  return new File([bytes], `image-${n}.${ext}`, { type: match[1] });
}

async function ok(res: Response, what: string) {
  if (!res.ok) throw new Error(`${what} failed: ${res.status} ${(await res.text()).slice(0, 300)}`);
  return res;
}

type Env = Record<string, string | undefined>;
type Backend = (req: ChatRequest, system: string, turns: Turn[]) => Promise<string>;

// The Space's /chat endpoint: images uploaded first, then one queued call read as server-sent events.
export function spaceBackend(space: string, token: string | undefined, env: Env = process.env): Backend {
  const base = space.replace(/\/$/, "");
  const auth: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
  const upload = async (urls: string[]) => {
    if (urls.length === 0) return [];
    const form = new FormData();
    urls.forEach((u, i) => form.append("files", dataUrlFile(u, i)));
    return (await (await ok(await fetch(`${base}/gradio_api/upload`, { method: "POST", headers: auth, body: form }), "Space upload")).json()) as string[];
  };

  return async (req, system, turns) => {
    const last = turns.at(-1)!;
    const history = await Promise.all(turns.slice(0, -1).map(async (t) => ({ role: t.role, text: t.text, files: await upload(t.images) })));
    const files = await upload(last.images);
    const call = await ok(
      await fetch(`${base}/gradio_api/call/chat`, {
        method: "POST",
        headers: { ...auth, "Content-Type": "application/json" },
        body: JSON.stringify({
          data: [
            last.text, files, history, system,
            req.max_tokens ?? 2048, req.temperature ?? 0, 0.95, 64, 1.0,
            env.MODEL_REASONING ?? "low", Number(env.SPACE_GPU_SECONDS ?? 45), true,
          ],
        }),
      }),
      "Space call",
    );
    const { event_id } = (await call.json()) as { event_id: string };
    const stream = await (await ok(await fetch(`${base}/gradio_api/call/chat/${event_id}`, { headers: auth }), "Space result")).text();
    const done = stream.match(/event: complete\ndata: (.*)/);
    if (!done) throw new Error(`Muse Glimmer Space failed: ${stream.match(/event: error\ndata: (.*)/)?.[1] ?? stream.slice(-300)}`);
    return (JSON.parse(done[1]) as [{ content: string }])[0].content;
  };
}

// A plain OpenAI-compatible chat call with the tools already folded into the prompt. The JSON schema is passed
// on too, since hosts like Ollama constrain decoding to it.
export function chatBackend(baseURL: string, model: string, key: string | undefined, vision = false): Backend {
  return async (req, system, turns) => {
    if (!vision && turns.some((t) => t.images.length)) throw new Error("text-only, skipped for a photo");
    const messages = [
      { role: "system", content: system },
      ...turns.map((t) => ({ role: t.role, content: [{ type: "text", text: t.text }, ...t.images.map((url) => ({ type: "image_url", image_url: { url } }))] })),
    ];
    const res = await ok(
      await fetch(`${baseURL.replace(/\/$/, "")}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(key ? { Authorization: `Bearer ${key}` } : {}) },
        body: JSON.stringify({ model, messages, max_tokens: req.max_tokens ?? 2048, temperature: req.temperature ?? 0, response_format: req.response_format }),
      }),
      "Fallback model",
    );
    return ((await res.json()) as { choices: { message: { content: string } }[] }).choices[0].message.content;
  };
}

export function backends(env: Env = process.env): { name: string; run: Backend }[] {
  const list: { name: string; run: Backend }[] = [];
  if (env.MODEL_SPACE !== "off") list.push({ name: "muse-glimmer-30b (HF Space)", run: spaceBackend(env.MODEL_SPACE ?? DEFAULT_MODEL_SPACE, env.HF_TOKEN, env) });
  if (env.MODEL_FALLBACK_URL) {
    const model = env.MODEL_FALLBACK_MODEL ?? "llama3.1:8b";
    list.push({ name: model, run: chatBackend(env.MODEL_FALLBACK_URL, model, env.MODEL_FALLBACK_KEY, env.MODEL_FALLBACK_VISION === "1") });
  }
  return list;
}

export function openFetch(env: Env = process.env) {
  return async (_url: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const req = JSON.parse(String(init?.body)) as ChatRequest;
    const { system, turns } = toTurns(req);
    if (turns.at(-1)?.role !== "user") throw new Error("The last message must come from the user");
    let content: string | null = null;
    let used = "";
    const errors: string[] = [];
    // Photos need the Space. Anything else tries our own machine first, so the Space's small quota is kept for photos.
    const photo = turns.some((t) => t.images.length);
    const order = backends(env);
    if (!photo) order.reverse();
    for (const b of order) {
      try {
        content = await b.run(req, system, turns);
        used = b.name;
        break;
      } catch (err) {
        errors.push(`${b.name}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    if (content === null) throw new Error(`No open-weights model answered. ${errors.join(" | ") || "Set HF_TOKEN or MODEL_FALLBACK_URL."}`);
    if (errors.length) console.warn(`open models: fell back to ${used}. ${errors.join(" | ")}`);
    return new Response(
      JSON.stringify({
        id: `open-${crypto.randomUUID()}`,
        object: "chat.completion",
        created: Math.floor(Date.now() / 1000),
        model: used,
        choices: [{ index: 0, ...toChoice(req, content) }],
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  };
}
