'use strict';

/**
 * lib/llmProvider.js — minimal multi-provider LLM configuration + transport.
 *
 * A very small generic abstraction shared ONLY as infrastructure; Architecture
 * A (web/) and Architecture B (vision/) each resolve their OWN configuration
 * independently and keep their own prompts/parsing/retry policies.
 *
 * Supported providers (OpenAI-compatible chat/completions endpoints):
 *   groq       https://api.groq.com/openai/v1
 *   openrouter https://openrouter.ai/api/v1
 *   gemini     https://generativelanguage.googleapis.com/v1beta/openai
 *
 * Configuration is resolved PER ARCHITECTURE from prefixed variables:
 *   <PREFIX>LLM_PROVIDER / <PREFIX>LLM_API_KEY / <PREFIX>LLM_MODEL
 *   <PREFIX>LLM_BASE_URL   (optional override)
 * e.g. ARCH_A_LLM_PROVIDER=groq, ARCH_B_LLM_PROVIDER=openrouter.
 *
 * SECRETS ARE NEVER LOGGED. Keys are validated lazily — importing modules
 * that use this file never crashes when a key is absent (offline/stub mode).
 */

const PROVIDER_BASE_URLS = {
  groq: 'https://api.groq.com/openai/v1',
  openrouter: 'https://openrouter.ai/api/v1',
  opencode: 'https://opencode.ai/zen/v1',
  gemini: 'https://generativelanguage.googleapis.com/v1beta/openai',
};

const PROVIDER_DEFAULT_MODELS = {
  groq: 'openai/gpt-oss-120b',
  // OpenRouter has no meaningful universal default — require an explicit model.
  openrouter: null,
  opencode: 'muse-spark-1.3-contributor-free',
  // Gemini: no default model — require explicit <prefix>LLM_MODEL (env-only).
  gemini: null,
};

const SUPPORTED_PROVIDERS = Object.keys(PROVIDER_BASE_URLS);

/**
 * Append {model, usage} token counts to logs/llm_usage.jsonl (one JSON object
 * per line). NEVER logs prompts, responses, or API keys — counts only.
 * Path override via LLM_USAGE_LOG_PATH (used by tests). Best-effort: a logging
 * failure must never break a live LLM call.
 */
function logUsageToJSONL(providerName, targetModel, data) {
  try {
    const u = data && data.usage;
    if (!u) return; // provider sent no usage block — nothing to count
    const rec = {
      ts: new Date().toISOString(),
      provider: providerName,
      model: targetModel,
      prompt_tokens: u.prompt_tokens ?? null,
      completion_tokens: u.completion_tokens ?? null,
      total_tokens: u.total_tokens ?? null,
    };
    const file = process.env.LLM_USAGE_LOG_PATH ||
      require('path').join(__dirname, '..', 'logs', 'llm_usage.jsonl');
    require('fs').mkdirSync(require('path').dirname(file), { recursive: true });
    require('fs').appendFileSync(file, JSON.stringify(rec) + '\n', 'utf8');
  } catch (_) { /* ignore */ }
}

/**
 * Resolve one architecture's LLM configuration.
 *
 * @param {Object} opts
 * @param {Object} opts.env        environment object (e.g. process.env)
 * @param {String} opts.prefix     e.g. 'ARCH_A_' or 'ARCH_B_'
 * @param {String} [opts.legacyApiKey]  fallback key var value (e.g. GROQ_API_KEY)
 * @param {String} [opts.legacyModel]   fallback model var value
 * @param {Number} [opts.defaultMaxTokens]
 */
function resolveLLMConfig({ env, prefix, legacyApiKey = undefined, legacyModel = undefined }) {
  const pick = (k) => {
    const v = env[k];
    return typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined;
  };

  let provider = (pick(prefix + 'LLM_PROVIDER') || 'groq').toLowerCase();
  if (!SUPPORTED_PROVIDERS.includes(provider)) {
    throw new Error(
      `Unsupported ${prefix}LLM_PROVIDER "${provider}" (supported: ${SUPPORTED_PROVIDERS.join(', ')})`
    );
  }

  const apiKey =
    pick(prefix + 'LLM_API_KEY') ||
    legacyApiKey || // legacy provider-specific fallback, e.g. GROQ_API_KEY
    undefined;

  const model =
    pick(prefix + 'LLM_MODEL') ||
    legacyModel ||
    PROVIDER_DEFAULT_MODELS[provider] ||
    undefined;

  const baseUrl =
    pick(prefix + 'LLM_BASE_URL') ||
    PROVIDER_BASE_URLS[provider];

  // Reasoning-effort control for reasoning models. Default 'low' (T1):
  // keeps SOTA-tier reasoning models fast. Env LLM_REASONING /
  // <prefix>LLM_REASONING overrides with any effort level.
  const reasoning = pick(prefix + 'LLM_REASONING') || pick('LLM_REASONING') || 'low';

  return {
    provider,
    apiKey,            // may be undefined — callers must validate lazily
    model,             // may be undefined (openrouter without explicit model)
    baseUrl,
    reasoning,
  };
}

