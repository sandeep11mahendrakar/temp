'use strict';
const { createVisionTrialExecutor } = require('./visionTrialExecutor');

function createBridgeExecutor(options = {}) {
  return createVisionTrialExecutor(options);
}

const defaultExecutor = createBridgeExecutor();
module.exports = defaultExecutor;
module.exports.createBridgeExecutor = createBridgeExecutor;