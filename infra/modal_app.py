"""Self-hosted Meta models for Duka Books on Modal: SAM 3.1 receipt boxes and Omnilingual ASR.

UNTESTED: written on Oct 29 without Modal access or SAM 3.1 weight approval. Expect small fixes on first deploy.

Setup (needs Modal credits, e.g. the hackathon's partner credits):
  1. Ask for access to https://huggingface.co/facebook/sam3.1 (gated) and create a HF read token.
  2. pip install modal && modal setup
  3. modal secret create duka-books HF_TOKEN=hf_... DUKA_TOKEN=<any long random string>
  4. modal deploy infra/modal_app.py   -> prints https://<you>--duka-books-web.modal.run
  5. On the Convex deployment:
       npx convex env set SEGMENT_PROVIDER http
       npx convex env set SEGMENT_URL https://<you>--duka-books-web.modal.run/segment
       npx convex env set SEGMENT_TOKEN <DUKA_TOKEN>
       npx convex env set ASR_PROVIDER compat
       npx convex env set ASR_BASE_URL https://<you>--duka-books-web.modal.run/v1
       npx convex env set ASR_API_KEY <DUKA_TOKEN>

Contracts (match convex/lib/segment.ts and convex/lib/transcribe.ts):
  POST /segment                  body: image bytes        -> {"boxes": [[x, y, w, h], ...]}  (pixels)
  POST /v1/audio/transcriptions  multipart file + model   -> {"text": "..."}
"""

import os
import subprocess
import tempfile

import modal

image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("ffmpeg", "libsndfile1")
    .pip_install(
        "torch==2.5.1",
        "transformers>=4.57",
        "accelerate",
        "pillow",
        "omnilingual-asr",
        "fastapi[standard]",
    )
)
app = modal.App("duka-books", image=image)
secret = modal.Secret.from_name("duka-books")


@app.cls(gpu="A10G", secrets=[secret], scaledown_window=300)
class Models:
    @modal.enter()
    def load(self):
        import torch
        from transformers import Sam3Model, Sam3Processor

        sam_id = os.environ.get("SAM_MODEL", "facebook/sam3.1")  # facebook/sam3 if 3.1 isn't in transformers yet
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        self.sam = Sam3Model.from_pretrained(sam_id, token=os.environ["HF_TOKEN"]).to(self.device)
        self.sam_processor = Sam3Processor.from_pretrained(sam_id, token=os.environ["HF_TOKEN"])

        from omnilingual_asr.models.inference.pipeline import ASRInferencePipeline

        self.asr = ASRInferencePipeline(model_card=os.environ.get("ASR_MODEL", "omniASR_LLM_7B"))

    @modal.method()
    def segment(self, data: bytes, threshold: float = 0.4) -> list[list[int]]:
        import io

        import torch
        from PIL import Image

        img = Image.open(io.BytesIO(data)).convert("RGB")
        inputs = self.sam_processor(images=img, text="receipt", return_tensors="pt").to(self.device)
        with torch.no_grad():
            outputs = self.sam(**inputs)
        result = self.sam_processor.post_process_instance_segmentation(
            outputs, threshold=threshold, mask_threshold=0.5, target_sizes=inputs.get("original_sizes").tolist()
        )[0]
        boxes = []
        for x0, y0, x1, y1 in result["boxes"].tolist():
            boxes.append([round(x0), round(y0), round(x1 - x0), round(y1 - y0)])
        return boxes

    @modal.method()
    def transcribe(self, data: bytes, suffix: str) -> str:
        # WhatsApp voice notes are Ogg/Opus; convert to 16 kHz mono WAV first.
        with tempfile.TemporaryDirectory() as tmp:
            src = os.path.join(tmp, f"in{suffix}")
            wav = os.path.join(tmp, "in.wav")
            with open(src, "wb") as f:
                f.write(data)
            subprocess.run(["ffmpeg", "-y", "-i", src, "-ar", "16000", "-ac", "1", wav], check=True, capture_output=True)
            return self.asr.transcribe([wav], lang=["swh_Latn"], batch_size=1)[0]


@app.function(secrets=[secret])
@modal.asgi_app()
def web():
    from fastapi import FastAPI, File, Form, Header, HTTPException, Request, UploadFile

    api = FastAPI()

    def check(authorization: str | None):
        if authorization != f"Bearer {os.environ['DUKA_TOKEN']}":
            raise HTTPException(401, "bad token")

    @api.post("/segment")
    async def segment(request: Request, authorization: str | None = Header(None)):
        check(authorization)
        return {"boxes": Models().segment.remote(await request.body())}

    @api.post("/v1/audio/transcriptions")
    async def transcriptions(
        file: UploadFile = File(...), model: str = Form("omniASR_LLM_7B"), authorization: str | None = Header(None)
    ):
        check(authorization)
        suffix = os.path.splitext(file.filename or "voice.ogg")[1] or ".ogg"
        return {"text": Models().transcribe.remote(await file.read(), suffix)}

    return api
