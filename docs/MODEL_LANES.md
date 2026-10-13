# MODEL LANES — Review 3 (vision pipeline)

Scope: candidate LLM lanes for `vision/` exploration (action selection +
test generation). Offline doc; no live calls, no key probes performed.

Verified sources only:

- `vision/.env` lane comments (values redacted; model IDs and comments only)
- `lib/llmProvider.js` (providers, retry policy, usage logging)
- Board gates: QUOTA-FREE-ONLY = YES, R3-T1 DONE notes (oc-key 403)

Secrets live in `vision/.env` and are never copied here.

## 1. Candidate table

| # | Lane | Model / endpoint | Status | Cost | Notes |
|---|------|------------------|--------|------|-------|
| 1 | Nemotron primary `:free` | `nvidia/nemotron-3-super-120b-a12b:free` via OpenRouter (`ARCH_B_LLM_PROVIDER=openrouter`, reasoning effort `low`) | ACTIVE primary | $0 (free tier) | Current `ARCH_B_LLM_MODEL`. Text-only task (visual-DOM JSON, never images). |
| 2 | Gemma fallback `:free` | `google/gemma-4-31b-it:free` via OpenRouter (currently commented out in `.env`) | STANDBY fallback | $0 (free tier) | Upstream 429 on 2026-10-11 (pool saturated). Retry policy below applies. |
| 3 | Google AI Studio free lane | Gemini Flash via AI Studio free tier (e.g. Flash-class model), or `:free` Gemini model via OpenRouter | PROPOSED, free-key only | $0 within free quota (RPM/TPM capped) | Two paths: (a) no-code — use a `:free` Gemini model through the existing OpenRouter provider; (b) direct AI Studio key — needs a small provider addition (see section 4). |
| 4 | Cheap-paid A (Groq) | Llama 3.3 70B Versatile on Groq, paid | PARKED (free-only gate) | Indicative public rates: ~$0.59/M in, ~$0.79/M out — recheck before buying | OpenAI-compatible; `groq` is already a supported provider in `lib/llmProvider.js`. |
| 5 | Cheap-paid B (OpenRouter) | Gemini 2.0 Flash (`google/gemini-2.0-flash-001`) on OpenRouter, paid | PARKED (free-only gate) | Indicative public rates: ~$0.10/M in, ~$0.40/M out — recheck before buying | Same provider/attribution headers as today; only model + paid key change. |

Retired / rejected (do not use):

- `qwen/qwen3.8-27b:free` — withdrawn from free tier 2026-10-11 (404).
- Opencode oc-key lane (`muse-spark-1.3-contributor-free` via `opencode.ai/zen/v1`) — free tier REJECTED for external use (403 FreeTierError 2026-10-11); reference only.

## 2. Gemma `:free` retry policy

Built into `lib/llmProvider.js` `chatCompletion` (no caller changes needed):

- 429s are treated as transient pacing signals, not dead ends.
- Retries: up to `LLM_429_RETRIES` (default 6).
- Backoff: honors the provider's `try again in Ns` hint (+500 ms margin);
  otherwise `min(8000 * attempt, 30000)` ms.
- Non-429 errors carry `.status` and fail fast to the caller.

Operational rule for Lane 2: keep Gemma second in the fallback chain and let
the built-in backoff absorb pool-saturation 429s. If 429s persist past all
retries, the explorer ends the run gracefully (`llm_error` termination) —
quota exhaustion must never be misread as task completion.

Usage accounting: every call appends `{model, prompt_tokens,
completion_tokens}` to `logs/llm_usage.jsonl` (counts only — never prompts,
responses, or keys). Use it after the R3-T3 demo to replace the estimates in
section 3 with measured per-call tokens.

## 3. Per-site cost math (paid lanes only)

Basis (per spec): ~3.0K input + ~0.7K output tokens per LLM call.

```text
cost/call = (3000 / 1e6) * P_in + (700 / 1e6) * P_out
          = 0.003 * P_in + 0.0007 * P_out        (P = $ per 1M tokens)
```

Calls per site: `EXPLORE_MAX_STEPS` defaults to 25 action selections per run
(`vision/src/explorer.js`), each with a possible anti-laziness reprompt.
Show nominal 25 calls/site and a 50-call ceiling.

| Lane | Rate basis (indicative) | $ / call | $ / site (25 calls) | $ / site (50 calls, ceiling) |
|------|-------------------------|----------|---------------------|------------------------------|
| Cheap-paid A (Groq 3.3-70B) | 0.59 in / 0.79 out | 0.003*0.59 + 0.0007*0.79 = **0.00232** | **~0.058** | **~0.116** |
| Cheap-paid B (Gemini 2.0 Flash) | 0.10 in / 0.40 out | 0.003*0.10 + 0.0007*0.40 = **0.00058** | **~0.015** | **~0.029** |
| Free lanes (1–3) | $0 | 0 | 0 | 0 (quota-capped, not dollar-capped) |

Rates are indicative public list prices (Oct 2026) — confirm live pricing
before any purchase. The formulas stay valid regardless of rate changes.
Paid lanes stay PARKED until the free-only gate is lifted by Master.

## 4. Integration notes

- `lib/llmProvider.js` supports exactly three providers (`groq`,
  `openrouter`, `opencode`) with per-architecture overrides
  (`<PREFIX>LLM_PROVIDER / LLM_MODEL / LLM_API_KEY / LLM_BASE_URL`).
- Lanes 1, 2, 4, 5 need no code change (env-only switches).
- Lane 3 path (b) — direct AI Studio key — needs a small addition (new
  provider entry + base URL); prefer path (a) (`:free` Gemini via OpenRouter)
  unless AI Studio quotas prove materially better.
- `ARCH_B_LLM_REASONING=low` and `GROQ_MAX_TOKENS=700` /
  `GROQ_TEMPERATURE=0.2` are the current cost/latency controls; keep them for
  any new lane until measured usage says otherwise.

## 5. Recommendation order

1. Nemotron `:free` (active).
2. Gemma `:free` fallback with built-in 429 backoff (active standby).
3. AI Studio free lane path (a) if free-tier 429s block the Review-3 demo.
4. Cheap-paid B, then A — only if Master lifts QUOTA-FREE-ONLY.
