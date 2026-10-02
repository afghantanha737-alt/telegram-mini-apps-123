'use strict';

const startedAt = new Date().toISOString();
const state = {
  updatesReceived: 0,
  startUpdatesReceived: 0,
  startWelcomeSent: 0,
  startHandlerFailures: 0,
  processingFailures: 0,
  webhookSecretRejections: 0,
  lastUpdateAt: null,
  lastUpdateType: null,
  lastStartAt: null
};

function recordWebhookUpdate(type) {
  state.updatesReceived += 1;
  state.lastUpdateAt = new Date().toISOString();
  state.lastUpdateType = String(type || 'unknown');
  if (type === 'start') {
    state.startUpdatesReceived += 1;
    state.lastStartAt = state.lastUpdateAt;
  }
}

function recordStartWelcomeSent() {
  state.startWelcomeSent += 1;
}

function recordStartHandlerFailure() {
  state.startHandlerFailures += 1;
  state.processingFailures += 1;
}

function recordWebhookProcessingFailure() {
  state.processingFailures += 1;
}

function recordWebhookSecretRejection() {
  state.webhookSecretRejections += 1;
}

function getTelegramWebhookMetrics() {
  return { startedAt, ...state, scope: 'current process; counters reset on restart' };
}

module.exports = {
  recordWebhookUpdate,
  recordStartWelcomeSent,
  recordStartHandlerFailure,
  recordWebhookProcessingFailure,
  recordWebhookSecretRejection,
  getTelegramWebhookMetrics
};
