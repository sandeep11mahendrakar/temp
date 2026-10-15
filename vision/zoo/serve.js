'use strict';
// vision/zoo/serve.js — standalone zoo server process for headed/CLI runs.
// Usage: node vision/zoo/serve.js [port]
// The executor CLI runs as a BLOCKING child (execSync): an in-process zoo
// server would starve (single-threaded event loop) and every page.goto
// would time out. This process owns the server instead; the harness kills
// it when done. Prints READY <port> on stdout.

const zoo = require('./server');

(async () => {
  const want = Number(process.argv[2]) || 5010;
  const { port } = await zoo.start({ port: want, nextFree: false });
  console.log(`READY ${port}`);
})().catch((e) => { console.error('SERVE-FAIL ' + e.message); process.exit(1); });
