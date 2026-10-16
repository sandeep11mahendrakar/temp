'use strict';

/**
 * executeTests.js — permanent Vision Architecture test executor.
 *
 * Loads generated coordinate-based test cases (JSON array), executes them
 * against the source URL via Playwright using pixel coordinates only,
 * verifies outcomes with the established heuristics, and writes a report
 * to storage/outputs/execution_results.json.
 *
 * Usage:
 *   node src/executeTests.js <test_cases.json> <base_url> [output_path]
 *
 * Example:
 *   node src/executeTests.js storage/outputs/test_cases_ss_1787344345124_visual_dom.json https://demoqa.com
 *
 * Verification heuristics (unchanged from validated ad-hoc runs):
 *   - If expected_result mentions a URL change/navigation -> PASS when
 *     page.url() differs after execution.
 *   - Otherwise -> PASS when rendered body text is non-trivial (>100 chars).
 *   - Unexpected mid-test navigation is recorded as a warning, not a failure
 *     (the ad-hoc heuristic that failed valid tests like TC07 was removed).
 */

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { chromium } = require('playwright');
const { executeAction } = require('./llm');
// G2: value-oracle verdicts (pure oracle.js; P3 ladder untouched).
const { verdictFor } = require('./oracle');
// H1x: block-page verdicts (pure blockDetector.js; detection only, never evasion).
const { classify: classifyBlockPage } = require('./blockDetector');

const OUTPUT_DIR = path.join(__dirname, '..', 'storage', 'outputs');
const SCREENSHOT_ROOT = path.join(__dirname, '..', 'storage', 'screenshots');
const VISION_ROOT = path.join(__dirname, '..');

/**
 * Derive the evidence run directory from the test-cases file name
 * (pipeline runs embed run_<timestamp>) so execution evidence lands in the
 * same folder as the initial/YOLO/merged evidence for that run.
 */
function deriveRunDir(testCasesPath) {
  const match = path.basename(testCasesPath).match(/(run_\d+)/);
  const runId = match ? match[1] : `exec_${Date.now()}`;
  return {
    runId,
    relDir: path.join('storage', 'screenshots', runId),
  };
}

let stateCounter = 1; // state_001 is the pipeline's initial screenshot

function nextStateName(suffix) {
  stateCounter += 1;
  return path.join(CURRENT_RUN.dir,
    `state_${String(stateCounter).padStart(3, '0')}_${suffix}.png`);
}

let CURRENT_RUN = { dir: '', id: '' };

// B2 fewer-shots: post-action evidence screenshots are taken for
// state-changing actions only; fills verify via the read-only DOM probe
// (probeFillValue class: input_value signal) and skip the screenshot.
const AFTER_SHOT_ACTIONS = new Set(['click', 'right_click', 'navigate', 'scroll', 'modal', 'submit']);

// B2 + audit: a fill ending in Enter may submit/navigate, so it captures;
// Tab stays a field move verified by probe readback.
function needsAfterShot(action, submitKey) {
  if (AFTER_SHOT_ACTIONS.has(String(action || '').toLowerCase())) return true;
  return String(action || '').toLowerCase() === 'fill' &&
    String(submitKey || '').toLowerCase() === 'enter';
}

// B2 screen meter: every page.screenshot goes through snap(); fills that
// skip capture increment skipped. Reset once per run (see main loop).
const ScreenMeter = {
  taken: 0,
  skipped: 0,
  reset() { this.taken = 0; this.skipped = 0; },
};

async function snap(page, relPath) {
  const abs = path.join(VISION_ROOT, relPath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  await page.screenshot({ path: abs });
  ScreenMeter.taken += 1;
  return relPath.replace(/\\/g, '/');
}

// ---------------------------------------------------------------------------
// Closed-loop observation helpers
// ---------------------------------------------------------------------------

const GATEWAY_URL = process.env.VISION_GATEWAY_URL || 'http://127.0.0.1:5000';
const YOLO_URL = process.env.YOLO_SERVICE_URL || 'http://127.0.0.1:5001';
let REDETECT_ENABLED = false;
let serviceHandle = null;

async function probeRedetectAvailability() {
  try {
    await axios.get(`${GATEWAY_URL}/vision/health`, { timeout: 2000 });
    REDETECT_ENABLED = true;
    console.log('[execute] Vision services already running — re-detection enabled.');
  } catch {
    // Nothing alive: start the Vision services ourselves (clean lifecycle).
    console.log('[execute] Vision services not running — starting them for closed-loop execution...');
    const { ensureVisionServices, shutdownVisionServices } = require('./serviceManager');
    const handle = await ensureVisionServices();
    if (handle.ok) {
      serviceHandle = handle;
      REDETECT_ENABLED = true;
      console.log(
        `[execute] Vision services started (${handle.started.length} spawned, ` +
        `${handle.alreadyRunning} already healthy) — re-detection enabled.`
      );
    } else {
      REDETECT_ENABLED = false;
      console.warn('[execute] Failed to start Vision services — re-detection disabled.');
    }
    global.__shutdownVisionServices = () => shutdownVisionServices(handle);
  }
}

/**
 * Re-run YOLO+OCR+merge on a post-action screenshot via the gateway and
 * return the NEW visual state: full resolvable elements plus counters.
 * opts.conf is forwarded for servers that honor per-request confidence
 * (default mirrors YOLO_CONF=0.15 in detect.py); servers that ignore it
 * behave exactly as before.
 */
const DEFAULT_CONF = 0.15;
const LOWCONF_RETRY_CONF = 0.05;

function buildRedetectPayload(absScreenshotPath, opts) {
  const conf = opts && typeof opts.conf === 'number' && Number.isFinite(opts.conf)
    ? opts.conf
    : DEFAULT_CONF;
  const payload = { image_path: absScreenshotPath, conf };
  // M3 Fix A: top-band crop + upscale re-detect for faint empty inputs.
  if (opts && opts.cropTopband === true) payload.crop_topband = true;
  return payload;
}

async function redetectState(absScreenshotPath, opts) {
  if (!REDETECT_ENABLED) return null;
  // Services may still be warming up (YOLO model load) right after spawn —
  // retry with backoff before giving up.
  const attempts = 3;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const res = await axios.post(
        `${GATEWAY_URL}/vision/process`,
        buildRedetectPayload(absScreenshotPath, opts),
        { timeout: 90000 }
      );
      return {
        elements: res.data.element_count ?? null,
        ocr_words: res.data.raw?.ocr_words_found ?? null,
        top_texts: (res.data.elements || [])
          .filter((el) => el.text)
          .slice(0, 10)
          .map((el) => `${el.type}:${el.text}`)
          .join(' | '),
        elements_full: (res.data.elements || []).map((el) => ({
          id: el.id,
          type: el.type,
          text: el.text || '',
          conf: el.confidence ? Number(el.confidence.yolo.toFixed(2)) : null,
          cx: Math.round((el.bbox.x1 + el.bbox.x2) / 2),
          cy: Math.round((el.bbox.y1 + el.bbox.y2) / 2),
          bbox: el.bbox,
          synth: el.synth || null,
        })),
      };
    } catch (err) {
      console.warn(`[execute] Re-detection failed (attempt ${attempt}/${attempts}): ${err.message}`);
      if (attempt < attempts) {
        await new Promise((r) => setTimeout(r, 4000 * attempt));
        continue;
      }
      return null;
    }
  }
}

