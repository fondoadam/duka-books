import { afterEach, describe, expect, it, vi } from "vitest";
import { encode as encodePng } from "fast-png";
import {
  FIXTURE_BOXES, annotate, cleanBoxes, crop, decodeJpeg, encodeJpeg, maskBox, receiptsFixture, segmentReceipts, type Box,
} from "../convex/lib/segment";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("cleanBoxes", () => {
  it("crops fall inside the image, padded 2%", () => {
    const boxes = cleanBoxes([[0, 0, 300, 500], [700, 300, 200, 300]], 900, 600);
    for (const [x, y, w, h] of boxes) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(x + w).toBeLessThanOrEqual(900);
      expect(y + h).toBeLessThanOrEqual(600);
    }
    expect(boxes[1]).toEqual([682, 288, 218, 312]);
  });

  it("tiny boxes are dropped", () => {
    expect(cleanBoxes([[10, 10, 100, 100], [300, 50, 300, 450]], 900, 600)).toHaveLength(1);
  });

  it("drops a box inside another and orders left to right", () => {
    const boxes = cleanBoxes([[600, 50, 250, 450], [40, 60, 250, 450], [70, 100, 200, 300]], 900, 600);
    expect(boxes.map((b) => b[0])).toEqual([22, 582]);
  });
});

describe("images", () => {
  it("crops and annotates a real JPEG", () => {
    const img = decodeJpeg(encodeJpeg(receiptsFixture()));
    expect([img.width, img.height]).toEqual([900, 600]);
    const piece = decodeJpeg(encodeJpeg(crop(img, [340, 40, 230, 500])));
    expect([piece.width, piece.height]).toEqual([230, 500]);
    // Inside the second receipt the paper is near white.
    expect(piece.data[(100 * 230 + 5) * 4]).toBeGreaterThan(220);
    const marked = annotate(img, FIXTURE_BOXES);
    const i = (70 * 900 + 150) * 4; // top edge of box 1
    expect([marked.data[i], marked.data[i + 1], marked.data[i + 2]]).toEqual([255, 122, 0]);
  });

  it("reads a mask's bounding box", () => {
    const width = 40, height = 30, data = new Uint8Array(width * height * 4);
    for (let y = 5; y < 20; y++) for (let x = 10; x < 25; x++) data.set([255, 0, 0, 255], (y * width + x) * 4);
    expect(maskBox(encodePng({ width, height, data, channels: 4 }))).toEqual([10, 5, 15, 15]);
    expect(maskBox(encodePng({ width, height, data: new Uint8Array(width * height * 4), channels: 4 }))).toBeNull();
  });
});

describe("segmentReceipts", () => {
  it("the stub keeps a real photo whole", async () => {
    const photo = encodeJpeg(receiptsFixture());
    const { crops, annotated } = await segmentReceipts(photo, "image/jpeg");
    expect(crops).toHaveLength(1);
    expect(crops[0].bytes).toBe(photo);
    expect(annotated).toBeNull();
  });

  it("the stub splits the simulator's empty photo into the three fixture receipts", async () => {
    const { crops, annotated } = await segmentReceipts(new Uint8Array(), "image/jpeg");
    expect(crops.map((c) => c.box)).toEqual(FIXTURE_BOXES);
    expect(decodeJpeg(annotated!).width).toBe(900);
  });

  it("calls SAM 3 on a Gradio Space and turns its masks into crops", async () => {
    vi.stubEnv("SEGMENT_PROVIDER", "hf-space");
    vi.stubEnv("HF_TOKEN", "hf_test");
    const space = "https://prithivmlmods-sam3-demo.hf.space";
    const mask = (box: Box) => {
      const data = new Uint8Array(900 * 600 * 4);
      for (let y = box[1]; y < box[1] + box[3]; y++) for (let x = box[0]; x < box[0] + box[2]; x++) data[(y * 900 + x) * 4 + 3] = 255;
      return encodePng({ width: 900, height: 600, data, channels: 4 });
    };
    const masks: Record<string, Uint8Array> = { m0: mask(FIXTURE_BOXES[2]), m1: mask(FIXTURE_BOXES[0]), m2: mask([5, 5, 20, 20]) };
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer hf_test");
      if (url === `${space}/gradio_api/upload`) return Response.json(["/tmp/gradio/x/photo.jpg"]);
      if (url === `${space}/gradio_api/call/run_image_segmentation`) {
        expect(JSON.parse(String(init!.body)).data.slice(1)).toEqual(["receipt", 0.25]);
        return Response.json({ event_id: "ev1" });
      }
      if (url.endsWith("/run_image_segmentation/ev1")) {
        const annotations = Object.keys(masks).map((k) => ({ image: { url: `${space}/gradio_api/file=/tmp/${k}.png` }, label: "receipt" }));
        return new Response(`event: complete\ndata: ${JSON.stringify([{ image: {}, annotations }])}\n\n`);
      }
      const key = url.match(/\/tmp\/(m\d)\.png$/)?.[1];
      if (key) return new Response(masks[key]);
      throw new Error(`unexpected fetch ${url}`);
    });
    const { crops, annotated } = await segmentReceipts(encodeJpeg(receiptsFixture()), "image/jpeg");
    expect(fetchSpy).toHaveBeenCalledTimes(6);
    // The 20px scrap is dropped; the two receipts come back left to right, padded.
    expect(crops.map((c) => c.box)).toEqual([[42, 58, 256, 464], [612, 98, 246, 404]]);
    expect(decodeJpeg(crops[0].bytes).width).toBe(256);
    expect(annotated).not.toBeNull();
  });

  it("reports a Space error such as a used-up quota", async () => {
    vi.stubEnv("SEGMENT_PROVIDER", "hf-space");
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith("/upload")) return Response.json(["/tmp/p.jpg"]);
      if (url.endsWith("/run_image_segmentation")) return Response.json({ event_id: "e" });
      return new Response('event: error\ndata: {"error": "You have exceeded your ZeroGPU runs limit."}\n\n');
    });
    await expect(segmentReceipts(encodeJpeg(receiptsFixture()), "image/jpeg")).rejects.toThrow(/ZeroGPU/);
  });
});
