import jpeg from "jpeg-js";
import { decode as decodePng } from "fast-png";
import { metaLive, modelConfig } from "./ai";

// SAM 3 receipt splitting: one photo of several receipts becomes one crop per receipt, plus an annotated copy
// (numbered boxes) to send back so the owner sees what was found.
//
// SEGMENT_PROVIDER:
//   unset            "meta" once the Meta Model API is live (metaLive), otherwise "stub"
//   "meta"           SAM 3.1 on the Meta Model API (/v1/responses, model sam-3.1), same key as Muse Spark
//   "stub"           no segmentation (also forced by SEGMENT_STUB=1): a real photo stays one receipt; the
//                    simulator's empty photo becomes a generated three-receipt fixture, so the grouped flow runs
//   "hf-space"       SAM 3 on a Hugging Face ZeroGPU Space (Gradio API; SEGMENT_SPACE, default below). Free, no
//                    card. HF_TOKEN (a free read token) lifts the anonymous quota of a few runs.
//   "http"           your own SAM 3.1 server (infra/modal_app.py): POST image bytes to SEGMENT_URL, get
//                    {"boxes": [[x, y, w, h], ...]} back. SEGMENT_TOKEN is sent as a bearer token.

export type Box = [x: number, y: number, w: number, h: number];
export type Image = { width: number; height: number; data: Uint8Array }; // RGBA
export type Crop = { bytes: Uint8Array; box: Box };

export const DEFAULT_SPACE = "https://prithivmlmods-sam3-demo.hf.space";
const segmentProvider = () =>
  process.env.SEGMENT_STUB === "1" ? "stub" : (process.env.SEGMENT_PROVIDER ?? (metaLive() ? "meta" : "stub"));
export const segmentStubbed = () => segmentProvider() === "stub";

export function decodeJpeg(bytes: Uint8Array): Image {
  const img = jpeg.decode(bytes, { useTArray: true, formatAsRGBA: true, maxMemoryUsageInMB: 256 });
  return { width: img.width, height: img.height, data: img.data };
}

// jpeg-js returns Buffer.from(...) when it sees a CommonJS `module`; Convex's runtime has no Buffer.
export function encodeJpeg(img: Image, quality = 85): Uint8Array {
  const g = globalThis as { Buffer?: unknown };
  const shim = g.Buffer === undefined;
  if (shim) g.Buffer = { from: (a: number[]) => Uint8Array.from(a) };
  try {
    return new Uint8Array(jpeg.encode(img, quality).data);
  } finally {
    if (shim) delete g.Buffer;
  }
}

const isJpeg = (bytes: Uint8Array) => bytes[0] === 0xff && bytes[1] === 0xd8;

// Pad each box 2%, keep it inside the image, drop boxes under 5% of the image (stray scraps, logos) and boxes
// mostly inside a bigger one (SAM sometimes returns a receipt and its printed block). Reading order: left to right.
export function cleanBoxes(boxes: Box[], width: number, height: number): Box[] {
  const minArea = 0.05 * width * height;
  const padX = 0.02 * width;
  const padY = 0.02 * height;
  const padded = boxes
    .filter(([, , w, h]) => w * h >= minArea)
    .map(([x, y, w, h]): Box => {
      const x0 = Math.max(0, Math.floor(x - padX));
      const y0 = Math.max(0, Math.floor(y - padY));
      const x1 = Math.min(width, Math.ceil(x + w + padX));
      const y1 = Math.min(height, Math.ceil(y + h + padY));
      return [x0, y0, x1 - x0, y1 - y0];
    })
    .sort((a, b) => b[2] * b[3] - a[2] * a[3]);
  const kept: Box[] = [];
  for (const box of padded) {
    const inside = kept.some((k) => overlap(box, k) > 0.8 * box[2] * box[3]);
    if (!inside) kept.push(box);
  }
  return kept.sort((a, b) => a[0] + a[2] / 2 - (b[0] + b[2] / 2));
}

function overlap(a: Box, b: Box) {
  const w = Math.min(a[0] + a[2], b[0] + b[2]) - Math.max(a[0], b[0]);
  const h = Math.min(a[1] + a[3], b[1] + b[3]) - Math.max(a[1], b[1]);
  return w > 0 && h > 0 ? w * h : 0;
}

export function crop(img: Image, [x, y, w, h]: Box): Image {
  const data = new Uint8Array(w * h * 4);
  for (let row = 0; row < h; row++) {
    const from = ((y + row) * img.width + x) * 4;
    data.set(img.data.subarray(from, from + w * 4), row * w * 4);
  }
  return { width: w, height: h, data };
}

