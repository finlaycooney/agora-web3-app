"""Authenticated, loopback-only embeddings. Does not store inputs or vectors."""

import hmac
import os
import threading
from pathlib import Path
from typing import Literal

# Runtime never downloads code/model assets or reports Hugging Face telemetry.
os.environ["HF_HUB_OFFLINE"] = "1"
os.environ["TRANSFORMERS_OFFLINE"] = "1"
os.environ["HF_HUB_DISABLE_TELEMETRY"] = "1"
os.environ["TOKENIZERS_PARALLELISM"] = "false"

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, ValidationError, field_validator
from starlette.concurrency import run_in_threadpool
from starlette.middleware.trustedhost import TrustedHostMiddleware

from model_config import (
    DIMENSIONS, INDEX_VERSION, MAX_BODY_BYTES, MAX_INPUTS, MAX_TOKENS,
    MODEL_ID, MODEL_REVISION,
)

ROOT = Path(__file__).resolve().parent


class EmbeddingRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    model: Literal[MODEL_ID]
    input: str | list[str]
    # Explicitly required: documents and queries need different E5 prefixes.
    input_type: Literal["query", "passage"]
    encoding_format: Literal["float"] = "float"

    @field_validator("input")
    @classmethod
    def valid_inputs(cls, value):
        items = [value] if isinstance(value, str) else value
        if not 1 <= len(items) <= MAX_INPUTS:
            raise ValueError(f"Send 1–{MAX_INPUTS} inputs per request.")
        if any(not item.strip() or len(item) > 16000 for item in items):
            raise ValueError("Inputs must be nonblank and at most 16000 characters.")
        return items


class Encoder:
    def __init__(self):
        import torch
        from sentence_transformers import SentenceTransformer

        torch.set_num_threads(2)
        torch.set_num_interop_threads(1)
        self.model = SentenceTransformer(
            str(ROOT / ".runtime" / "model"), device="cpu",
            local_files_only=True, trust_remote_code=False,
            model_kwargs={"use_safetensors": True},
        )
        if self.model.get_sentence_embedding_dimension() != DIMENSIONS:
            raise RuntimeError("Unexpected embedding dimensions.")
        self.model.max_seq_length = MAX_TOKENS
        self.encode(["local startup check"], "query")

    def encode(self, inputs, input_type):
        prefixed = [f"{input_type}: {value}" for value in inputs]
        tokens = self.model.tokenizer(
            prefixed, truncation=False, padding=False, add_special_tokens=True,
        )["input_ids"]
        too_long = [i for i, ids in enumerate(tokens) if len(ids) > MAX_TOKENS]
        if too_long:
            raise HTTPException(422, {
                "code": "INPUT_TOO_LONG", "indexes": too_long,
                "max_tokens_including_prefix": MAX_TOKENS,
                "message": "Split long documents before embedding; nothing was truncated.",
            })
        vectors = self.model.encode(
            prefixed, batch_size=8, normalize_embeddings=True,
            show_progress_bar=False, convert_to_numpy=True,
        )
        return vectors.tolist(), sum(len(ids) for ids in tokens)


def create_app(encoder, token):
    if len(token) < 32:
        raise ValueError("An authentication token of at least 32 characters is required.")
    app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=["127.0.0.1", "localhost"])
    slot = threading.BoundedSemaphore(1)

    @app.middleware("http")
    async def browser_boundary(request, call_next):
        if "origin" in request.headers:
            return JSONResponse({"error": "Browser requests are not supported."}, status_code=403)
        response = await call_next(request)
        response.headers["cache-control"] = "no-store"
        return response

    @app.get("/health")
    async def health():
        return {
            "status": "ready", "model": MODEL_ID, "revision": MODEL_REVISION,
            "index_version": INDEX_VERSION, "dimensions": DIMENSIONS,
            "device": "cpu", "max_inputs": MAX_INPUTS, "max_tokens": MAX_TOKENS,
        }

    @app.post("/v1/embeddings")
    async def embeddings(request: Request):
        provided = request.headers.get("authorization", "").encode("utf-8")
        expected = f"Bearer {token}".encode("utf-8")
        if not hmac.compare_digest(provided, expected):
            raise HTTPException(401, "Authentication required.")
        if request.headers.get("content-type", "").split(";")[0].strip() != "application/json":
            raise HTTPException(415, "Send application/json.")
        raw = bytearray()
        async for chunk in request.stream():
            raw.extend(chunk)
            if len(raw) > MAX_BODY_BYTES:
                raise HTTPException(413, "Request exceeds 128 KiB.")
        try:
            payload = EmbeddingRequest.model_validate_json(raw)
        except ValidationError as error:
            # Pydantic errors otherwise echo raw private inputs in responses.
            raise HTTPException(422, {
                "code": "INVALID_REQUEST",
                "fields": [".".join(str(x) for x in issue["loc"]) for issue in error.errors()],
            }) from None

        def encode():
            if not slot.acquire(blocking=False):
                raise HTTPException(429, "Embedding worker busy; retry later.", headers={"Retry-After": "1"})
            try:
                return encoder.encode(payload.input, payload.input_type)
            finally:
                slot.release()

        try:
            vectors, token_count = await run_in_threadpool(encode)
        except HTTPException:
            raise
        except Exception:
            # Do not expose library exception text, which can contain input text.
            raise HTTPException(503, "Embedding failed; retry the request.") from None
        return {
            "object": "list", "model": MODEL_ID, "index_version": INDEX_VERSION,
            "data": [{"object": "embedding", "index": i, "embedding": v} for i, v in enumerate(vectors)],
            "usage": {"prompt_tokens": token_count, "total_tokens": token_count},
        }

    return app


if __name__ == "__main__":
    import uvicorn

    token = (ROOT / ".runtime" / "token").read_text().strip()
    application = create_app(Encoder(), token)
    uvicorn.run(application, host="127.0.0.1", port=8817, workers=1, access_log=False, log_level="warning")
