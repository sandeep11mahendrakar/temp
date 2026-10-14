'use strict';

/**
 * llm.js — Vision Architecture LLM client (Architecture B)
 *
 * Follows the same interface/style as web/src/llmClient.js:
 *   callLLM(prompt) -> raw text or parsed object
 *   parseAction(response) -> normalised action
 *   executeAction(page, action, targetElement) -> Playwright execution
 *
 * Key difference from Architecture A:
 *   Actions use coordinates (x/y from the visual DOM) instead of CSS selectors,
 *   because YOLO + OCR produce bounding boxes, not DOM nodes.
 */

require('dotenv').config();

// Architecture B LLM configuration — independently configurable provider.
// Resolution order (prefix ARCH_B_):
//   ARCH_B_LLM_PROVIDER  (groq | openrouter; default groq)
//   ARCH_B_LLM_API_KEY   > GROQ_API_KEY
//   ARCH_B_LLM_MODEL     > GROQ_MODEL_B > GROQ_MODEL > provider default
const { resolveLLMConfig, chatCompletion } = require('../../lib/llmProvider');

const STUB_MODE = process.env.STUB_LLM === 'true';

const LLM_CONFIG = resolveLLMConfig({
  env: process.env,
  prefix: 'ARCH_B_',
  legacyApiKey: process.env.GROQ_API_KEY,
  legacyModel: process.env.GROQ_MODEL_B || process.env.GROQ_MODEL || undefined,
});

// Visual DOM prompts are short; a modest token budget avoids quota issues.
const MAX_TOKENS = Number(process.env.GROQ_MAX_TOKENS) || 700;
const TEMPERATURE = Number(process.env.GROQ_TEMPERATURE) || 0.2;

// ---------------------------------------------------------------------------
// Generic LLM call
// ---------------------------------------------------------------------------

async function callLLM(prompt, options = {}) {
  if (STUB_MODE) {
    console.warn('[llm] STUB MODE — returning done action');
    return { action: 'done', reason: 'stub' };
  }

  if (typeof prompt !== 'string' || prompt.trim() === '') {
    throw new Error('callLLM: prompt must be a non-empty string');
  }

  const maxTokens = Number(options.maxTokens) || MAX_TOKENS;
  const temperature =
    typeof options.temperature === 'number' ? options.temperature : TEMPERATURE;

  console.log(`[llm] Calling ${LLM_CONFIG.provider} -> ${options.model || LLM_CONFIG.model || '(no model set)'} ...`);

  // Retries for transient failures only; do not retry quota errors.
  // Stealth preview endpoints intermittently 503 — backoff absorbs it.
  const maxAttempts = Number(process.env.LLM_MAX_ATTEMPTS) || 5;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const reply = (
        await chatCompletion(LLM_CONFIG, {
          model: options.model,
          maxTokens,
          temperature,
          messages: [
            {
              role: 'system',
              content:
                'You are an AI agent for automated web application testing. ' +
                'Follow the user prompt exactly. ' +
                'When JSON output is requested, return valid JSON only.',
            },
            { role: 'user', content: prompt },
          ],
        })
      );
      // chatCompletion returns text; meta rides alongside (T1: finish_reason
      // + completion_tokens for llm_calls.jsonl). Serial use only.
      const rawText = (typeof reply === 'string' ? reply : (reply && reply.text) || '').trim();
      callLLM.lastMeta = (reply && reply.meta) || chatCompletion.lastMeta || null;

      if (rawText === '') {
        throw new Error('LLM returned an empty response');
      }

      console.log('[llm] Raw response:', rawText.slice(0, 200));
      return rawText;
    } catch (err) {
      const status = err.status || err.statusCode || null;
      const message = err.message || String(err);
      console.error(`[llm] Attempt ${attempt} failed: ${message}`);

      if (status === 429 || message.includes('quota')) {
        throw err;
      }
      if (attempt >= maxAttempts) throw err;

      await new Promise((resolve) => setTimeout(resolve, Math.min(1500 * attempt, 12000)));
    }
  }
}

/**
 * Extract the LAST balanced {...} block containing "action" (T1: reasoning
 * models starve JSON under a 400-token budget — thought text precedes the
 * object and trailing prose follows it; first-brace match grabs garbage).
 * Returns the parsed object or null. String/escape aware.
 */
function extractLastJSON(rawText) {
  if (typeof rawText !== 'string') return rawText;
  let best = null;
  let depth = 0; let start = -1; let inStr = false; let esc = false;
  for (let i = 0; i < rawText.length; i++) {
    const ch = rawText[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === '{') { if (depth === 0) start = i; depth += 1; }
    else if (ch === '}') {
      if (depth > 0) {
        depth -= 1;
        if (depth === 0 && start >= 0) {
          const slice = rawText.slice(start, i + 1);
          if (slice.includes('"action"')) {
            try { best = JSON.parse(slice); } catch (_) { /* keep scanning */ }
          }
          start = -1;
        }
      }
    }
  }
  return best;
}

