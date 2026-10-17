# BRAIN — one-brain modes: api|cli|file|mock via src/brain.js decide().
Live default: cli (`runAuto --brain=cli`); no local model => file-mode (N0).
Tests always mock. Invariants: extractLastJSON-first, 1 strict retry,
unknown-never-done, CAP40, counts-only logs, keys never logged.
New code requires brain only (grep-proof); old callers frozen.
Labels (Q1): file|pre-authored|replay => ASSISTED (N6 file-mode pre-authored).
cli => AUTONOMY_NONBLIND max; blind=Y unreachable via cli (tools present).
Never AUTONOMOUS unless blind (reportSchema.resolveAutonomy enforces).
