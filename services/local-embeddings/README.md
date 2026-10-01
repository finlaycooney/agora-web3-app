# Local embeddings for the recruiting demo

Runs `intfloat/multilingual-e5-small` on this Mac with no embedding-provider API account. The service creates vectors only: it does not fetch Telegram data, extract candidate fields, store a search index, or connect the hosted app to the Mac. Those integrations are separate work.

The model revision and preprocessing identity are pinned in `model_config.py`. All vectors are normalized, 384-dimensional, and tagged with `index_version`. A consuming index must store this identity and reject mismatched query vectors. Switching models or preprocessing requires reindexing; moving this exact service to another host does not.

## Setup and operation

Use Python 3.12 and run commands from this directory. `requirements.lock` pins the dependency versions tested on Apple Silicon. No global Python environment is changed.

```sh
EMBEDDING_PYTHON=/path/to/python3.12 sh setup.sh
.venv/bin/python control.py start
.venv/bin/python control.py status
.venv/bin/python benchmark.py
.venv/bin/python control.py stop
```

Setup downloads the public model and generates a private token in `.runtime/token`. It never asks for a Hugging Face account or reads an existing Hugging Face token. Runtime loads local safetensors only, with remote code and downloads disabled. Do not commit, print, or expose the token. Both the virtual environment and runtime directory are ignored by Git.

The service runs detached until stopped or the Mac shuts down. It does not install a login item or prevent sleep. Restart it after reboot with `control.py start`. The Mac must remain awake and online for a future hosted demo that depends on it. Indexing jobs should retry after interruptions; searches should explicitly fall back to keywords when this worker is unavailable.

## HTTP contract

Base URL: `http://127.0.0.1:8817`. `GET /health` reports readiness and model identity without a credential. `POST /v1/embeddings` requires `Authorization: Bearer <contents of .runtime/token>` and `Content-Type: application/json`.

```json
{
  "model": "intfloat/multilingual-e5-small",
  "input": ["Solidity engineer experienced in Ethereum protocols"],
  "input_type": "passage",
  "encoding_format": "float"
}
```

Use `input_type: "query"` for search queries and `"passage"` for profiles, evidence chunks and document chunks. Send raw text without adding prefixes; the service adds the E5 prefix. This is an OpenAI-style response envelope with an explicitly required E5 input type, not a drop-in implementation of every OpenAI API option.

Successful responses contain `data[].embedding`, `data[].index`, `model`, `index_version` and token usage. Callers must preserve input order and scope vectors by organization, private owner/approved visibility, and source version. Embeddings are private derived data and must be deleted with their sources. Recheck authorization before returning search results.

Limits: 32 inputs per request, 128 KiB request body, and 512 tokens per input including prefix and special tokens. Long inputs return `422 INPUT_TOO_LONG` with indexes; callers must split them. There is no silent truncation. Busy inference returns `429` with `Retry-After`; failures return `503`. Use a durable queue with bounded retries. One inference runs at a time with two CPU threads and internal batches of eight.

## Hosted connection boundary

The listener is loopback-only, browser requests are rejected, and request access logging is disabled. Inputs, vectors and credentials are not written by the service. The private runtime log contains startup diagnostics only; the benchmark report contains synthetic checks.

Do not expose this port directly or place its token in frontend code. The future hosted connection needs an authenticated private relay or an outbound worker protocol. That protocol must authorize work and must not allow the Mac's worker token to act as an unrestricted production database credential. No tunnel, production connection, or real candidate processing is configured by this service setup.

## Verification

```sh
.venv/bin/python -m unittest -v test_service
.venv/bin/python benchmark.py
```

Unit tests exercise authentication, browser/host restrictions, validation, input redaction, request limits, concurrency and recovery. The live benchmark exercises real model inference through HTTP, normalized vectors, paraphrase and Spanish retrieval, timing, and rejection of oversized token inputs. These small synthetic checks are smoke tests, not evidence of production search accuracy or full-history capacity.

Model reference: https://huggingface.co/intfloat/multilingual-e5-small (MIT license).