/**
 * Extract and parse JSON from an LLM response.
 * Tolerates markdown fences and surrounding text.
 */
function extractJSON(rawText) {
  if (typeof rawText !== 'string') return rawText;

  const cleaned = rawText
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/, '')
    .replace(/\s*```$/, '')
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch (_) {
    // Try to find the first {...} or [...] block.
    const objectMatch = cleaned.match(/\{[\s\S]*\}/);
    if (objectMatch) {
      try { return JSON.parse(objectMatch[0]); } catch (_) {}
    }
    const arrayMatch = cleaned.match(/\[[\s\S]*\]/);
    if (arrayMatch) {
      try { return JSON.parse(arrayMatch[0]); } catch (_) {}
    }
    return null;
  }
}

// ---------------------------------------------------------------------------
// Action parsing (coordinate-based, per report System 2)
// ---------------------------------------------------------------------------

const VALID_ACTIONS = new Set(['click', 'fill', 'navigate', 'scroll', 'done',
  // K1 action-extensions batch1 (vision-coords-only, one-per-step).
  'key', 'submit', 'select', 'check', 'uncheck',
  // K1 batch2.
  'hover', 'dblclick', 'press', 'wait', 'focus',
  // K1 batch3.
  'clear', 'upload', 'drag', 'snapshot', 'selectOption',
  // L1 right_click (implemented in executeAction by W3; accepted here).
  'right_click']);

function parseAction(llmResponse) {
  if (STUB_MODE) {
    return { action: 'done', reason: 'stub' };
  }

  let obj = llmResponse;
  if (typeof llmResponse === 'string') {
    obj = extractJSON(llmResponse);
  }

  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    return { action: 'unknown', reason: 'unparseable response' };
  }

  const rawType = String(obj.action || '');
  // K1: case-insensitive match returning the canonical member (selectOption).
  const type = [...VALID_ACTIONS].find((a) => a.toLowerCase() === rawType.toLowerCase()) || rawType.toLowerCase();
  if (!VALID_ACTIONS.has(type)) {
    return { action: 'unknown', reason: `unsupported action "${rawType}"` };
  }

  return {
    action: type,
    x: typeof obj.x === 'number' ? obj.x : null,
    y: typeof obj.y === 'number' ? obj.y : null,
    value: typeof obj.value === 'string' ? obj.value : '',
    url: typeof obj.url === 'string' ? obj.url : '',
    elementId: obj.elementId || null,
    targetText: obj.target_text || obj.targetText || null,
    reason: obj.reason || '',
  };
}

// ---------------------------------------------------------------------------
// Coordinate-based Playwright execution
// ---------------------------------------------------------------------------

// K1: read the checked state of the checkbox/radio under (or near) a point.
// Mirrors snapCheckToNativeInput resolution (executeTests.js): the point's
// own control, its label control, else the nearest li's checkable input.
// Returns true/false, or null when no checkable control resolves.
async function readCheckState(page, x, y) {
  const r = await page.evaluate(([px, py]) => {
    const el = document.elementFromPoint(px, py);
    if (!el) return null;
    let ctrl = null;
    if (el.tagName === 'INPUT' && /checkbox|radio/i.test(el.getAttribute('type') || '')) {
      ctrl = el;
    } else if (el.tagName === 'LABEL' && el.control) {
      ctrl = el.control;
    } else {
      const scope = (el.closest && el.closest('li')) || document;
      ctrl = scope.querySelector('input[type="checkbox"],input[type="radio"]');
    }
    if (!ctrl) return null;
    return !!ctrl.checked;
  }, [Math.round(x), Math.round(y)]);
  return typeof r === 'boolean' ? r : null;
}

function needCoords(action, what) {
  if (!Number.isFinite(action.x) || !Number.isFinite(action.y)) {
    throw new Error(`executeAction: ${what} requires numeric x and y coordinates`);
  }
}

async function executeAction(page, action) {
  switch (action.action) {
    case 'click': {
      needCoords(action, 'click');
      await page.mouse.click(action.x, action.y);
      return;
    }

    case 'fill': {
      needCoords(action, 'fill');
      await page.mouse.click(action.x, action.y);
      await page.keyboard.press('Control+A').catch(() => {});
      await page.keyboard.type(action.value || 'test', { delay: 30 });
      return;
    }

    case 'navigate': {
      if (!action.url) {
        throw new Error('executeAction: navigate requires a url');
      }
      await page.goto(action.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      return;
    }

    case 'scroll': {
      await page.mouse.wheel(0, action.y || 600);
      return;
    }

    case 'done':
      return;

    // K1 batch1: key presses a keyboard key (no coords needed).
    case 'key': {
      await page.keyboard.press(action.value || 'Enter');
      return;
    }

    // K1 batch1: submit clicks the control then presses Enter (form submit).
    case 'submit': {
      needCoords(action, 'submit');
      await page.mouse.click(action.x, action.y);
      await page.keyboard.press('Enter');
      return;
    }

    // K1 batch1: select opens the combobox, types the option, confirms.
    case 'select': {
      needCoords(action, 'select');
      await page.mouse.click(action.x, action.y);
      if (typeof action.value === 'string' && action.value) {
        await page.keyboard.type(action.value, { delay: 30 });
      }
      await page.keyboard.press('Enter');
      return;
    }

    // K1 batch1: check/uncheck click ONLY when the state differs (read first).
    case 'check':
    case 'uncheck': {
      needCoords(action, action.action);
      const want = action.action === 'check';
      const state = await readCheckState(page, action.x, action.y).catch(() => null);
      if (state === null || state !== want) {
        await page.mouse.click(action.x, action.y);
      }
      return;
    }

    // K1 batch2: hover moves only; dblclick double-clicks at coords.
    case 'hover': {
      needCoords(action, 'hover');
      await page.mouse.move(action.x, action.y);
      return;
    }

    case 'dblclick': {
      needCoords(action, 'dblclick');
      await page.mouse.click(action.x, action.y, { clickCount: 2 });
      return;
    }

    // L1 real right-click: context menu at coords (never click-mapped).
    case 'right_click': {
      needCoords(action, 'right_click');
      await page.mouse.click(action.x, action.y, { button: 'right' });
      return;
    }

    // K1 batch2: press sends any key string to the focused element
    // (key is the canon Enter|Tab|Space lane; press is the open lane).
    case 'press': {
      await page.keyboard.press(action.value || 'Enter');
      return;
    }

    // K1 batch2: wait sleeps value ms, capped (never hangs a run).
    case 'wait': {
      const ms = Math.min(Math.max(Number(action.value) || 1000, 0), 10000);
      if (typeof page.waitForTimeout === 'function') await page.waitForTimeout(ms);
      else await new Promise((r) => setTimeout(r, ms));
      return;
    }

    // K1 batch2: focus clicks the point to focus (documented focus-via-click).
    case 'focus': {
      needCoords(action, 'focus');
      await page.mouse.click(action.x, action.y);
      return;
    }

    // K1 batch3: clear selects all + deletes (no coords-free path).
    case 'clear': {
      needCoords(action, 'clear');
      await page.mouse.click(action.x, action.y);
      await page.keyboard.press('Control+A').catch(() => {});
      await page.keyboard.press('Backspace');
      return;
    }

    // K1 batch3: upload sets files on the file input near the point.
    case 'upload': {
      needCoords(action, 'upload');
      if (typeof action.value !== 'string' || !action.value) {
        throw new Error('executeAction: upload requires a file path value');
      }
      const handle = await page.evaluateHandle(([px, py]) => {
        const el = document.elementFromPoint(px, py);
        if (!el) return null;
        if (el.tagName === 'INPUT' && (el.getAttribute('type') || '').toLowerCase() === 'file') return el;
        const scope = (el.closest && el.closest('form,li,div')) || document;
        return scope.querySelector('input[type="file"]');
      }, [Math.round(action.x), Math.round(action.y)]);
      const input = handle && typeof handle.asElement === 'function' ? handle.asElement() : null;
      if (!input || typeof input.setInputFiles !== 'function') {
        throw new Error('executeAction: upload found no file input near coordinates');
      }
      await input.setInputFiles(action.value);
      return;
    }

    // K1 batch3: drag from (x,y) to absolute "x2,y2" in value.
    case 'drag': {
      needCoords(action, 'drag');
      const m = /^(\d+)\s*,\s*(\d+)$/.exec(String(action.value || ''));
      if (!m) throw new Error('executeAction: drag requires value "x2,y2"');
      const x2 = Number(m[1]); const y2 = Number(m[2]);
      await page.mouse.move(action.x, action.y);
      await page.mouse.down();
      await page.mouse.move(x2, y2, { steps: 8 });
      await page.mouse.up();
      return;
    }

    // K1 batch3: snapshot captures a screenshot buffer (evidence layer files it).
    case 'snapshot': {
      await page.screenshot();
      return;
    }

    // K1 batch3: selectOption sets a native <select> by option text/value.
    case 'selectOption': {
      needCoords(action, 'selectOption');
      if (typeof action.value !== 'string' || !action.value) {
        throw new Error('executeAction: selectOption requires an option value');
      }
      const ok = await page.evaluate(([px, py, want]) => {
        const el = document.elementFromPoint(px, py);
        if (!el) return false;
        const sel = el.tagName === 'SELECT' ? el
          : ((el.closest && el.closest('div,form,li')) || document).querySelector('select');
        if (!sel) return false;
        const opts = [...sel.options];
        const hit = opts.find((o) => o.value === want || (o.text || '').trim() === String(want).trim());
        if (!hit) return false;
        sel.value = hit.value;
        sel.dispatchEvent(new Event('input', { bubbles: true }));
        sel.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      }, [Math.round(action.x), Math.round(action.y), action.value]);
      if (!ok) throw new Error('executeAction: selectOption found no matching option');
      return;
    }

    default:
      throw new Error(`Unsupported action: ${action.action}`);
  }
}

module.exports = { callLLM, extractJSON, extractLastJSON, parseAction, executeAction, readCheckState };
