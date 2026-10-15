'use strict';

/**
 * blockDetector.js — B0 pure block-page classifier (detection ONLY).
 *
 * NO evasion, NO bypass, NO retry logic lives here: this module names what a
 * page IS so drivers can record honest BLOCKED verdicts instead of
 * misreading walls as content.
 *
 *   classify({ title, status, ocrText, bodyText, url })
 *     -> { class, confidence, signals[] }
 *
 * Classes (lowercase-contains signatures, campaign-grounded: magento CF-526,
 * imdb 202 bot-check, reddit login-wall, stackoverflow/npmjs 403, goodreads
 * blank-render):
 *   ok | login_wall | bot_challenge | forbidden | blank_render | rate_limit
 *
 * Priority on multi-match: bot_challenge > login_wall > forbidden >
 * rate_limit > blank_render > ok. Confidence is deterministic:
 * block classes min(0.55 + 0.15 * (signals-1), 0.95); ok is 0.6.
 *
 * HOOK POINT (declared only — explorer/runAuto are NOT edited by this lane):
 *   see HOOK_INTO below. MCP perceive-reply already carries title+url+text,
 *   so the detector can run on the MCP surface with zero new tools; the act
 *   surface is untouched (a classifier never acts).
 */

const SIGNATURES = {
  bot_challenge: [
    'cloudflare', 'checking your browser', 'verify you are human',
    'attention required', 'captcha', 'recaptcha', 'are you a robot',
    'unusual traffic', 'bot check', 'cf-challenge', 'challenge-platform',
  ],
  login_wall: [
    'log in to continue', 'sign in to continue', 'please log in',
    'login required', 'authentication required', 'sign in to view',
    'log in to view', 'members only',
  ],
  forbidden: [
    '403', 'forbidden', 'access denied',
    'access to this page has been denied',
  ],
  rate_limit: ['429', 'too many requests', 'rate limit', 'slow down'],
};

const STATUS_SIGNALS = { 403: 'forbidden', 429: 'rate_limit', 526: 'bot_challenge' };
const PRIORITY = ['bot_challenge', 'login_wall', 'forbidden', 'rate_limit'];
const OK_CONFIDENCE = 0.6;
const BLANK_CONFIDENCE = 0.55;

function lower(v) {
  return typeof v === 'string' ? v.toLowerCase() : '';
}

function blockConfidence(n) {
  return Math.round(Math.min(0.55 + 0.15 * Math.max(n - 1, 0), 0.95) * 100) / 100;
}

function classify(input) {
  const src = [lower(input && input.title), lower(input && input.ocrText),
    lower(input && input.bodyText), lower(input && input.url)].join('\n');
  const status = Number(input && input.status);

  const hits = {};
  for (const cls of PRIORITY) {
    hits[cls] = SIGNATURES[cls].filter((sig) => src.includes(sig));
    const want = STATUS_SIGNALS[status];
    if (want === cls) hits[cls] = ['http-' + status].concat(hits[cls]);
  }

  for (const cls of PRIORITY) {
    if (hits[cls].length) {
      return { class: cls, confidence: blockConfidence(hits[cls].length), signals: hits[cls] };
    }
  }

  const text = [lower(input && input.ocrText), lower(input && input.bodyText)];
  if (status === 200 && text.every((t) => !t.trim())) {
    return { class: 'blank_render', confidence: BLANK_CONFIDENCE, signals: ['empty-render'] };
  }
  return { class: 'ok', confidence: OK_CONFIDENCE, signals: [] };
}

const HOOK_INTO = [
  'vision/src/explorer.js :: post-perceive classify(title,url,ocrText); non-ok records verdict only, never auto-retries',
  'vision/runAuto.js :: pre-plan classify(target page); non-ok marks BLOCKED-honest, never navigates away',
  'vision/mcp/server.js :: perceive-reply already carries title+url+text (zero new tools); act surface untouched, classifier never acts',
];

module.exports = { classify, SIGNATURES, PRIORITY, HOOK_INTO };
