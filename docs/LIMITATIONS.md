# Limitations and roadmap (Q-4)

Honest final limitations. No overclaim.

## Known limitations

1. **No value oracles.** The system verifies actions-work, not values-correct. Mutation analysis (mutation/results/ANALYSIS.md) shows no assertion/value oracles exist. Top V2 item, deliberately deferred.
2. **Perception gaps.** Underline inputs, white-on-colour buttons, button text missing from YOLO, tiny icons, overlay-covered controls (docs/PERCEPTION_GAPS.md). OCR-anchored synthesis (V-2) is open.
3. **Oracle adversarial gaps.** Pre-existing expected text and zero count_delta can produce misleading PASS at the oracle level; action-skipped is caught by executor flags (by design).
4. **MCP act input_value is self-reported.** No DOM read-back for all fields (Q5 fixed fill probe-readback, but coverage is partial).
5. **K1 actions fire blind in runTestCase re-detect.** K1 added 15 actions but re-detect covers only a subset; blind-fire classes are mock-tested.
6. **Visual DOM fixtures drift.** Must pin copies (fixtureManifest.test.js); un-pinned fixtures can silently drift.
7. **No demoqa truth anchor independent of harness.** Truths are hand-authored (claude-memory-unverified) or probe-derived; mismatch => report only, never auto-edit truth.
8. **Live runs are serial and api0.** No parallel live execution; LLM calls are budget-capped (OpenRouter 1000/day global, Groq 8k TPM).
9. **Campaign evidence is subset-based.** 50-site target; Tier-3 near-complete; blocked-honest sites (403/bot-check/blank) are recorded, not retried.
10. **No production deployment.** F-1 final eval is gated on USER-INDEX; no 30-site final eval yet.

## Roadmap (V2)

- Value/assertion oracles (top item).
- OCR-anchored perception synthesis (V-2).
- Full MCP readback coverage.
- 30-site final eval once USER-INDEX is set.
- Archetype tuning on public practice sites (A-8).
- Experience memory ablation (E-4).

Prepared by W3, 2026-10-18. api_calls=0.
