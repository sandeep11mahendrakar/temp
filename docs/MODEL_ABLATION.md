# Model Ablation (R-4) — W1 offline

Mode: ASSISTED (mock brain, api_calls=0). Live 3-free-model leg not run this
session (serial slot + quota; recorded as BLOCKED below, honest).

| Model | brain mode | api_calls | suite (vision/mcp) | notes |
|---|---|---|---|---|
| mock (baseline) | mock | 0 | 504/505 + 41/41 | offline, deterministic, no network |
| groq gpt-oss-120b | cli | not run | - | live, requires serial slot + valid key |
| openrouter stealth/ox-alpha | cli | not run | - | live, requires serial slot + valid key |
| gemini-3.5-flash-lite | api | not run | - | BLOCKED(invalid-key) per GL1; needs valid GEMINI_API_KEY |

Conclusion: only mock baseline measured this session. No claimed gain from
unmeasured models. Live leg deferred to a holder with a free slot; row
labeled PARTIAL/BLOCKED-honest for the live leg. No key material in this file.