// 3x5 digits, drawn as blocks, for the receipt numbers on the annotated photo.
const DIGITS = ["111101101101111", "010110010010111", "111001111100111", "111001111001111", "101101111001001",
  "111100111001111", "111100111101111", "111001001001001", "111101111101111", "111101111001111"];

export function annotate(img: Image, boxes: Box[]): Image {
  const out = { ...img, data: new Uint8Array(img.data) };
  const fill = (x0: number, y0: number, w: number, h: number, [r, g, b]: number[]) => {
    for (let y = Math.max(0, y0); y < Math.min(out.height, y0 + h); y++)
      for (let x = Math.max(0, x0); x < Math.min(out.width, x0 + w); x++) {
        const i = (y * out.width + x) * 4;
        out.data[i] = r;
        out.data[i + 1] = g;
        out.data[i + 2] = b;
      }
  };
  const orange = [255, 122, 0];
  const t = Math.max(3, Math.round(Math.min(img.width, img.height) / 150));
  boxes.forEach(([x, y, w, h], n) => {
    fill(x, y, w, t, orange);
    fill(x, y + h - t, w, t, orange);
    fill(x, y, t, h, orange);
    fill(x + w - t, y, t, h, orange);
    const label = String(n + 1);
    const s = t * 2; // block size of one digit pixel
    fill(x, y, (label.length * 4 + 1) * s, 7 * s, orange);
    [...label].forEach((d, k) => {
      const bits = DIGITS[Number(d)];
      for (let i = 0; i < 15; i++) if (bits[i] === "1") fill(x + (k * 4 + 1 + (i % 3)) * s, y + (1 + Math.floor(i / 3)) * s, s, s, [255, 255, 255]);
    });
  });
  return out;
}

// --- providers ---

async function ok(res: Response, what: string) {
  if (!res.ok) throw new Error(`${what} failed: ${res.status} ${(await res.text()).slice(0, 300)}`);
  return res;
}

// Bounding box of a mask PNG (alpha, or grey level when there is no alpha). Null when the mask is empty.
export function maskBox(png: Uint8Array): Box | null {
  const p = decodePng(png);
  const c = p.channels;
  let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
  for (let y = 0; y < p.height; y++)
    for (let x = 0; x < p.width; x++) {
      const k = (y * p.width + x) * c;
      const v = c === 4 || c === 2 ? p.data[k + c - 1] : p.data[k];
      if (v > (p.depth === 16 ? 32767 : 127)) {
        if (x < x0) x0 = x;
        if (y < y0) y0 = y;
        if (x > x1) x1 = x;
        if (y > y1) y1 = y;
      }
    }
  return x1 < 0 ? null : [x0, y0, x1 - x0 + 1, y1 - y0 + 1];
}

// SAM 3 behind a Gradio Space: upload, call run_image_segmentation(image, "receipt", threshold), read the
// server-sent result, then fetch one mask per instance.
async function samSpace(bytes: Uint8Array, mimeType: string): Promise<Box[]> {
  const space = (process.env.SEGMENT_SPACE ?? DEFAULT_SPACE).replace(/\/$/, "");
  const auth: Record<string, string> = process.env.HF_TOKEN ? { Authorization: `Bearer ${process.env.HF_TOKEN}` } : {};
  const form = new FormData();
  form.append("files", new File([new Uint8Array(bytes)], "photo.jpg", { type: mimeType }));
  const [path] = (await (await ok(await fetch(`${space}/gradio_api/upload`, { method: "POST", headers: auth, body: form }), "SAM upload")).json()) as string[];
  const threshold = Number(process.env.SEGMENT_THRESHOLD ?? 0.25);
  const call = await ok(
    await fetch(`${space}/gradio_api/call/run_image_segmentation`, {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({ data: [{ path, meta: { _type: "gradio.FileData" } }, "receipt", threshold] }),
    }),
    "SAM call",
  );
  const { event_id } = (await call.json()) as { event_id: string };
  const stream = await (await ok(await fetch(`${space}/gradio_api/call/run_image_segmentation/${event_id}`, { headers: auth }), "SAM result")).text();
  const done = stream.match(/event: complete\ndata: (.*)/);
  if (!done) throw new Error(`SAM failed: ${stream.match(/data: (.*)/)?.[1] ?? stream.slice(0, 300)}`);
  const [{ annotations }] = JSON.parse(done[1]) as [{ annotations: { image: { url: string } }[] }];
  const boxes = await Promise.all(
    annotations.map(async (a) => maskBox(new Uint8Array(await (await ok(await fetch(a.image.url, { headers: auth }), "SAM mask")).arrayBuffer()))),
  );
  return boxes.filter((b): b is Box => b !== null);
}