/**
 * True + the text iff s is (or contains) parsable JSON with an "action" key.
 * Local helper (T1) — kept here to avoid a require cycle with vision/src/llm.
 */
function actionableJSON(s) {
  if (typeof s !== 'string' || !s.includes('"action"')) return '';
  try { const o = JSON.parse(s.trim()); if (o && typeof o === 'object' && 'action' in o) return s; } catch (_) {}
  const re = /\{[\s\S]*?"action"[\s\S]*?\}/g;
  let m;
  while ((m = re.exec(s)) !== null) {
    try { const o = JSON.parse(m[0]); if (o && typeof o === 'object' && 'action' in o) return m[0]; } catch (_) {}
  }
  return '';
}

/**
 * One OpenAI-compatible chat completion via fetch. Returns the assistant
 * message content string. Errors carry `.status` for caller retry policies.
 * NEVER logs or embeds the API key in error messages.
 */
async function chatCompletion(config, { messages, maxTokens = 700, temperature = 0.2, model } = {}) {
  if (!config || !config.baseUrl) throw new Error('llmProvider: missing provider config');
  if (!config.apiKey) {
    throw new Error(
      `Missing API key for provider "${config.provider}". ` +
      'Set the architecture-specific LLM_API_KEY variable in .env.'
    );
  }
  const targetModel = model || config.model;
  if (!targetModel) {
    throw new Error(`No model configured for provider "${config.provider}"`);
  }

  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${config.apiKey}`,
  };
  if (config.provider === 'openrouter') {
    // Recommended OpenRouter attribution headers (values are NOT secret).
    headers['HTTP-Referer'] = process.env.OPENROUTER_SITE_URL || 'https://localhost/capstone';
    headers['X-Title'] = process.env.OPENROUTER_APP_NAME || 'Capstone Test Generator';
  }

  const body = {
    model: targetModel,
    max_tokens: maxTokens,
    temperature,
    messages,
  };
  if (config.reasoning) {
    body.reasoning = { effort: config.reasoning };
  }

  let res;
  // 429 rate limits are EXPECTED on free tiers (Groq: 8000 TPM per model).
  // Wait out the provider-suggested delay and retry instead of failing the
  // caller's step — quota 429s are transient pacing signals, not dead ends.
  const MAX_429_RETRIES = Number(process.env.LLM_429_RETRIES) || 6;
  let attempt429 = 0;
  for (;;) {
    try {
      res = await fetch(`${config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });
    } catch (err) {
      const e = new Error(`LLM network error (${config.provider}): ${err.message}`);
      e.status = null;
      throw e;
    }
    if (res.status === 429 && attempt429 < MAX_429_RETRIES) {
      attempt429 += 1;
      let detail429 = '';
      try { detail429 = await res.text(); } catch (_) {}
      const m = detail429.match(/try again in ([\d.]+)s/i);
      const waitMs = m ? Math.ceil(parseFloat(m[1]) * 1000) + 500 : Math.min(8000 * attempt429, 30000);
      console.warn(`[llmProvider] 429 from ${config.provider} (${targetModel}) — waiting ${waitMs}ms (attempt ${attempt429}/${MAX_429_RETRIES})`);
      await new Promise((r) => setTimeout(r, waitMs));
      continue;
    }
    break;
  }

  if (!res.ok) {
    let detail = '';
    try { detail = (await res.text()).slice(0, 300); } catch (_) {}
    const e = new Error(`LLM HTTP ${res.status} from ${config.provider}: ${detail}`);
    e.status = res.status;
    throw e;
  }

  const data = await res.json();
  logUsageToJSONL(config.provider, targetModel, data);
  // T1 meta for llm_calls.jsonl (finish_reason + completion_tokens).
  try {
    chatCompletion.lastMeta = {
      finish_reason: (data && data.choices && data.choices[0] && data.choices[0].finish_reason) || null,
      completion_tokens: (data && data.usage && data.usage.completion_tokens) ?? null,
    };
  } catch (_) { chatCompletion.lastMeta = null; }
  const msg = data?.choices?.[0]?.message;
  // Reasoning models (e.g. gpt-oss) occasionally emit the final answer in a
  // dedicated reasoning field with empty content — fall back ONLY when the
  // fallback text is parsable JSON carrying "action" (T1: raw chain-of-
  // thought must never masquerade as the decision), else empty string.
  const reasoningFallback =
    (typeof msg?.reasoning === 'string' && msg.reasoning) ||
    (typeof msg?.reasoning_content === 'string' && msg.reasoning_content) ||
    '';
  const content =
    (typeof msg?.content === 'string' && msg.content) ||
    (reasoningFallback && actionableJSON(reasoningFallback)) ||
    '';
  return typeof content === 'string' ? content : '';
}

module.exports = {
  SUPPORTED_PROVIDERS,
  PROVIDER_BASE_URLS,
  resolveLLMConfig,
  chatCompletion,
};