/** Merged visual-DOM evidence image for a re-detected state. */
async function renderMergedEvidence(absShot, elementsFull) {
  try {
    const annotations = (elementsFull || []).slice(0, 60).map((e) => ({
      bbox: [
        e.bbox?.x1 ?? e.cx - 20, e.bbox?.y1 ?? e.cy - 10,
        e.bbox?.x2 ?? e.cx + 20, e.bbox?.y2 ?? e.cy + 10,
      ],
      lines: [`${e.type} ${e.id}`, e.text || ''],
      color: [255, 200, 0],
    }));
    const res = await axios.post(
      `${YOLO_URL}/render_boxes`,
      { image_path: absShot, annotations },
      { timeout: 30000 }
    );
    return res.data.annotated_image_b64 || null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Target resolution against the CURRENT visual state
// ---------------------------------------------------------------------------

const { normalizeText, fuzzyTextMatch } = require('../../lib/fuzzyMatch');

const normTxt = normalizeText;

/**
 * Resolve a step's target on the CURRENT detected elements.
 * 1) type + OCR-text match (primary evidence)
 *    1a) exact normalized containment; 1b) fuzzy (edit-distance/token
 *        overlap — tolerates OCR noise like "lphone" vs "iphone")
 * 2) single controlled fallback: nearest same-type element within
 *    PROXIMITY_PX of the recorded coordinates
 * Never returns invented coordinates — only centers of detected elements.
 */
function resolveTarget(elements, step, proximityPx = 90, opts) {
  if (!Array.isArray(elements) || !elements.length) {
    return { resolved: false, reason: 'no_elements_in_current_state' };
  }
  const wantType = normTxt(step.target?.type || step.element_type || '');
  const wantText = normTxt(step.target?.text || '');

  let best = null;
  let bestScore = 0;
  for (const el of elements) {
    let score = 0;
    if (wantType && normTxt(el.type) === wantType) score += 2;
    if (wantText && el.text) {
      const et = normTxt(el.text);
      if (et.includes(wantText)) score += 3;
      else if (wantText.includes(et)) score += 2;
    }
    if (score > bestScore) { bestScore = score; best = el; }
  }
  if (bestScore >= 3) {
    return { resolved: true, via: 'text_match', element: best };
  }

  // Fuzzy tier: OCR variance across runs breaks exact family matching.
  // Accept type-compatible elements whose text fuzzily matches the target.
  if (wantText) {
    const fuzzy = [];
    for (const el of elements) {
      if (!el.text) continue;
      if (wantType && normTxt(el.type) !== wantType) continue;
      const m = fuzzyTextMatch(el.text, wantText);
      if (m.match) fuzzy.push({ el, m });
    }
    if (fuzzy.length) {
      fuzzy.sort((a, b) =>
        (a.m.editDistance - b.m.editDistance)
        || (b.m.overlap - a.m.overlap));
      return { resolved: true, via: `fuzzy_${fuzzy[0].m.via}`, element: fuzzy[0].el };
    }
  }

  // Controlled re-localization attempt #2: proximity of same/any type.
  // Q15 N7-option1 resolve-side (behind opts.driftFlag, default OFF =
  // today's behavior): a proximity fallback landing on a label_absent
  // (drift-tagged, OCR-anchored WEAK family) element resolves WEAK, mirroring
  // the ocr_anchor treatment. text_match stays primary above: class never
  // overrides a text hit.
  const near = elements
    .filter((el) => !wantType || normTxt(el.type) === wantType)
    .map((el) => ({ el, d: Math.hypot(el.cx - step.x, el.cy - step.y) }))
    .filter((x) => x.d <= proximityPx)
    .sort((a, b) => a.d - b.d)[0];
  if (near) {
    if (opts && opts.driftFlag && near.el && near.el.drift === 'label_absent') {
      return { resolved: true, via: 'proximity+label_drift', element: near.el };
    }
    return { resolved: true, via: 'proximity', element: near.el };
  }

  return { resolved: false, reason: `target not found in current state (wanted type="${wantType}" text="${wantText}")` };
}

// H1x block-wiring (pure, unit-tested): block verdict for the CURRENT page
// from live observables. Never throws — detector failure yields null (no
// verdict) rather than a misclassification. Callers attach the result to
// unresolved-target steps so BLOCKED-cause (wall) vs perception-miss reads
// straight off the step record.
function blockVerdict({ title, url, bodyText } = {}) {
  try {
    const r = classifyBlockPage({ title, status: 200, ocrText: '', bodyText, url });
    return { class: r.class, confidence: r.confidence };
  } catch (_) {
    return null;
  }
}

/** Inspect whatever interactive element sits at viewport coordinates (x,y). */

// ---------------------------------------------------------------------------
// R3-T5 executor hardening (5a/5b/5c). Pure helpers — offline-testable.
// ---------------------------------------------------------------------------

const CHECK_TYPE_RE = /checkbox|radio/;
const INPUT_CLASS_RE = /^(text_input|search_field|password|input)$/;

function dist2(ax, ay, bx, by) {
  return Math.hypot(ax - bx, ay - by);
}

function isCheckTarget(step) {
  const t = normTxt(step && step.target && step.target.type);
  return CHECK_TYPE_RE.test(t || '');
}

/**
 * 5a: resolve checkbox/radio by YOLO bbox center, never by label text
 * (labels are frequently OCR'd hint text, not the control). Nearest
 * same-class element within proximityPx of the recorded point wins; without
 * recorded coordinates exactly one candidate must exist.
 */
function resolveCheckTarget(elements, step, proximityPx = 90) {
  if (!Array.isArray(elements) || !elements.length) {
    return { resolved: false, reason: 'no_elements_in_current_state' };
  }
  const cands = elements.filter((el) => el && CHECK_TYPE_RE.test(normTxt(el.type) || ''));
  if (!cands.length) return { resolved: false, reason: 'no checkbox/radio in current state' };
  const px = Number(step && step.x);
  const py = Number(step && step.y);
  if (Number.isFinite(px) && Number.isFinite(py)) {
    const near = cands
      .map((el) => ({ el, d: dist2(el.cx, el.cy, px, py) }))
      .filter((x) => Number.isFinite(x.d) && x.d <= proximityPx)
      .sort((a, b) => a.d - b.d)[0];
    if (near) return { resolved: true, via: 'check_bbox', element: near.el };
    return { resolved: false, reason: `no checkbox/radio within ${proximityPx}px of recorded point` };
  }
  if (cands.length === 1) return { resolved: true, via: 'check_bbox', element: cands[0] };
  return { resolved: false, reason: 'ambiguous checkbox/radio without recorded coordinates' };
}

function checkToggled(before, after) {
  return Boolean(
    before && after &&
    typeof before.checked === 'boolean' && typeof after.checked === 'boolean' &&
    before.checked !== after.checked
  );
}

// P3 weak-flag: steps resolved via WEAK fallbacks (lowconf proximity,
// OCR-anchor synth, Q15 label-drift proximity) must be counted on the
// verdict, never hidden inside a plain PASS. crop_retry is a real YOLO
// detection and does NOT count weak.
const WEAK_VIA_RE = /(^|\+)(lowconf_retry|ocr_anchor|label_drift)(\+|$)/;

function weakStepCount(stepsExecuted) {
  if (!Array.isArray(stepsExecuted)) return 0;
  return stepsExecuted.filter((s) => s && s.ok === true &&
    WEAK_VIA_RE.test(String(s.resolution_via || ''))).length;
}

function weakVerdict(status, stepsExecuted) {
  const n = weakStepCount(stepsExecuted);
  return {
    weak_steps: n,
    verdict: status === 'PASS' && n > 0 ? `PASS_WEAK(${n})` : status,
  };
}

// H2 seeded-queue refill decision (pure): probes aligned with queue entries
// ({len} numbers, null when unreadable). total>0 -> proceed; empty queue or
// already refilled -> abort only when empty AND refilled (else proceed);
// empty + never refilled -> refill once.
function staleFillRecovery(queue, probeLens, alreadyRefilled) {
  const q = Array.isArray(queue) ? queue : [];
  if (!q.length) return 'proceed';
  const total = (Array.isArray(probeLens) ? probeLens : [])
    .reduce((n, len) => n + (Number.isFinite(len) && len > 0 ? len : 0), 0);
  if (total > 0) return 'proceed';
  return alreadyRefilled ? 'abort' : 'refill';
}

// B1 dom-disclose: every DOM-assisted actuation must say so on the step.
// Vision boundary marker is `click-by-vision:Y|N` (<=25 chars): Y = final
// click coords came from vision re-detect; N = DOM snapped them.
function domAssistTag({ snapped = false, focusSpaceUsed = false } = {}) {
  const parts = [];
  if (snapped) parts.push('domsnap');
  if (focusSpaceUsed) parts.push('focus-space');
  if (!parts.length) return { dom_assist: null, click_by_vision: 'Y' };
  return { dom_assist: parts.join('+'), click_by_vision: 'N' };
}

function domAssistCount(stepsExecuted) {
  if (!Array.isArray(stepsExecuted)) return 0;
  return stepsExecuted.filter((s) => s && s.ok === true &&
    typeof s.dom_assist === 'string' && s.dom_assist.length > 0).length;
}

/**
 * 5a retry ladder for an already-clicked (attempt 1) checkbox/radio whose
 * checked_state did not flip. attempt 2 = click again; attempt 3 =
 * focus-click + Space. Returns { toggled, attempts } with attempts counted
 * 1-based including the caller's first click. Collaborators are injected so
 * offline tests can mock them; every collaborator failure is swallowed and
 * surfaces as toggled:false (honest failure, never a throw).
 */
async function runCheckRetries({ before, probe, click, focusSpace }) {
  const snap = async () => {
    try {
      return await probe();
    } catch (_) {
      return null;
    }
  };
  const run = async (fn) => {
    try {
      await fn();
    } catch (_) { /* a failed retry is evidence, not a crash */ }
  };
  // The caller already performed attempt 1; probe before retrying.
  if (checkToggled(before, await snap())) return { toggled: true, attempts: 1 };
  await run(click);
  if (checkToggled(before, await snap())) return { toggled: true, attempts: 2 };
  await run(focusSpace);
  if (checkToggled(before, await snap())) return { toggled: true, attempts: 3 };
  return { toggled: false, attempts: 3 };
}

/**
 * 5b: lowered-confidence fill retry. Nearest input-class element within
 * proximityPx of the recorded point on the FRESH (re-detected) set —
 * text is ignored because low-conf OCR is exactly what failed. Never
 * returns stale coordinates: only centers of detected elements.
 */
function resolveLowConfFill(elements, step, proximityPx = 90) {
  if (!Array.isArray(elements) || !elements.length) {
    return { resolved: false, reason: 'no_elements_in_current_state' };
  }
  const px = Number(step && step.x);
  const py = Number(step && step.y);
  if (!Number.isFinite(px) || !Number.isFinite(py)) {
    return { resolved: false, reason: 'no recorded coordinates for lowconf retry' };
  }
  const near = elements
    .filter((el) => el && INPUT_CLASS_RE.test(normTxt(el.type) || ''))
    .map((el) => ({ el, d: dist2(el.cx, el.cy, px, py) }))
    .filter((x) => Number.isFinite(x.d) && x.d <= proximityPx)
    .sort((a, b) => a.d - b.d)[0];
  if (near) return { resolved: true, via: 'lowconf_retry', element: near.el };
  return { resolved: false, reason: `no input-class element within ${proximityPx}px` };
}

/** 5c: optional submitKey pressed after typing. Enter|Tab only, else null. */
function submitKeyPress(step) {
  const k = String((step && step.submitKey) || '').toLowerCase();
  if (k === 'enter') return 'Enter';
  if (k === 'tab') return 'Tab';
  return null;
}

async function probePoint(page, x, y) {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return page.evaluate(([px, py]) => {
    let el = document.elementFromPoint(px, py);
    if (!el) return null;
    // Clicks often land on the <label> wrapping/next-to a control; resolve
    // to the associated form control so value/checked stay observable.
    // (Standard HTMLLabelElement behaviour — site-independent.)
    if (el.tagName === 'LABEL' && el.control) el = el.control;
    const info = {
      tag: el.tagName ? el.tagName.toLowerCase() : '',
      inputType: el.getAttribute ? el.getAttribute('type') || '' : '',
    };
    if (typeof el.value === 'string') info.value = el.value.slice(0, 120);
    if (typeof el.checked === 'boolean') info.checked = el.checked;
    return info;
  }, [Math.round(x), Math.round(y)]);
}

/**
 * M2 FIX-A: snap a checkbox/radio click point to the native control center.
 * Perception boxes for toggles are often label-text boxes whose center misses
 * the 30-40px native input and lands on inert text (unassociated <label>).
 * Resolve via DOM: the point's own control, its label control, else the
 * nearest li's input.toggle/checkbox/radio center. Returns {x, y, snapped};
 * never throws — falls back to the recorded point.
 */
async function snapCheckToNativeInput(page, x, y) {
  try {
    const pt = await page.evaluate(([px, py]) => {
      const el = document.elementFromPoint(px, py);
      if (!el) return null;
      let ctrl = null;
      if (el.tagName === 'INPUT' && /checkbox|radio/i.test(el.getAttribute('type') || '')) {
        ctrl = el;
      } else if (el.tagName === 'LABEL' && el.control) {
        ctrl = el.control;
      } else {
        const scope = (el.closest && el.closest('li')) || document;
        ctrl = scope.querySelector('input[type="checkbox"],input[type="radio"],input.toggle');
      }
      if (!ctrl) return null;
      const r = ctrl.getBoundingClientRect();
      if (!r || !(r.width > 0) || !(r.height > 0)) return null;
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    }, [Math.round(x), Math.round(y)]);
    if (pt && Number.isFinite(pt.x) && Number.isFinite(pt.y)) {
      return { x: pt.x, y: pt.y, snapped: true };
    }
  } catch (_) { /* snap is evidence, not a crash */ }
  return { x, y, snapped: false };
}

async function getScrollY(page) {
  return page.evaluate(() => window.scrollY || 0).catch(() => 0);
}

// L1 contextmenu observation: arm installs a one-shot listener BEFORE the
// right-click; read returns the menu point {x, y} or null. The post-click
// re-detect observes any opened menu in the fresh vdom; menu-text assertion
// itself needs OCR (L2 lane), so this stays a coordinate observation.
async function armContextMenuProbe(page) {
  try {
    await page.evaluate(() => {
      window.__ctxMenu = null;
      window.addEventListener('contextmenu', (e) => {
        window.__ctxMenu = { x: e.clientX, y: e.clientY };
      }, { once: true });
    });
  } catch (_) { /* probe is evidence, not a crash */ }
}

async function readContextMenuProbe(page) {
  try {
    const r = await page.evaluate(() => window.__ctxMenu || null);
    if (r && Number.isFinite(r.x) && Number.isFinite(r.y)) return { x: r.x, y: r.y };
  } catch (_) { /* probe is evidence, not a crash */ }
  return null;
}

/**
 * Compare pre/post observable signals for one action and produce a
 * semantic verification signal (or null when nothing observable applies).
 */
function deriveStepSignal(step, before, after) {
  const action = step.action;
  if (action === 'fill' && after && typeof after.value === 'string' && after.value.length > 0) {
    return { method: 'input_value', detail: `field now holds "${after.value.slice(0, 40)}"` };
  }
  if (
    (action === 'click') &&
    before && after && typeof before.checked === 'boolean' && typeof after.checked === 'boolean' &&
    before.checked !== after.checked
  ) {
    return { method: 'checked_state', detail: `checkbox/radio toggled ${before.checked} -> ${after.checked}` };
  }
  if (action === 'navigate' || action === 'click') {
    // URL handled separately at test level; nothing here.
  }
  return null;
}
const DEFAULT_OUTPUT = path.join(OUTPUT_DIR, 'execution_results.json');
const VIEWPORT = { width: 1280, height: 900 };
const BODY_TEXT_MIN_LENGTH = 100;
const STEP_TIMEOUT_MS = 15000;

function parseArgs(argv) {
  const [testCasesPath, baseUrl, outPath] = argv;
  if (!testCasesPath || !baseUrl) {
    console.error(
      'Usage: node src/executeTests.js <test_cases.json> <base_url> [output_path]\n' +
        'Example: node src/executeTests.js storage/outputs/test_cases_ss_1787344345124_visual_dom.json https://demoqa.com'
    );
    process.exit(1);
  }
  return {
    testCasesPath: path.resolve(testCasesPath),
    baseUrl,
    outputPath: outPath ? path.resolve(outPath) : DEFAULT_OUTPUT,
  };
}

function loadTestCases(testCasesPath) {
  if (!fs.existsSync(testCasesPath)) {
    throw new Error(`Test cases file not found: ${testCasesPath}`);
  }
  const parsed = JSON.parse(fs.readFileSync(testCasesPath, 'utf8'));
  const testCases = Array.isArray(parsed) ? parsed : [parsed];
  const valid = testCases.filter(
    (tc) => tc && tc.id && Array.isArray(tc.steps)
  );
  if (!valid.length) {
    throw new Error('No valid test cases found (each needs id + steps[])');
  }
  return valid;
}

/**
 * K1 action-extensions: canonical test-item step actions (executor + mcp +
 * explorer TYPES share this exact set; anything else is UNSUPPORTED).
 */
const STEP_ACTIONS = new Set(['click', 'fill', 'navigate', 'scroll', 'done',
  'submit', 'key', 'select', 'check', 'uncheck',
  // K1 batch2.
  'hover', 'dblclick', 'press', 'wait', 'focus',
  // K1 batch3.
  'clear', 'upload', 'drag', 'snapshot', 'selectOption',
  // L1 right_click (W3 lane: executor+mcp wired; gate accepts).
  'right_click']);

function assertStepAction(action) {
  // K1: case-insensitive match returning the canonical member (selectOption).
  const low = String(action || '').toLowerCase();
  const hit = [...STEP_ACTIONS].find((a) => a.toLowerCase() === low);
  if (!hit) {
    throw new Error(`unsupported step action "${action}" (supported: ${[...STEP_ACTIONS].join(', ')})`);
  }
  return hit;
}

/**
 * Normalise a step into the shape llm.executeAction expects.
 * Generated test cases store navigate targets in `value`; executeAction
 * reads `url`, so translate here without touching the schema.
 */
function normaliseStep(step, baseUrl) {
  const action = assertStepAction(step.action);
  const normalised = { ...step, action };

  if (action === 'navigate') {
    const raw = step.url || step.value || '';
    try {
      normalised.url = new URL(raw, baseUrl).href;
    } catch {
      normalised.url = baseUrl;
    }
  }
  return normalised;
}

function expectsUrlChange(expectedResult) {
  return /url/i.test(expectedResult || '') &&
    /chang|navigat|different|away/i.test(expectedResult || '');
}

/**
 * Decide whether a test requires the URL to change.
 * Generated tests may state this explicitly via "expect_navigation";
 * older test files fall back to the expected_result text heuristic.
 */
function requiresUrlChange(testCase) {
  if (typeof testCase.expect_navigation === 'boolean') {
    return testCase.expect_navigation;
  }
  return expectsUrlChange(testCase.expected_result);
}

async function getBodyTextLength(page) {
  return page.evaluate(() => (document.body ? document.body.innerText.length : 0));
}

// F-A shortbody-gate (pure, unit-tested): a PROVEN expected-text transition
// (TC-has-expected_text AND absent-pre AND present-post) verifies MEDIUM as
// text_present and bypasses the body-length gate. Every other shape returns
// null and the legacy path owns the verdict — in particular pre-existing
// text never bypasses (no trivial pass).
function textPresentVerify(expectedText, bodyPre, bodyPost) {
  const exp = typeof expectedText === 'string' ? expectedText.trim().toLowerCase() : '';
  if (!exp) return null;
  const pre = String(bodyPre || '').toLowerCase();
  const post = String(bodyPost || '').toLowerCase();
  if (!pre.includes(exp) && post.includes(exp)) {
    return { method: 'text_present', baseline_chars: post.length };
  }
  return null;
}

async function runTestCase(page, testCase, baseUrl, beforeScreenshot, initialState) {
  const startedAt = Date.now();
  const urlBefore = page.url();
  // F-A: pre-action body text for the expected-text transition check.
  const bodyPreText = await page.evaluate(() =>
    (document.body ? document.body.innerText : '').slice(0, 2000)).catch(() => '');
  const executedSteps = [];
  const signals = [];
  const states = [];
  let lastState = initialState;
  const warnings = [];
  let status = 'PASS';
  let failureReason = null;
  let scrollBefore = null;
  let stalePrevented = 0;
  let unresolvedTargets = 0;
  let checkedStateFailure = null;
  // B2: true once a fill skipped its post-action capture (pool predates it).
  let poolStaleAfterFill = false;
  // H2: seeded fill queue for pre-submit refill-once (per test case).
  let seededQueue = [];
  let refilledOnce = false;

  // Current visual state (resolvable elements). Seeded from the pipeline's
  // initial visual DOM when available, else detected from the fresh capture.
  let currentElements = Array.isArray(initialState?.elements_full)
    ? initialState.elements_full
    : null;

  for (let i = 0; i < testCase.steps.length; i++) {
    const step = normaliseStep(testCase.steps[i], baseUrl);
    const stepStartedAt = Date.now();

    // ------------------------------------------------------------------
    // Closed-loop target resolution: coordinates must come from the
    // CURRENT visual state, never blindly from a previous one.
    // ------------------------------------------------------------------
    let execStep = { ...step };
    let resolvedElement = null;
    let resolutionVia = null;
    let stalePreventedThisStep = false;
    let lowconfRetry = false;
    let submitKeyPressed = null;
    let checkAttempts = 1;
    let checkOk = true;
    let checkSnap = false;
    let contextMenuSeen = null;

    if (REDETECT_ENABLED && ['click', 'fill', 'dblclick', 'right_click'].includes(step.action)) {
      if (!currentElements) {
        // One controlled detection of the current screen before acting.
        const absBefore = beforeScreenshot
          ? path.join(VISION_ROOT, beforeScreenshot)
          : null;
        const detected = absBefore ? await redetectState(absBefore) : null;
        if (detected?.elements_full) {
          currentElements = detected.elements_full;
        }
      }
      // 5a: checkbox/radio targets resolve by bbox center, never label text.
      let resolution = currentElements
        ? (isCheckTarget(step)
          ? resolveCheckTarget(currentElements, step)
          : resolveTarget(currentElements, step))
        : { resolved: false, reason: 're_detection_unavailable' };

      // 5b: unresolved fill -> one lowered-confidence re-detect of the SAME
      // screenshot, then nearest input-class within 90px (WEAK). Never stale.
      if (!resolution.resolved && step.action === 'fill') {
        const absBefore = beforeScreenshot
          ? path.join(VISION_ROOT, beforeScreenshot)
          : null;
        // M3 Fix A: crop-topband upscale re-detect FIRST (retag crop_retry),
        // before the weaker proximity fallback below.
        if (absBefore) {
          const crop = await redetectState(absBefore, { cropTopband: true });
          const pool = crop && Array.isArray(crop.elements_full) ? crop.elements_full : [];
          const hit = pool.length ? resolveTarget(pool, step) : null;
          if (hit && hit.resolved) {
            currentElements = pool;
            resolution = { ...hit, via: 'crop_retry' };
          }
        }
        if (!resolution.resolved) {
          const fresh = absBefore ? await redetectState(absBefore, { conf: LOWCONF_RETRY_CONF }) : null;
          const pool = fresh && Array.isArray(fresh.elements_full)
            ? fresh.elements_full
            : (currentElements || []);
          const retry = resolveLowConfFill(pool, step);
          if (retry.resolved) {
            if (fresh && Array.isArray(fresh.elements_full)) currentElements = fresh.elements_full;
            resolution = retry;
            lowconfRetry = true;
            warnings.push(`Step ${i + 1}: low-confidence fill retry (WEAK verification)`);
          }
        }
      }

      // M3 Fix B tag: OCR-anchor synth targets resolve WEAK — say so.
      if (resolution.resolved && resolution.element && resolution.element.synth === 'ocr_anchor') {
        resolution = { ...resolution, via: `${resolution.via || 'text_match'}+ocr_anchor` };
        warnings.push(`Step ${i + 1}: OCR-anchor synth target (WEAK verification)`);
      }

      if (!resolution.resolved) {
        // B2 safety net: the pool may predate skipped fill captures — one
        // fresh capture + re-detect before failing (saved as state_refresh).
        if (poolStaleAfterFill && ['click', 'fill'].includes(step.action)) {
          try {
            const relRefresh = nextStateName('refresh');
            const absRefresh = path.join(VISION_ROOT, await snap(page, relRefresh));
            const redetected = await redetectState(absRefresh);
            if (redetected && Array.isArray(redetected.elements_full) && redetected.elements_full.length) {
              currentElements = redetected.elements_full;
              poolStaleAfterFill = false;
              resolution = isCheckTarget(step)
                ? resolveCheckTarget(currentElements, step)
                : resolveTarget(currentElements, step);
            }
          } catch (_) { /* refresh is best-effort; fall through to FAIL */ }
        }
      }

      if (!resolution.resolved) {
        unresolvedTargets += 1;
        // H1x: classify the CURRENT page so a wall-block reads as
        // BLOCKED-cause, not perception-miss. Best-effort probes only.
        let block = null;
        try {
          const bt = await page.evaluate(() =>
            (document.body ? document.body.innerText : '').slice(0, 4000)).catch(() => '');
          const tt = (typeof page.title === 'function' ? await page.title().catch(() => '') : '');
          block = blockVerdict({ title: tt, url: page.url(), bodyText: bt });
          if (block && block.class !== 'ok') {
            warnings.push(`Step ${i + 1}: page classifies as ${block.class} (BLOCKED-cause, not perception-miss)`);
          }
        } catch (_) { /* no verdict is honest; the unresolved_target stands */ }
        executedSteps.push({
          index: i + 1,
          ...step,
          ok: false,
          error: 'unresolved_target',
          reason: resolution.reason,
          block,
          state_id: lastState?.state_id || null,
          duration_ms: Date.now() - stepStartedAt,
        });
        status = 'FAIL';
        failureReason =
          `Unresolved target at step ${i + 1} (${step.action}): ${resolution.reason}. ` +
          `No stale coordinates were clicked.`;
        console.warn(`[execute]   ${failureReason}`);
        break;
      }

      resolvedElement = {
        id: resolution.element.id,
        type: resolution.element.type,
        text: resolution.element.text || '',
        conf: resolution.element.conf,
        synth: resolution.element.synth || null,
      };
      resolutionVia = resolution.via;
      execStep.x = resolution.element.cx;
      execStep.y = resolution.element.cy;
      if (execStep.x !== step.x || execStep.y !== step.y) {
        stalePrevented += 1;
        stalePreventedThisStep = true;
      }
    }

    // M2 FIX-A: snap checkbox/radio clicks to the native control center so
    // label-text perception boxes (inert <label>, no control) cannot misland.
    // FIX-B rides along: focus+Space then targets the snapped input.
    if (step.action === 'click' && isCheckTarget(step) && resolvedElement) {
      const snap = await snapCheckToNativeInput(page, execStep.x, execStep.y).catch(() => null);
      if (snap && snap.snapped) {
        execStep.x = snap.x;
        execStep.y = snap.y;
        checkSnap = true;
        resolutionVia = `${resolutionVia || 'check_bbox'}+domsnap`;
      }
    }

    // Pre-action observable state.
    const pointProbeBefore = ['click', 'fill'].includes(step.action)
      ? await probePoint(page, execStep.x, execStep.y).catch(() => null)
      : null;
    // L1: arm the contextmenu listener BEFORE the right-click lands.
    if (step.action === 'right_click') await armContextMenuProbe(page);
    // H2 seeded-queue refill-once: before a click, re-probe every seeded
    // fill coord (lengths only); total 0 with an unrefilled queue refills
    // once from seeded values, still 0 aborts as value_lost (no blind click).
    if (step.action === 'click' && seededQueue.length) {
      const lens = [];
      for (const q of seededQueue) {
        try {
          const p = await probePoint(page, q.x, q.y).catch(() => null);
          lens.push(p && typeof p.value === 'string' ? p.value.length : 0);
        } catch (_) { lens.push(0); }
      }
      const decision = staleFillRecovery(seededQueue, lens, refilledOnce);
      if (decision === 'refill') {
        for (const q of seededQueue) {
          try {
            await executeAction(page, { action: 'fill', x: q.x, y: q.y, value: q.value, target: q.target });
          } catch (_) { /* one entry failing must not break the refill */ }
        }
        refilledOnce = true;
        warnings.push(`Step ${i + 1}: form values lost after fills — refilled once from seeded queue`);
      } else if (decision === 'abort') {
        status = 'FAIL';
        failureReason = `Step ${i + 1} (click): value_lost — form still empty after one refill; submit aborted`;
        console.warn(`[execute]   ${failureReason}`);
        executedSteps.push({
          index: i + 1,
          ...execStep,
          ok: false,
          error: 'value_lost',
          reason: failureReason,
          state_id_before: lastState?.state_id || null,
          duration_ms: Date.now() - stepStartedAt,
        });
        break;
      }
    }
    if (step.action === 'scroll') {
      scrollBefore = await getScrollY(page);
    }

    try {
      const stepUrlBefore = page.url();
      await executeAction(page, execStep);
      // L1: read back the armed contextmenu point (null = no menu observed).
      if (step.action === 'right_click') {
        contextMenuSeen = await readContextMenuProbe(page);
      }
      // T5a: the original click has happened; verify, then retry only if needed.
      if (step.action === 'click' && isCheckTarget(step)) {
        const checkResult = await runCheckRetries({
          before: pointProbeBefore,
          probe: () => probePoint(page, execStep.x, execStep.y),
          click: () => page.mouse.click(execStep.x, execStep.y),
          focusSpace: async () => {
            await page.evaluate(([px, py]) => {
              let el = document.elementFromPoint(px, py);
              if (el && el.tagName === 'LABEL' && el.control) el = el.control;
              if (el && typeof el.focus === 'function') el.focus();
            }, [Math.round(execStep.x), Math.round(execStep.y)]);
            await page.keyboard.press('Space');
          },
        });
        checkAttempts = checkResult.attempts;
        checkOk = checkResult.toggled;
        if (!checkOk) warnings.push(`Step ${i + 1}: checkbox/radio did not toggle after ${checkAttempts} attempts`);
      }
      // T5c: press only the explicitly requested allow-listed key after fill.
      if (step.action === 'fill') {
        submitKeyPressed = submitKeyPress(step);
        if (submitKeyPressed) await page.keyboard.press(submitKeyPressed);
        // H2: seed the refill queue (values stay in-memory only, per test).
        if (typeof execStep.value === 'string' && execStep.value) {
          seededQueue.push({ x: execStep.x, y: execStep.y, value: execStep.value, target: execStep.target });
        }
      }
      await page.waitForLoadState('domcontentloaded', { timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(500);
      // H2 fix (G5 lesson): seeded values belong to their page — navigation
      // retires the queue (probing old coords on a new page false-aborts).
      try {
        if (page.url() !== stepUrlBefore) {
          seededQueue = [];
          refilledOnce = false;
        }
      } catch (_) { /* url read must never break execution */ }

      // Post-action evidence: screenshot -> probe -> re-detect new visual state.
      // B2: fills skip the screenshot (probe input_value verifies instead);
      // the pool is then one fill stale until the next captured state.
      let afterScreenshot = null;
      let absShot = null;
      if (!needsAfterShot(step.action, submitKeyPressed) && step.action === 'fill') {
        ScreenMeter.skipped += 1;
        poolStaleAfterFill = true;
      } else {
        try {
          const relShot = nextStateName(`after_${step.action}`);
          afterScreenshot = await snap(page, relShot);
          absShot = path.join(VISION_ROOT, relShot);
        } catch (_) { /* evidence capture must never break execution */ }
      }

      const pointProbeAfter = ['click', 'fill'].includes(execStep.action)
        ? await probePoint(page, execStep.x, execStep.y).catch(() => null)
        : null;
      const sig = deriveStepSignal(execStep, pointProbeBefore, pointProbeAfter);
      if (sig) signals.push({ step: i + 1, ...sig });

      if (absShot) {
        const detected = await redetectState(absShot);
        if (detected) {
          const stateId = `state_${String(stateCounter).padStart(3, '0')}`;
          const entry = {
            state_id: stateId,
            screenshot: afterScreenshot,
            url: page.url(),
            elements: detected.elements,
            ocr_words: detected.ocr_words,
            merged_evidence: null,
          };

          // Merged YOLO+OCR evidence image for the NEW state.
          if (detected.elements_full?.length) {
            try {
              const b64 = await renderMergedEvidence(absShot, detected.elements_full);
              if (b64) {
                fs.writeFileSync(absShot.replace(/\.png$/, '_merged.png'), Buffer.from(b64, 'base64'));
                entry.merged_evidence = afterScreenshot.replace(/\.png$/, '_merged.png');
              }
            } catch (_) {}
          }

          if (lastState && typeof lastState.elements === 'number') {
            entry.elements_delta = detected.elements - lastState.elements;
          }
          states.push(entry);
          lastState = detected;
          currentElements = detected.elements_full || currentElements;
          poolStaleAfterFill = false;

          if (step.action === 'scroll' && scrollBefore !== null) {
            const scrollAfter = await getScrollY(page);
            if (scrollAfter !== scrollBefore) {
              signals.push({
                step: i + 1,
                method: 'scroll_position',
                detail: `scrollY ${scrollBefore} -> ${scrollAfter}`,
              });
            }
            scrollBefore = scrollAfter;
          }
        }
      }

      // B1 dom-disclose: name any DOM assistance on the step + boundary Y/N.
      const isCheckClick = isCheckTarget(step) && step.action === 'click';
      const assist = domAssistTag(isCheckClick
        ? { snapped: checkSnap, focusSpaceUsed: checkAttempts >= 3 }
        : {});
      executedSteps.push({
        index: i + 1,
        ...execStep,
        ok: true,
        before_screenshot: i === 0 ? beforeScreenshot : null,
        after_screenshot: afterScreenshot,
        signal: sig || null,
        resolved_element: resolvedElement,
        resolution_via: resolutionVia,
        checked_state_attempts: isCheckTarget(step) && step.action === 'click' ? checkAttempts : null,
        checked_state_verified: isCheckTarget(step) && step.action === 'click' ? checkOk : null,
        check_snap: isCheckTarget(step) && step.action === 'click' ? checkSnap : null,
        contextmenu_observed: step.action === 'right_click' ? contextMenuSeen : null,
        dom_assist: isCheckClick ? assist.dom_assist : null,
        vision_boundary: step.action === 'click' ? `click-by-vision:${assist.click_by_vision}` : null,
        submit_key_pressed: submitKeyPressed,
        low_confidence_retry: lowconfRetry,
        re_detected: Boolean(currentElements),
        stale_coordinates_prevented: stalePreventedThisStep,
        state_id_before: lastState?.state_id || null,
        duration_ms: Date.now() - stepStartedAt,
      });
      if (step.action === 'click' && isCheckTarget(step) && !checkOk) {
        checkedStateFailure = `Checkbox/radio did not toggle after ${checkAttempts} attempts at step ${i + 1}`;
        status = 'FAIL';
        failureReason = checkedStateFailure;
        break;
      }
    } catch (err) {
      executedSteps.push({
        index: i + 1,
        ...step,
        ok: false,
        error: err.message,
        duration_ms: Date.now() - stepStartedAt,
      });
      status = 'ERROR';
      failureReason = `Step ${i + 1} (${step.action}) failed: ${err.message}`;
      break;
    }
  }

  const urlAfter = page.url();
  const urlChanged = urlAfter !== urlBefore;
  const needUrlChange = requiresUrlChange(testCase);

  // How strong is the EXPECTATION? A strong expectation must never be
  // satisfied by weak (body-text) evidence.
  const strength = needUrlChange ? 'strong' : 'weak_or_neutral';

  // ------------------------------------------------------------------
  // Verification: strongest available observable evidence first.
  // ------------------------------------------------------------------
  let verification = { method: null, detail: null };
  let verificationStrength = 'none';

  if (status !== 'PASS') {
    verification = { method: 'skipped', detail: failureReason };
  } else if (needUrlChange) {
    verificationStrength = 'strong';
    if (urlChanged) {
      verification = { method: 'url_change', detail: `navigated to ${urlAfter}` };
    } else {
      status = 'FAIL';
      failureReason = `Expected URL to change but stayed on ${urlAfter}`;
      verification = { method: 'url_change', detail: failureReason };
    }
  } else {
    if (urlChanged && !needUrlChange) {
      warnings.push(`Unexpected navigation to ${urlAfter}`);
    }
    const rank = { input_value: 3, checked_state: 3, scroll_position: 2, visual_state_change: 2 };
    const best = signals
      .filter((s) => rank[s.method])
      .sort((a, b) => rank[b.method] - rank[a.method])[0] || null;

    if (best) {
      verification = { method: best.method, detail: best.detail };
      verificationStrength = rank[best.method] >= 3 ? 'strong' : 'moderate';
    } else {
      // F-A shortbody-gate: proven expected-text transition verifies MEDIUM
      // and bypasses the length gate below; else legacy owns the verdict.
      const postText = await page.evaluate(() =>
        (document.body ? document.body.innerText : '').slice(0, 2000)).catch(() => '');
      const tp = textPresentVerify(testCase.expected_text, bodyPreText, postText);
      if (tp) {
        verification = {
          method: 'text_present',
          detail: `expected text appeared post-action (baseline ${tp.baseline_chars} chars)`,
        };
        verificationStrength = 'moderate';
      } else {
      // Weak fallback only as a last resort — flagged, never silent.
      const textLength = await getBodyTextLength(page);
      if (textLength <= BODY_TEXT_MIN_LENGTH) {
        status = 'FAIL';
        failureReason = `No semantic signal and page body text too short (${textLength} chars)`;
        verification = { method: 'none', detail: failureReason };
      } else {
        const semanticHint = /value|fill|select|check|submit|validation|confirmation|appear|dropdown|modal|toggled|selected|accepted|enter/i
          .test(testCase.expected_result || '');
        if (semanticHint && states.length === 0) {
          status = 'FAIL';
          failureReason =
            'Semantic expectation could not be verified: no observable state change detected (body-text evidence is not sufficient)';
          verification = { method: 'none', detail: failureReason };
        } else {
          verification = {
            method: 'body_text_fallback',
            detail: 'no stronger observable signal available; body renders non-trivially',
          };
          verificationStrength = 'weak';
          warnings.push('Verification used weak body-text fallback (no semantic signal)');
        }
      }
      }
    }
  }

  // A failed checked-state oracle must not be overwritten by weaker evidence.
  if (checkedStateFailure) {
    status = 'FAIL';
    failureReason = checkedStateFailure;
    verification = { method: 'checked_state', detail: checkedStateFailure };
    verificationStrength = 'none';
  }

  // Optional static-text expectation (miss = warning, never a silent pass).
  if (
    status === 'PASS' &&
    typeof testCase.expected_text === 'string' &&
    testCase.expected_text.trim()
  ) {
    const bodyText = await page.evaluate(() =>
      document.body ? document.body.innerText : ''
    );
    if (!bodyText.toLowerCase().includes(testCase.expected_text.toLowerCase())) {
      warnings.push(`Expected text "${testCase.expected_text}" not found in rendered body`);
    }
  }

  // G2: value-oracle call (additive; P3 status/verdict ladder untouched).
  // result.verdict stays the executor flag; the oracle shape lives under
  // result.oracle as {verdict, app_outcome, snip300, ocr_count}.
  let oraclePageText = '';
  try {
    oraclePageText = await page.evaluate(
      () => (document.body ? document.body.innerText : '').slice(0, 2000)
    );
  } catch (_) { oraclePageText = ''; }
  const oracle = verdictFor(testCase, {
    urlChanged,
    pageText: oraclePageText,
    counter: null, // no generic counter source; per-flow callers pass their own
    ocrWords: lastState && typeof lastState.ocr_words === 'number' ? lastState.ocr_words : null,
    expectRejection: testCase.expect_rejection === true,
    expectedNav: typeof testCase.expect_navigation === 'boolean' ? testCase.expect_navigation : null,
    expectedText: testCase.expected_text,
  });

  // G2: oracle shape (verdict/app_outcome/snip300/ocr_count); legacy kept.
  return {
    id: testCase.id,
    objective: testCase.objective || '',
    expected_result: testCase.expected_result || '',
    evidence: testCase.evidence || null,
    inferred_behavior: testCase.inferred_behavior || null,
    expect_navigation: typeof testCase.expect_navigation === 'boolean'
      ? testCase.expect_navigation
      : null,
    expected_text: testCase.expected_text || null,
    status,
    // P3: weak-resolved steps ride on the verdict, never inside plain PASS.
    ...weakVerdict(status, executedSteps),
    // G2: oracle shape (verdict/app_outcome/snip300/ocr_count); legacy kept.
    oracle,
    failure_reason: failureReason,
    verification,
    verification_strength: verificationStrength,
    stale_coordinates_prevented: stalePrevented,
    unresolved_targets: unresolvedTargets,
    warnings,
    before_screenshot: beforeScreenshot,
    failure_screenshot: null,
    url_before: urlBefore,
    url_after: urlAfter,
    steps_executed: executedSteps,
    states_observed: states,
    duration_ms: Date.now() - startedAt,
  };
}

async function main() {
  const { testCasesPath, baseUrl, outputPath } = parseArgs(process.argv.slice(2));
  const testCases = loadTestCases(testCasesPath);

  const { runId, relDir } = deriveRunDir(testCasesPath);
  CURRENT_RUN.dir = relDir;
  CURRENT_RUN.id = runId;
  fs.mkdirSync(path.join(VISION_ROOT, relDir), { recursive: true });

  console.log(`[execute] Test cases: ${testCasesPath} (${testCases.length} tests)`);
  console.log(`[execute] Base URL:   ${baseUrl}`);
  console.log(`[execute] Run ID:     ${runId} (evidence: ${relDir.replace(/\\/g, '/')}/)`);

  await probeRedetectAvailability();

  // Baseline visual state from the pipeline's own visual DOM for this run.
  let initialState = null;
  try {
    const vdom = JSON.parse(
      fs.readFileSync(
        path.join(OUTPUT_DIR, `${runId}_visual_dom.json`), 'utf8')
    );
    initialState = {
      state_id: 'state_001',
      screenshot: (vdom.screenshots && vdom.screenshots.initial) || null,
      url: vdom.source_url || baseUrl,
      elements: vdom.element_count ?? null,
      ocr_words: vdom.raw?.ocr_words_found ?? null,
      elements_full: (vdom.elements || []).map((el) => ({
        id: el.id,
        type: el.type,
        text: el.text || '',
        conf: el.confidence ? Number(el.confidence.yolo.toFixed(2)) : null,
        cx: Math.round((el.bbox.x1 + el.bbox.x2) / 2),
        cy: Math.round((el.bbox.y1 + el.bbox.y2) / 2),
        bbox: el.bbox,
        synth: el.synth || null,
      })),
    };
    stateCounter = 1; // state_001 belongs to the pipeline capture
  } catch (_) { /* standalone execution without a pipeline run */ }

  // Headful by default (Review-3: operator observes runs). Set
  // VISION_HEADED=false to run headless.
  const HEADED = process.env.VISION_HEADED !== 'false';
  const browser = await chromium.launch({ headless: !HEADED, slowMo: HEADED ? 300 : 0 });
  const context = await browser.newContext({ viewport: VIEWPORT });

  const cleanup = async () => {
    try { await context.close(); } catch {}
    try { await browser.close(); } catch {}
    // Shut down any Vision services this run started (never external ones).
    if (typeof global.__shutdownVisionServices === 'function') {
      await global.__shutdownVisionServices();
      console.log('[execute] Vision services started by this run were shut down.');
    }
  };
  process.on('SIGINT', async () => {
    console.log('\n[execute] Interrupted — shutting down browser...');
    await cleanup();
    process.exit(130);
  });

  const results = [];
  const reportStartedAt = Date.now();
  ScreenMeter.reset();

  try {
    for (let i = 0; i < testCases.length; i++) {
      const testCase = testCases[i];
      console.log(`\n[execute] Test ${i + 1}/${testCases.length}: ${testCase.id}`);
      console.log(`[execute]   Objective: ${testCase.objective}`);

      const page = await context.newPage();
      let result;
      try {
        await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.setViewportSize(VIEWPORT).catch(() => {});
        await page.waitForTimeout(1000); // match capture settle behaviour
        let beforeScreenshot = null;
        try {
          beforeScreenshot = await snap(page, nextStateName(`before_${testCase.id}`));
        } catch (_) { /* evidence capture must never break execution */ }
        result = await runTestCase(page, testCase, baseUrl, beforeScreenshot, initialState);
        if (result.status !== 'PASS') {
          // Preserve the final failed state — never cleaned up.
          try {
            result.failure_screenshot = await snap(
              page,
              nextStateName(`failure_${testCase.id}`)
            );
          } catch (_) {}
        }
      } catch (err) {
        result = {
          id: testCase.id,
          objective: testCase.objective || '',
          expected_result: testCase.expected_result || '',
          evidence: testCase.evidence || null,
          inferred_behavior: testCase.inferred_behavior || null,
          expect_navigation: typeof testCase.expect_navigation === 'boolean'
            ? testCase.expect_navigation
            : null,
          expected_text: testCase.expected_text || null,
          status: 'ERROR',
          failure_reason: `Setup/navigation failed: ${err.message}`,
          warnings: [],
          url_before: baseUrl,
          url_after: page.url(),
          steps_executed: [],
          duration_ms: 0,
        };
      } finally {
        await page.close().catch(() => {});
      }

      results.push(result);
      const marker = result.verdict || result.status;
      console.log(`[execute]   Result: ${marker}${result.failure_reason ? ` — ${result.failure_reason}` : ''}`);
      for (const warning of result.warnings) {
        console.log(`[execute]   Warning: ${warning}`);
      }
    }
  } finally {
    await cleanup();
  }

  const passed = results.filter((r) => r.status === 'PASS').length;
  const failed = results.filter((r) => r.status === 'FAIL').length;
  const errors = results.filter((r) => r.status === 'ERROR').length;

  // Verification-quality accounting: what evidence backed each verdict.
  const verificationMethods = {};
  let unsupportedVerifications = 0;
  for (const r of results) {
    const m = r.verification?.method || 'unknown';
    verificationMethods[m] = (verificationMethods[m] || 0) + 1;
    if (m === 'body_text_fallback' || m === 'none') unsupportedVerifications += 1;
  }
  const warningCount = results.reduce((n, r) => n + (r.warnings?.length || 0), 0);
  const statesSeen = results.reduce((n, r) => n + (r.states_observed?.length || 0), 0);

  const report = {
    architecture: 'B',
    run_id: runId,
    evidence_dir: relDir.replace(/\\/g, '/'),
    re_detection_enabled: REDETECT_ENABLED,
    source_url: baseUrl,
    test_cases_file: testCasesPath,
    started_at: new Date(reportStartedAt).toISOString(),
    finished_at: new Date().toISOString(),
    total_duration_ms: Date.now() - reportStartedAt,
    summary: {
      total: results.length,
      passed,
      failed,
      errors,
      pass_rate: results.length ? Number((passed / results.length).toFixed(3)) : 0,
      multi_step_tests: results.filter(
        (r) => (r.steps_executed || []).length >= 2
      ).length,
      fill_actions: results.reduce(
        (n, r) => n + (r.steps_executed || []).filter((s) => s.action === 'fill').length, 0),
      scroll_actions: results.reduce(
        (n, r) => n + (r.steps_executed || []).filter((s) => s.action === 'scroll').length, 0),
      states_observed: statesSeen,
      verification_methods: verificationMethods,
      weak_verifications: unsupportedVerifications,
      stale_coordinates_prevented: results.reduce(
        (n, r) => n + (r.stale_coordinates_prevented || 0), 0),
      // P3: total WEAK-resolved steps across results (verdicts carry PASS_WEAK(n)).
      weak_count: results.reduce(
        (n, r) => n + (r.weak_steps || 0), 0),
      // B1: total DOM-assisted steps across results (steps carry dom_assist reason).
      dom_assist_count: results.reduce(
        (n, r) => n + domAssistCount(r.steps_executed || []), 0),
      unresolved_targets: results.reduce(
        (n, r) => n + (r.unresolved_targets || 0), 0),
      // B2: evidence screenshots per test (fills verify via probe instead).
      screens_taken: ScreenMeter.taken,
      screens_skipped: ScreenMeter.skipped,
      screens_per_test: results.length ? Number((ScreenMeter.taken / results.length).toFixed(3)) : 0,
      warnings: warningCount,
    },
    results,
  };

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));

  console.log('\n=========================================');
  console.log(`[execute] Suite finished: ${passed} passed, ${failed} failed, ${errors} errors (of ${results.length})`);
  console.log(`[execute] Report saved to ${outputPath}`);
  console.log('=========================================');

  return errors > 0 ? 1 : 0;
}

if (require.main === module) {
  main()
    .then((code) => process.exit(code))
    .catch((err) => {
      console.error('[execute] Fatal error:', err.message);
      process.exit(1);
    });
}

// Exported for offline unit tests only (script guards its own execution).
module.exports = {
  resolveTarget, normTxt,
  isCheckTarget, resolveCheckTarget, checkToggled, runCheckRetries,
  resolveLowConfFill, buildRedetectPayload, submitKeyPress,
  snapCheckToNativeInput, weakStepCount, weakVerdict,
  blockVerdict, textPresentVerify,
  domAssistTag, domAssistCount, armContextMenuProbe, readContextMenuProbe,
  needsAfterShot, ScreenMeter, staleFillRecovery,
  DEFAULT_CONF, LOWCONF_RETRY_CONF,
  STEP_ACTIONS, assertStepAction, normaliseStep,
};