// SAM 3.1 on the Meta Model API: one non-streamed Responses call with a one-noun-phrase prompt. The answer is
// special-token text, one <|box;x1=..;y1=..;x2=..;y2=..;w=..;h=..;c=..|> per match in source pixels (plus a mask
// token we don't need). https://dev.meta.ai/docs/sam/reading-segmentation
async function samMeta(bytes: Uint8Array, mimeType: string): Promise<Box[]> {
  const { baseURL, apiKey } = modelConfig();
  const res = await ok(
    await fetch(`${baseURL}/responses`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env.SEGMENT_MODEL ?? "sam-3.1",
        input: [{ type: "message", role: "user", content: [
          { type: "input_text", text: "receipt" },
          { type: "input_image", image_url: `data:${mimeType};base64,${base64(bytes)}` },
        ] }],
        metadata: { include_confidence: "true" },
      }),
    }),
    "SAM",
  );
  const json = (await res.json()) as { output_text?: string; output?: { content?: { text?: string }[] }[] };
  const text = json.output_text ?? (json.output ?? []).flatMap((o) => o.content ?? []).map((c) => c.text ?? "").join("");
  return samBoxes(text, Number(process.env.SEGMENT_THRESHOLD ?? 0.25));
}

export function samBoxes(text: string, minConfidence: number): Box[] {
  return [...text.matchAll(/<\|box;([^|]*)\|>/g)].flatMap(([, fields]) => {
    const f = Object.fromEntries(fields.split(";").map((kv) => kv.split("=")).map(([k, v]) => [k, Number(v)]));
    if (f.c !== undefined && f.c < minConfidence) return [];
    return [[Math.round(f.x1), Math.round(f.y1), Math.round(f.x2 - f.x1), Math.round(f.y2 - f.y1)] as Box];
  });
}

function base64(bytes: Uint8Array) {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

async function samHttp(bytes: Uint8Array, mimeType: string): Promise<Box[]> {
  const url = process.env.SEGMENT_URL;
  if (!url) throw new Error("SEGMENT_URL must be set when SEGMENT_PROVIDER=http");
  const token = process.env.SEGMENT_TOKEN;
  const res = await ok(
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": mimeType, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: new Uint8Array(bytes),
    }),
    "SAM",
  );
  return ((await res.json()) as { boxes: Box[] }).boxes;
}

export async function findReceipts(bytes: Uint8Array, mimeType: string): Promise<Box[]> {
  const provider = segmentProvider();
  if (provider === "meta") return samMeta(bytes, mimeType);
  if (provider === "hf-space") return samSpace(bytes, mimeType);
  if (provider === "http") return samHttp(bytes, mimeType);
  throw new Error(`Unknown SEGMENT_PROVIDER: ${provider}`);
}

// --- the stub's fixture: three receipts on a wooden counter ---

export const FIXTURE_BOXES: Box[] = [[60, 70, 220, 440], [340, 40, 230, 500], [630, 110, 210, 380]];

export function receiptsFixture(): Image {
  const width = 900, height = 600;
  const data = new Uint8Array(width * height * 4);
  const px = (x: number, y: number, v: number[]) => data.set([v[0], v[1], v[2], 255], (y * width + x) * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) { const n = (x * 7 + y * 13) % 17; px(x, y, [92 + n, 60 + n, 38 + n]); }
  for (const [rx, ry, rw, rh] of FIXTURE_BOXES) {
    for (let y = ry; y < ry + rh; y++) for (let x = rx; x < rx + rw; x++) px(x, y, [246, 244, 236]);
    for (let line = ry + 30; line < ry + rh - 30; line += 22) {
      const len = 60 + ((line * 31) % (rw - 90));
      for (let y = line; y < line + 7; y++) for (let x = rx + 18; x < rx + 18 + len; x++) px(x, y, [40, 40, 40]);
    }
  }
  return { width, height, data };
}

// The whole step. One crop (or a photo that can't be split) means: treat it as a single receipt.
export async function segmentReceipts(bytes: Uint8Array, mimeType: string): Promise<{ crops: Crop[]; annotated: Uint8Array | null }> {
  const whole = { crops: [{ bytes, box: [0, 0, 0, 0] as Box }], annotated: null };
  let img: Image;
  let boxes: Box[];
  // Empty bytes come from the simulator, which never downloads: show the fixture whether SAM is live or not.
  if (bytes.length === 0) {
    img = receiptsFixture();
    boxes = FIXTURE_BOXES;
  } else {
    if (segmentStubbed() || !isJpeg(bytes)) return whole;
    img = decodeJpeg(bytes);
    boxes = cleanBoxes(await findReceipts(bytes, mimeType), img.width, img.height);
    if (boxes.length <= 1) return whole;
  }
  return {
    crops: boxes.map((box) => ({ bytes: encodeJpeg(crop(img, box)), box })),
    annotated: encodeJpeg(annotate(img, boxes), 80),
  };
}
