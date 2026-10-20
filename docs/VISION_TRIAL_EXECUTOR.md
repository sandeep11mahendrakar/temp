# Vision Trial Executor Adapter

Factory: createVisionTrialExecutor(options) returns an executor matching runBatch's execute(site, context) contract.

Invocation example:
const { createVisionTrialExecutor } = require('./tools/visionTrialExecutor');
const executor = createVisionTrialExecutor({ maxStates: 10 });
await runBatch({ sites, execute: executor, checkpointFile: 'trial.checkpoint.json' });

Behavior:
- Launches `node vision/runVision.js --explore <url> [--goal ...]` with EXPLORE_MAX_STATES.
- Uses spawn with argument array (spaces safe).
- Reads vision/storage/outputs/<run_id>_exploration_result.json.
- Returns COMPLETE/BLOCKED/FAILED with archive_input for runBatch archiving.
- Missing/malformed output returns FAILED; BLOCKED stays BLOCKED.
- No in-site resume; interrupted sites restart from scratch.

Limitations: process launching and artifact reading are injectable for tests; production wiring to runBatch is manual. No browser/model/site run performed here.