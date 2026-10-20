# Batch checkpoint/resume contract (P-4.1, offline)

`tools/runBatch.js` is a serial batch coordinator. It is not a Vision in-site resume API; `vision/runVision.js` remains one-shot and has no supported checkpoint hook. This scope runs only an explicitly supplied executor module. It does not launch a browser, model, site, or network request.

## CLI

Start a new plan:

```text
node tools/runBatch.js --plan PLAN.json --executor EXECUTOR.js --checkpoint CHECKPOINT.json --archive-root ARCHIVE_ROOT --source-revision HEAD
```

Continue an existing checkpoint:

```text
node tools/runBatch.js --plan PLAN.json --executor EXECUTOR.js --checkpoint CHECKPOINT.json --archive-root ARCHIVE_ROOT --source-revision HEAD --resume
```

`PLAN.json` is an object with an ordered `sites` array. Each site has a safe unique `id`;
optional `run_id` sets its immutable archive id. An existing checkpoint requires `--resume`.
Ordered site ids/run ids and source revision are pinned. Mismatch or malformed JSON/schema
fails before executor calls. Without `--source-revision`, local `git rev-parse HEAD` is
recorded, or `NOT_RECORDED` outside a Git checkout.

`EXECUTOR.js` exports an async function `(site, context) => result` or `{ execute }`.
`context` contains `attempt`, `checkpointFile`, and an `AbortSignal`. Result status is
`COMPLETE`, `BLOCKED`, or `FAILED`; COMPLETE/BLOCKED also require `archive_input` with a
`run_id` matching the site's run id. P-1 `archiveRun` is the default archiver.
`--archive-root` selects its project root. The caller owns the executor module.

## Checkpoint behavior

Checkpoint writes use a same-directory temporary file and rename. Site records include
`status`, `attempts`, archived `archive_path`, and `head`. Terminal statuses are `done`,
`blocked`, and `crashed`; `running` is saved before executor invocation so driver exits
are detectable. On `--resume`, done/blocked sites skip; stale running becomes crashed;
crashed execution restarts from scratch. BLOCKED is never retried. COMPLETE/BLOCKED
archives are immutable; P-1 refuses existing destinations. Legacy version-1 statuses
COMPLETE/BLOCKED/FAILED/TIMED_OUT/ERROR/RUNNING are normalized on read.

`FAILED` executor results become `crashed` and stop without archiving that attempt;
resume can rerun the site. Archive-stage failures retain the archive input and retry only
that stage, never the executor. The summary is JSON on stdout; errors are one-line stderr
with nonzero exit status.

## Verification and live wiring

Offline tests kill a real child process while its mock site executor runs, then invoke
the documented `--resume` command. They assert completed work is not repeated, the
crashed site restarts, later sites finish, BLOCKED is not retried, and corrupt
checkpoints fail before execution. No in-site Vision resume or live readiness is claimed.
A SUB-approved adapter and checkpoint-capable Vision executor remain prerequisites for
any live trial. This document authorizes no site run.
