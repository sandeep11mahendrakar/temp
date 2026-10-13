'use strict';

/**
 * explorer.js — autonomous multi-page visual exploration for Architecture B.
 *
 * Starts from one URL and repeatedly:
 *   capture screenshot -> YOLO+OCR+merge (gateway) -> candidate actions
 *   -> LLM selects ONE action from the CURRENT state's candidate table
 *   -> Playwright executes it -> post-action screenshot -> re-detect
 *   -> fingerprint new state -> repeated? go back : adopt as current state
 *
 * Guarantees:
 *   - coordinates ALWAYS come from the freshly detected visual DOM of the
 *     state the action is taken in (the LLM only picks an element id;
 *     it can never supply stale or invented coordinates)
 *   - every state records url + normalized-text hash + element-signature hash
 *   - repeated states are skipped (action marked tried, browser goes back)
 *   - hard limits guarantee termination
 *
 * Outputs (per run_id):
 *   storage/screenshots/<run_id>/state_NNN_*.png   evidence
 *   storage/outputs/<run_id>_exploration_history.json
 *   storage/outputs/<run_id>_exploration_result.json
 *   storage/outputs/test_cases_<run_id>_exploration.json  (replayable workflows)
 */

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { chromium } = require('playwright');
const { callLLM, extractJSON, extractLastJSON } = require('./llm');

const VISION_ROOT = path.join(__dirname, '..');
const OUTPUT_DIR = path.join(VISION_ROOT, 'storage', 'outputs');
const SCREENSHOT_ROOT = path.join(VISION_ROOT, 'storage', 'screenshots');
const GATEWAY_URL = process.env.VISION_GATEWAY_URL || 'http://127.0.0.1:5000';
const YOLO_URL = process.env.YOLO_SERVICE_URL || 'http://127.0.0.1:5001';
const VIEWPORT = { width: 1280, height: 900 };

// Configurable exploration limits.
const LIMITS = {
  MAX_STEPS: Number(process.env.EXPLORE_MAX_STEPS) || 25,
  MAX_DEPTH: Number(process.env.EXPLORE_MAX_DEPTH) || 8,
  MAX_STATES: Number(process.env.EXPLORE_MAX_STATES) || 12,
  MAX_ACTIONS_PER_STATE: Number(process.env.EXPLORE_MAX_ACTIONS_PER_STATE) || 4,
  // Anti-laziness floor: "done" is not accepted before this many successful
  // transitions while untried candidates remain (bstackdemo quit after 4).
  MIN_STEPS: Number(process.env.EXPLORE_MIN_STEPS) || 6,
};

const CANDIDATE_TYPES = new Set([
  'button', 'link', 'text_input', 'select', 'checkbox', 'radiobox',
  'tab', 'menu', 'list_item', 'search_field', 'bottom_navigation',
]);
const ACTION_TYPES = new Set(['click', 'fill', 'scroll', 'navigate', 'submit', 'done']);

// Authenticated-seed support (runBoth.js --auth user pass).
const SEEDED_CREDS = (process.env.SEED_USERNAME && process.env.SEED_PASSWORD)
  ? { username: process.env.SEED_USERNAME, password: process.env.SEED_PASSWORD }
  : null;

// Goal-directed exploration (R3-T3): deterministic offline planner.
// The require is guarded — older checkouts without goalPlanner.js fall back
// to the exact goal-free behavior this file always had.
let goalPlanner = null;
try {
  goalPlanner = require('./goalPlanner');
} catch (_) {
  goalPlanner = null;
}

// Unparseable-output strikes (T1): 3 within one run terminates llm_unparseable.
// Reset per run next to clearLessons(). Test seam below (never used live).
let parseStrikes = 0;
let __callLLMOverride = null;
function __setCallLLM(fn) { __callLLMOverride = typeof fn === 'function' ? fn : null; }
function __resetParseStrikes() { parseStrikes = 0; }

// Reflexion-lite lesson buffer (R3-T7): deterministic verbal lessons from
// observed failures, kept to the last 3 (Reflexion truncates memory the same
// way). Zero LLM cost — lessons are written by the harness, not the model.
const LESSON_CAP = 3;
const lessonBuffer = [];
function noteLesson(text) {
  const t = String(text || '').trim();
  if (!t) return;
  if (!lessonBuffer.includes(t)) lessonBuffer.push(t);
  while (lessonBuffer.length > LESSON_CAP) lessonBuffer.shift();
}
function lessonBlock() {
  if (!lessonBuffer.length) return '';
  return lessonBuffer.map((t, i) => `${i + 1}. ${t}`).join('\n');
}
function clearLessons() {
  lessonBuffer.length = 0;
}

// Per-run LLM call trace (R3-T7 behavior monitoring): every action-selection
// call appends one JSON line (prompt phase block + raw response + decision).
// Best-effort; logging never breaks a run.
let runLogFile = null;
function setRunLogFile(p) {
  runLogFile = typeof p === 'string' && p.length ? p : null;
}
function logLLMCall(entry) {
  if (!runLogFile) return;
  try {
    require('fs').appendFileSync(runLogFile, JSON.stringify(entry) + '\n', 'utf8');
  } catch (_) { /* ignore */ }
}

/** Build the phase plan at exploration start. Null = no goal / no planner. */
function buildGoalPlan() {  const goal = (process.env.EXPLORE_GOAL || '').trim();
  if (!goal || !goalPlanner) return null;
  try {
    const plan = goalPlanner.planGoal(goal);
    if (!plan || !Array.isArray(plan.phases) || !plan.phases.length) return null;
    return plan;
  } catch (_) {
    return null;
  }
}

function currentOpenPhase(plan) {
  if (!plan || !Array.isArray(plan.phases)) return null;
  return plan.phases.find((p) => !p.done) || null;
}

function donePhaseIds(plan) {
  if (!plan || !Array.isArray(plan.phases)) return [];
  return plan.phases.filter((p) => p.done).map((p) => p.id);
}

/** Block appended to every action-selection prompt while a goal is active. */
function goalPromptBlock(plan) {
  if (!plan) return '';
  const open = currentOpenPhase(plan);
  const done = donePhaseIds(plan);
  const lines = [`GOAL: ${plan.goal}`];
  lines.push(`CURRENT PHASE: ${open ? `${open.id} — ${open.name}` : '(all phases complete)'}`);
  lines.push(`COMPLETED PHASES: ${done.length ? done.join(', ') : '(none yet)'}`);
  if (open) {
    lines.push('Work toward the CURRENT PHASE with an element from the table. Do NOT output "done" while a phase is still open.');
  }
  return lines.join('\n');
}

/** Observation from post-action observables only — never LLM self-report. */
function buildObservation({ urlBefore, urlAfter, pageText, inputVerified, inputFieldKey, actionFailed } = {}) {
  const obs = {};
  if (typeof urlBefore === 'string') obs.urlBefore = urlBefore;
  if (typeof urlAfter === 'string') obs.urlAfter = urlAfter;
  if (typeof pageText === 'string' && pageText.length) obs.pageText = pageText;
  if (inputVerified === true) {
    obs.inputVerified = true;
    if (typeof inputFieldKey === 'string' && inputFieldKey.trim()) obs.inputFieldKey = inputFieldKey.trim();
  }
  if (actionFailed === true) obs.actionFailed = true;
  return obs;
}

/**
 * Advance the current open phase against Lane R3-T2's real contract:
 * advancePhase(phase, obs) -> true | false | { blocked, reason }.
 * No new planner APIs are used here.
 */
function advanceGoalPhase(plan, observation) {
  const open = currentOpenPhase(plan);
  if (!open || !goalPlanner) return { advanced: false, blocked: null };
  let res = false;
  try {
    res = goalPlanner.advancePhase(open, observation || {});
  } catch (_) {
    return { advanced: false, blocked: null };
  }
  if (res && typeof res === 'object' && res.blocked) {
    return { advanced: false, blocked: res.reason || 'goal phase stuck' };
  }
  return { advanced: res === true, blocked: null };
}

/** "done" is acceptable only when no goal phase is still open. */
function isDoneAllowed(plan) {
  if (!plan) return true;
  return currentOpenPhase(plan) === null;
}

/**
 * Observable fill verification (input_value): read back the targeted field
 * from the live DOM. Never assumed — an unreadable/empty value is false.
 */
async function probeFillValue(page, x, y, expected) {
  try {
    const val = await page.evaluate(([px, py]) => {
      let el = document.elementFromPoint(px, py);
      if (!el) return null;
      if (el.tagName === 'LABEL' && el.control) el = el.control;
      const t = el.tagName ? el.tagName.toLowerCase() : '';
      if ((t === 'input' || t === 'textarea') && typeof el.value === 'string') {
        return el.value.slice(0, 120);
      }
      return null;
    }, [Math.round(x), Math.round(y)]);
    if (typeof val !== 'string' || !val.length) return false;
    if (typeof expected === 'string' && expected.length) {
      const v = val.toLowerCase();
      const e = expected.toLowerCase();
      return v.includes(e) || e.includes(v);
    }
    return true;
  } catch (_) {
    return false;
  }
}

function hashStr(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}
const normText = (t) => String(t || '').replace(/\s+/g, ' ').trim().toLowerCase();

async function redetect(imagePath) {
  const res = await axios.post(
    `${GATEWAY_URL}/vision/process`,
    { image_path: imagePath },
    { timeout: 90000 }
  );
  return res.data;
}

async function renderMergedEvidence(absShot, elements) {
  try {
    const annotations = (elements || []).slice(0, 60).map((el) => ({
      bbox: [el.bbox.x1, el.bbox.y1, el.bbox.x2, el.bbox.y2],
      lines: [`${el.type} ${el.id}`, el.text || ''],
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

function tier(conf) {
  if (conf >= 0.6) return 'HIGH';
  if (conf >= 0.3) return 'MEDIUM';
  return 'LOW';
}

/** Keys of inputs already filled with a non-empty value on this fingerprint. */
function filledKeysForState(transitions, fp) {
  const s = new Set();
  for (const t of transitions || []) {
    if (!t || t.from_fingerprint !== fp) continue;
    const a = t.action || {};
    if (a.type === 'fill' && typeof a.value === 'string' && a.value.length) {
      s.add(`${a.elementType}|${normText(a.elementText)}|${a.x},${a.y}`);
    }
  }
  return s;
}

/** Password-aware value for a guard fill (prompt rule 4, deterministic). */
function resolveGuardValue(cand, peers) {
  const t = normText(cand.text);
  if (/pass|pwd|secret/.test(t)) return process.env.SEED_PASSWORD || 'TestPass123!';
  const ordered = (peers || []).slice().sort((a, b) => a.y - b.y);
  if (ordered.length >= 2 && ordered[ordered.length - 1].elementId === cand.elementId) {
    return process.env.SEED_PASSWORD || 'TestPass123!';
  }
  return process.env.SEED_USERNAME || 'test_user';
}

/**
 * First still-empty, untried text input on this state (top-to-bottom).
 * alreadyTried inputs are skipped so the guard can never loop forever on an
 * unfillable field — the submit then proceeds and the outcome stays honest.
 */
function pickUnfilledInput(candidates, transitions, fp) {
  const filled = filledKeysForState(transitions, fp);
  const inputs = (candidates || [])
    .filter((c) => (c.type === 'text_input' || c.type === 'search_field') && !c.alreadyTried);
  const open = inputs
    .filter((c) => !filled.has(`${c.type}|${normText(c.text)}|${c.x},${c.y}`));
  if (!open.length) return null;
  open.sort((a, b) => a.y - b.y);
  const first = open[0];
  // Peers = ALL inputs on screen (filled or not): position only makes sense
  // against the full stacked pair, not the filtered remainder.
  return { candidate: first, value: resolveGuardValue(first, inputs) };
}

/**
 * Form-cluster batching (R3-T8 TASK B): all still-empty sibling inputs in
 * ONE interception. S1 showed one-fill-per-step thrash: OCR gives every
 * input empty text, so the guard refilled the username 6x and the password
 * never landed. Batching fills the whole visible cluster (top-to-bottom,
 * password-aware per field) across consecutive no-LLM steps.
 */
const GUARD_ROW_TOL_PX = 16;
const GUARD_MAX_BATCH = 4;

function groupInputsByRow(inputs) {
  const ordered = (inputs || []).slice().sort((a, b) => a.y - b.y || a.x - b.x);
  const rows = [];
  for (const c of ordered) {
    const last = rows[rows.length - 1];
    if (last && Math.abs(c.y - last[0].y) <= GUARD_ROW_TOL_PX) last.push(c);
    else rows.push([c]);
  }
  return rows;
}

function pickSeededLoginBatch(candidates, transitions, fp, phase, creds = SEEDED_CREDS) {
  if (!phase || phase.id !== 'login-fill' || !creds ||
      typeof creds.username !== 'string' || !creds.username.trim() ||
      typeof creds.password !== 'string' || !creds.password.trim()) return [];
  const filled = filledKeysForState(transitions, fp);
  const inputs = (candidates || []).filter((c) =>
    c && (c.type === 'text_input' || c.type === 'search_field') && !c.alreadyTried);
  const open = inputs.filter((c) =>
    !filled.has(`${c.type}|${normText(c.text)}|${c.x},${c.y}`));
  const reps = groupInputsByRow(open).map((row) => row[0])
    .filter(Boolean).sort((a, b) => a.y - b.y);
  if (reps.length < 2) return [];
  const password = reps.find((c) => /pass|pwd|secret/.test(normText(c.text))) || reps[reps.length - 1];
  const username = reps.find((c) => c !== password && /user|email|login|account/.test(normText(c.text)))
    || reps.find((c) => c !== password);
  if (!username || !password || username === password) return [];
  return [
    { candidate: username, value: creds.username },
    { candidate: password, value: creds.password },
  ].sort((a, b) => a.candidate.y - b.candidate.y);
}

function pickUnfilledInputBatch(candidates, transitions, fp, maxBatch) {
  const filled = filledKeysForState(transitions, fp);
  const inputs = (candidates || [])
    .filter((c) => (c.type === 'text_input' || c.type === 'search_field') && !c.alreadyTried);
  const open = inputs
    .filter((c) => !filled.has(`${c.type}|${normText(c.text)}|${c.x},${c.y}`));
  if (!open.length) return [];
  const cap = typeof maxBatch === 'number' && maxBatch > 0 ? maxBatch : GUARD_MAX_BATCH;
  // One representative per visual row (fragments of one field share a row);
  // values resolved against the FULL on-screen set so top/bottom is correct.
  const reps = groupInputsByRow(open).slice(0, cap).map((row) => row[0]);
  return reps.map((rep) => ({ candidate: rep, value: resolveGuardValue(rep, inputs) }));
}

// Pending batch fills: drained one per loop iteration with ZERO extra LLM
// calls (coords stay valid — fills never navigate). Reset per run.
const guardFillQueue = [];
function clearGuardQueue() {
  guardFillQueue.length = 0;
}

/** Candidate action table from the CURRENT visual DOM only. */
function buildCandidates(vdom, triedKeys, failCounts, fingerprint) {
  const list = (vdom.elements || [])
    .filter((el) => CANDIDATE_TYPES.has(el.type))
    .filter((el) => !(el.confidence && el.confidence.yolo < 0.3 && !el.text)) // LOW without OCR text excluded
    .map((el) => {
      const x = Math.round((el.bbox.x1 + el.bbox.x2) / 2);
      const y = Math.round((el.bbox.y1 + el.bbox.y2) / 2);
      const familyKey = `${el.type}|${normText(el.text)}`;
      // Key format MUST match the store side: `${fingerprint}|${_key}`.
      const triedKey = `${fingerprint}|${el.type}|${normText(el.text)}|${x},${y}`;
      return {
        elementId: el.id,
        type: el.type,
        text: (el.text || '').slice(0, 40),
        conf: el.confidence ? Number(el.confidence.yolo.toFixed(2)) : null,
        tier: tier(el.confidence ? el.confidence.yolo : 0),
        x, y,
        alreadyTried: triedKeys.has(triedKey),
        // Elements whose (type,text) family repeatedly failed exploration
        // (repeated/invalid outcomes) are excluded across ALL pages.
        familyFailures: failCounts.get(familyKey) || 0,
        _key: `${el.type}|${normText(el.text)}|${x},${y}`,
      };
    })
    .filter((c) => c.tier !== 'LOW' || c.text)
    .filter((c) => c.familyFailures < 2);

  // Never re-offer a candidate that already failed on this state while an
  // untried one remains — repeated no-progress clicks are not acceptable.
  const untried = list.filter((c) => !c.alreadyTried);
  const finalList = untried.length ? untried : list;

  const rank = { HIGH: 0, MEDIUM: 1 };
  finalList.sort((a, b) => (rank[a.tier] - rank[b.tier]) || a.alreadyTried - b.alreadyTried);
  return finalList.slice(0, 15);
}

async function selectActionLLM(candidates, contextSummary, goalPlan) {
  const candidateTable = JSON.stringify(
    candidates.map(({ _key, ...rest }) => rest), null, 2);

  const goalSection = goalPlan
    ? `\nGOAL DIRECTIVE:\n${goalPromptBlock(goalPlan)}\n`
    : '';
  const lessonSection = lessonBlock()
    ? `\nLESSONS FROM THIS RUN (learned from failures above — do not repeat them):\n${lessonBlock()}\n`
    : '';

  const buildPrompt = (forbidDone) => `You are an autonomous visual web-exploration agent. Below are the interactive elements DETECTED ON THE CURRENT SCREEN (YOLO + OCR). Choose exactly ONE next action.

CURRENT SCREEN CANDIDATES (elementId, type, text, confidence tier, centre coordinates, alreadyTried):
${candidateTable}

EXPLORATION CONTEXT:
${contextSummary}${goalSection}${lessonSection}
RULES:
0. THOUGHT FIRST (ReflAct): in "thought", state in ONE sentence how the CURRENT screen relates to the CURRENT PHASE (which phase is open, what on-screen evidence shows progress or blockage) — THEN choose the action. An action that contradicts your own thought is always wrong.
1. Coordinates are FIXED by the table — choose an elementId; never invent coordinates.
2. Prefer elements with alreadyTried=false. NEVER repeat an alreadyTried element on this screen unless nothing else remains.
3. "fill": pick a text input; value must match its placeholder/label meaning. If the screen shows example credentials (e.g. standard_user / secret_sauce), use EXACTLY those values.
4. FORM COMPLETION: if a form has several required fields (e.g., username AND password), each new "fill" must target a DIFFERENT still-empty field. Never re-fill the same field while another required field of the same form is untouched. Fill ALL fields BEFORE clicking submit/login. If two similar stacked single-line inputs exist (typical login form), the TOP input is the username and the BOTTOM input is the password — give each its OWN matching credential from the on-screen text (never the same value in both).
5. Links/buttons labelled like site sections usually navigate (good for exploring NEW pages).
6. Use "scroll" when content below the fold is plausible and few unexplored candidates remain.
7. Choose "done" ONLY when no unexplored meaningful action remains.${SEEDED_CREDS ? `\n8. SEEDED CREDENTIALS for this site: username="${SEEDED_CREDS.username}" password="${SEEDED_CREDS.password}". Use EXACTLY these values when filling login/signup fields.` : ''}${forbidDone ? `\n${SEEDED_CREDS ? 9 : 8}. IMPORTANT: untried candidates ARE available — "done" is NOT acceptable right now. Pick one untried element.` : ''}
Respond ONLY with raw JSON: {"thought":"<one sentence: current screen vs current phase>","action":"click"|"fill"|"scroll"|"navigate"|"submit"|"done","elementId":"<id from table or null>","value":"<text for fill>","reason":"<one sentence>"}`;

  const decide = async (forbidDone) => {
    const llmCall = __callLLMOverride || callLLM;
    const prompt = buildPrompt(forbidDone);
    // T1: 1800 tokens — reasoning models starve JSON at 400 (thought text
    // eats the budget and the object truncates).
    let raw = await llmCall(prompt, { maxTokens: 1800 });
    // T1: last-balanced-object first (thought prefix + trailing prose).
    let obj = typeof raw === 'string' ? (extractLastJSON(raw) || extractJSON(raw)) : raw;
    if ((!obj || typeof obj !== 'object') && typeof raw === 'string') {
      raw = await llmCall(`JSON ONLY. NO ANALYSIS. FIRST CHAR {\n${prompt}`, { maxTokens: 1800 });
      obj = extractLastJSON(raw) || extractJSON(raw);
    }
    const metaOut = (!__callLLMOverride && callLLM.lastMeta) || null;
    const phaseId = goalPlan && currentOpenPhase(goalPlan) ? currentOpenPhase(goalPlan).id : null;
    if (!obj || typeof obj !== 'object') {
      // T1 honest-unknown: NEVER done, lesson recorded, strike counted.
      parseStrikes += 1;
      noteLesson('Model output was not parseable JSON — reply with the JSON object first, no analysis text.');
      logLLMCall({
        ts: new Date().toISOString(),
        forbidDone: Boolean(forbidDone),
        goalPhase: phaseId,
        lessons: lessonBuffer.slice(),
        raw: typeof raw === 'string' ? raw.slice(0, 2000) : '[non-string]',
        metaOut,
        parseStrikes,
        decision: { action: 'unknown', elementId: null, value: '', thought: '' },
      });
      return { action: 'unknown', candidate: null, value: '', reason: 'unparseable', thought: '', strikes: parseStrikes };
    }
    let action = String(obj.action || '').toLowerCase();
    if (!ACTION_TYPES.has(action)) action = 'unknown'; // NEVER silently done
    const chosen = candidates.find((c) => c.elementId === obj.elementId)
      || candidates.find((c) => normText(c.text) && obj.value && normText(c.text).includes(normText(obj.value)));
    const thought = typeof obj.thought === 'string' ? obj.thought.slice(0, 300) : '';
    logLLMCall({
      ts: new Date().toISOString(),
      forbidDone: Boolean(forbidDone),
      goalPhase: phaseId,
      lessons: lessonBuffer.slice(),
      raw: typeof raw === 'string' ? raw.slice(0, 2000) : '[non-string]',
      metaOut,
      decision: { action, elementId: chosen ? chosen.elementId : null, value: typeof obj.value === 'string' ? obj.value : '', thought },
    });
    return {
      action,
      candidate: action === 'click' || action === 'fill' || action === 'submit' ? chosen || null : null,
      value: typeof obj.value === 'string' ? obj.value : '',
      reason: typeof obj.reason === 'string' ? obj.reason : '',
      thought,
      strikes: parseStrikes,
    };
  };

  const goalHoldsDone = Boolean(goalPlan) && !isDoneAllowed(goalPlan);
  const first = await decide(goalHoldsDone ? true : false);
  // Anti-laziness guard: refuse "done" while untried candidates remain.
  // A goal with open phases also refuses "done" (R3-T3 long-horizon rule).
  if (first.action === 'done' && (candidates.some((c) => !c.alreadyTried) || goalHoldsDone)) {
    console.log('[explore] LLM said done but work remains (untried candidates or open goal phases) — reprompting.');
    return decide(true);
  }
  return first;
}

/** Replayable workflow paths recovered from the recorded state tree. */
function workflowsFromStates(states) {
  const byId = new Map(states.map((s) => [s.state_id, s]));
  const children = new Map();
  for (const s of states) {
    if (!s.parent_state_id) continue;
    if (!children.has(s.parent_state_id)) children.set(s.parent_state_id, []);
    children.get(s.parent_state_id).push(s.state_id);
  }
  const leaves = states.filter((s) => !children.has(s.state_id) && s.parent_state_id);
  const paths = [];
  for (const leaf of leaves) {
    const chain = [];
    let cur = leaf;
    while (cur && cur.parent_state_id) {
      // Carry the landed-on URL with each step: the assembler derives
      // honest navigation expectations from the URL span (R3-T9).
      chain.unshift({ ...(cur.leading_action || {}), stateUrl: cur.url || null });
      cur = byId.get(cur.parent_state_id);
    }
    if (chain.length >= 2) paths.push(chain.slice(0, 10));
  }
  // Deduplicate identical step sequences.
  const seen = new Set();
  return paths.filter((p) => {
    const k = JSON.stringify(p);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/**
 * Honest navigation expectation from a step chain's recorded URL span.
 * Pure + deterministic (R3-T9). Returns { navigated, route }.
 */
function navigationExpectation(steps) {
  const urls = [...new Set((steps || []).map((s) => s && s.stateUrl).filter(Boolean))];
  return {
    navigated: urls.length > 1,
    route: urls.length ? ` Route: ${urls.join(' -> ')}.` : '',
  };
}

/**
 * Distill a recorded chain to phase-relevant steps (R3-T8 TASK C, W3).
 * RUN_ANALYSIS R3: undistilled goal tests replay exploratory junk clicks
 * (e.g. the stray degree-sign button). Keeps fills + submits always, plus
 * clicks/navigates whose element text matches a goal phase success signal;
 * drops scrolls and empty-text decorative clicks. Pure + deterministic.
 * Null plan (goal-free runs) returns the chain untouched. Never returns an
 * empty or single-step chain from a longer one — falls back to the original.
 */
function distillGoalSteps(chain, goalPlan) {
  const steps = Array.isArray(chain) ? chain.slice() : [];
  if (!steps.length) return [];
  if (!goalPlan || !Array.isArray(goalPlan.phases)) return steps;
  const signals = [];
  for (const p of goalPlan.phases) {
    if (p && Array.isArray(p.successSignals)) {
      for (const s of p.successSignals) {
        const t = normText(s);
        if (t) signals.push(t);
      }
    }
  }
  const kept = steps.filter((s) => {
    const action = String((s && s.action) || '').toLowerCase();
    if (action === 'fill' || action === 'submit') return true;
    if (action === 'scroll') return false;
    const text = normText(s && s.elementText);
    if (!text) return false; // decorative/empty-text clicks are never phase evidence
    if (!/[a-z0-9]/i.test(text)) return false; // single-glyph junk (R3-T9: the stray ° button)
    return signals.some((sig) => text.includes(sig) || sig.includes(text));
  });
  return kept.length >= 2 ? kept : steps;
}

async function runExploration({ url, runId }) {
  runId = runId || `run_${Date.now()}`;
  const runDirAbs = path.join(SCREENSHOT_ROOT, runId);
  const relDir = path.join('storage', 'screenshots', runId);
  fs.mkdirSync(runDirAbs, { recursive: true });
  clearLessons();
  clearGuardQueue();
  __resetParseStrikes();
  setRunLogFile(path.join(OUTPUT_DIR, `${runId}_llm_calls.jsonl`));

  const startedAt = Date.now();
  const states = [];
  const transitions = [];
  const warnings = [];
  const visitedFingerprints = new Map(); // fingerprint -> state_id
  const triedActions = new Set();         // `${fingerprint}|${type}|${x},${y}`
  const actionsPerState = new Map();      // fingerprint -> count
  const failCounts = new Map();           // `${type}|${normText}` -> failed outcome count

  // Headful by default (Review-3: operator observes runs). Set
  // VISION_HEADED=false to run headless.
  const HEADED = process.env.VISION_HEADED !== 'false';
  const browser = await chromium.launch({ headless: !HEADED, slowMo: HEADED ? 300 : 0, timeout: 90000 });
  const page = await browser.newPage({ viewport: VIEWPORT });
  let stateCounter = 0;

  // Scope guard baseline: exploration must never leave the target site's
  // origin. Seen live on the-internet (B followed footer links to github.com
  // and typed into GitHub's login form) — unacceptable behavior.
  let START_ORIGIN = '';
  try { START_ORIGIN = new URL(url).origin; } catch (_) {}

  // Goal-directed plan (R3-T3). Null when no --goal/EXPLORE_GOAL or when the
  // planner module is absent — exploration then behaves exactly as before.
  let goalPlan = buildGoalPlan();
  let goalRetired = false;
  let goalBlocked = null;
  const activeGoal = () => (goalPlan && !goalRetired ? goalPlan : null);
  const noteGoal = (res) => {
    if (res && res.blocked) {
      goalBlocked = res.blocked;
      goalRetired = true;
      warnings.push(`Goal blocked: ${res.blocked}`);
      console.log(`[explore] Goal blocked: ${res.blocked} — continuing goal-free.`);
    }
  };
  if (goalPlan) {
    console.log(`[explore] GOAL: ${goalPlan.goal} (${goalPlan.phases.length} phases)`);
  }

  const nextStateName = (suffix) =>
    path.join(relDir, `state_${String(++stateCounter).padStart(3, '0')}_${suffix}.png`);

  async function captureState(label, leadingAction, parentId) {
    const shotRel = nextStateName(label);
    const shotAbs = path.join(VISION_ROOT, shotRel);
    await page.screenshot({ path: shotAbs });
    const vdom = await redetect(shotAbs);
    const visibleText = await page.evaluate(() =>
      (document.body ? document.body.innerText : '').slice(0, 4000)).catch(() => '');
    const elemSig = (vdom.elements || [])
      .map((e) => `${e.type}:${normText(e.text)}`)
      .sort()
      .join('|');
    const fingerprint = `${page.url()}|${hashStr(normText(visibleText))}|${hashStr(elemSig)}`;
    const mergedB64 = await renderMergedEvidence(shotAbs, vdom.elements);
    if (mergedB64) {
      try { fs.writeFileSync(shotAbs.replace(/\.png$/, '_merged.png'), Buffer.from(mergedB64, 'base64')); } catch (_) {}
    }
    const state = {
      state_id: `state_${String(stateCounter).padStart(3, '0')}`,
      parent_state_id: parentId || null,
      url: page.url(),
      screenshot: shotRel.replace(/\\/g, '/'),
      merged_evidence: mergedB64 ? shotRel.replace(/\\/g, '/').replace(/\.png$/, '_merged.png') : null,
      yolo_detections: vdom.raw?.yolo_detections ?? null,
      ocr_words: vdom.raw?.ocr_words_found ?? null,
      element_count: vdom.element_count ?? null,
      fingerprint,
      leading_action: leadingAction || null,
      timestamp: new Date().toISOString(),
    };
    return { state, vdom, fingerprint, visibleText };
  }

  let terminationReason = 'max_steps_reached';
  let current = null;
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.setViewportSize(VIEWPORT).catch(() => {});
    await page.waitForTimeout(2000);

    current = await captureState('initial', null, null);
    visitedFingerprints.set(current.fingerprint, current.state.state_id);
    states.push(current.state);
    console.log(`[explore] ${current.state.state_id} @ ${current.state.url} (${current.state.element_count} elements)`);

    let depthOfCurrent = 0;

    while (states.length < LIMITS.MAX_STATES && transitions.length < LIMITS.MAX_STEPS) {
      if (depthOfCurrent >= LIMITS.MAX_DEPTH) {
        terminationReason = 'max_depth_reached';
        break;
      }
      const fp = current.fingerprint;
      const usedCount = actionsPerState.get(fp) || 0;
      if (usedCount >= LIMITS.MAX_ACTIONS_PER_STATE) {
        terminationReason = 'max_actions_per_state_reached';
        break;
      }

      // Browser-position guard: the live page MUST match the state we are
      // deciding for. A mismatch means a previous action/goBack desynced the
      // browser from our state table — re-align before choosing anything.
      const liveUrl = page.url();
      if (current.state.url && liveUrl !== current.state.url) {
        console.warn(
          `[explore] Position desync: browser at ${liveUrl}, state table expects ${current.state.url} — re-aligning.`
        );
        warnings.push(`Position desync recovered: ${liveUrl} -> ${current.state.url}`);
        await page.goto(current.state.url, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
        await page.waitForTimeout(1500);
      }

      const candidates = buildCandidates(current.vdom, triedActions, failCounts, fp);
      if (!candidates.length) {
        terminationReason = 'no_candidates_remaining';
        break;
      }

      const historySummary =
        `Visited URLs so far: ${[...new Set(states.map((s) => s.url))].join(', ')}. ` +
        `Unique states: ${states.length}. Last actions: ` +
        transitions.slice(-4).map((t) => `${t.action.action}@${t.from_state}->${t.result}`).join('; ');

      if (!guardFillQueue.length && SEEDED_CREDS) {
        const seededGoal = activeGoal();
        const seededPhase = seededGoal ? currentOpenPhase(seededGoal) : null;
        const seededBatch = pickSeededLoginBatch(candidates, transitions, fp, seededPhase, SEEDED_CREDS);
        if (seededBatch.length === 2) {
          guardFillQueue.push(...seededBatch);
          console.log('[explore] Seeded login queue prepared for two distinct fields.');
        }
      }
      let decision;
      if (guardFillQueue.length) {
        // TASK B batch drain: a queued sibling fill executes with no LLM call.
        const q = guardFillQueue.shift();
        decision = { action: 'fill', candidate: q.candidate, value: q.value, reason: 'form_guard_batch' };
        console.log(`[explore] Form guard batch: filling ${q.candidate.elementId} (${guardFillQueue.length} queued).`);
      } else try {
        decision = await selectActionLLM(candidates, historySummary, activeGoal());
      } catch (err) {
        // One transient retry; a dead LLM ends exploration gracefully.
        try {
          await new Promise((r) => setTimeout(r, 2500));
          decision = await selectActionLLM(candidates, historySummary, activeGoal());
        } catch (err2) {
          terminationReason = `llm_error: ${err2.message}`;
          warnings.push(`Action selection failed: ${err2.message}`);
          break;
        }
      }
      // T1: unparseable output is NEVER executed and NEVER done. 3 strikes
      // in one run terminates honestly instead of flailing forever.
      if (decision.action === 'unknown') {
        if ((decision.strikes || 0) >= 3) {
          terminationReason = 'llm_unparseable';
          warnings.push(`Action selection unparseable 3 times — terminating (see llm_calls.jsonl).`);
          break;
        }
        warnings.push(`Unparseable LLM output (strike ${decision.strikes || 0}/3) — re-asking next step.`);
        continue;
      }
      if (decision.action === 'done' || !decision.candidate) {
        const untriedNow = candidates.filter((c) => !c.alreadyTried);
        const belowFloor = transitions.length < LIMITS.MIN_STEPS;
        const goal = activeGoal();
        const goalHoldsDone = decision.action === 'done' && goal && !isDoneAllowed(goal);
        if (decision.action === 'done' && untriedNow.length && (belowFloor || goalHoldsDone)) {
          // Anti-laziness floor: refuse early "done" — one LLM retry, then a
          // deterministic untried candidate. Never quit an element-rich page
          // after a handful of steps again.
          console.log(`[explore] Anti-laziness floor: ${transitions.length}/${LIMITS.MIN_STEPS} steps with untried candidates — refusing "done".`);
          try {
            decision = await selectActionLLM(candidates, historySummary, activeGoal());
          } catch (err) {
            terminationReason = `llm_error: ${err.message}`;
            warnings.push(`Anti-laziness retry failed: ${err.message}`);
            break;
          }
        }
        if (decision.action === 'done' || !decision.candidate) {
          const stillUntried = candidates.filter((c) => !c.alreadyTried);
          const goal2 = activeGoal();
          const goalHoldsDone2 = decision.action === 'done' && goal2 && !isDoneAllowed(goal2);
          if (goalHoldsDone2 && stillUntried.length) {
            console.log(`[explore] Goal phase still open (${currentOpenPhase(goal2).id}) — refusing "done", using deterministic fallback.`);
          }
          if (decision.action === 'done' && stillUntried.length && (belowFloor || goalHoldsDone2)) {
            const c = stillUntried[0];
            const act = (c.type === 'text_input' || c.type === 'search_field') ? 'fill' : 'click';
            let val = '';
            if (act === 'fill') {
              const t = normText(c.text);
              val = /pass/.test(t)
                ? (process.env.SEED_PASSWORD || 'TestPass123!')
                : (process.env.SEED_USERNAME || 'test_user');
            }
            decision = { action: act, candidate: c, value: val, reason: 'anti_laziness_fallback' };
            console.log(`[explore] Anti-laziness fallback: ${act} on element ${c.elementId}.`);
          } else {
            if (goalHoldsDone2) {
              warnings.push(`Goal incomplete at done — open phases: ${goal2.phases.filter((p) => !p.done).map((p) => p.id).join(', ')}`);
            }
            terminationReason = decision.action === 'done'
              ? 'llm_done'
              : 'no_valid_candidate_selected';
            break;
          }
        }
      }

      const cand0 = decision.candidate;
      // FORM-COMPLETION GUARD (R3-T7): deterministic enforcement of prompt
      // rule 4. Never submit while a sibling input on this state is empty —
      // fill it now (password-aware, verified by the normal fill path) and
      // retry the submit next step. Costs zero LLM calls.
      if (cand0 && (decision.action === 'submit'
        || (decision.action === 'click' && /submit|login|sign.?in|continue|next|pay|checkout|place order/i.test(cand0.text || '')))) {
        // TASK B: batch ALL sibling empties (first executes now, rest queue
        // with zero LLM cost) instead of one-fill-per-step thrash.
        const batch = pickUnfilledInputBatch(candidates, transitions, fp);
        const need = batch.length ? batch[0] : null;
        if (need) {
          for (const extra of batch.slice(1)) guardFillQueue.push(extra);
          noteLesson(batch.length > 1
            ? `Submit attempted with ${batch.length} empty form fields — filling ALL inputs in one batch before submitting.`
            : 'Submit attempted with empty form fields — fill ALL inputs before submitting.');
          console.log(`[explore] Form guard: filling ${need.candidate.elementId} before submit.`
            + (batch.length > 1 ? ` (+${batch.length - 1} batched)` : ''));
          decision.action = 'fill';
          decision.candidate = need.candidate;
          decision.value = need.value;
          decision.reason = 'form_guard_fill';
        }
      }
      const cand = decision.candidate;
      const execAction = {
        action: decision.action === 'submit' ? 'click' : decision.action,
        x: cand.x, y: cand.y, value: decision.value,
      };
      triedActions.add(`${fp}|${cand._key}`);
      actionsPerState.set(fp, usedCount + 1);
      const urlBeforeAction = page.url();

      const transition = {
        from_state: current.state.state_id,
        from_fingerprint: fp,
        action: {
          type: decision.action,
          elementId: cand.elementId,
          elementType: cand.type,
          elementText: cand.text,
          x: cand.x, y: cand.y,
          value: decision.value || null,
          reason: decision.reason,
        },
        result: 'executed',
        timestamp: new Date().toISOString(),
      };

      const { executeAction } = require('./llm');
      let actionError = null;
      try {
        await executeAction(page, execAction);
        await page.waitForLoadState('domcontentloaded', { timeout: 8000 }).catch(() => {});
        // Give SPA/router navigation a fair chance before fingerprinting.
        await page.waitForLoadState('networkidle', { timeout: 4000 }).catch(() => {});
        await page.waitForTimeout(1500);
      } catch (err) {
        actionError = err.message;
      }

      if (actionError) {
        transition.result = 'error';
        transition.error = actionError;
        transitions.push(transition);
        warnings.push(`Step from ${transition.from_state}: ${actionError}`);
        console.log(`[explore] ${transition.from_state} --${decision.action}--> ERROR (${actionError})`);
        if (activeGoal()) noteGoal(advanceGoalPhase(activeGoal(), buildObservation({ actionFailed: true })));
        continue;
      }

      const recordFailure = (weight) => {
        const fam = `${cand.type}|${normText(cand.text)}`;
        failCounts.set(fam, (failCounts.get(fam) || 0) + (weight || 1));
      };

      const next = await captureState(`after_${decision.action}`, {
        action: decision.action,
        elementId: cand.elementId,
        elementType: cand.type,
        elementText: cand.text,
        x: cand.x, y: cand.y,
        value: decision.value || null,
      }, current.state.state_id);

      // Observable fill verification (input_value): read back the targeted
      // field from the live DOM. Never assumed — unreadable means false.
      let fillVerified = false;
      if (decision.action === 'fill') {
        fillVerified = await probeFillValue(page, cand.x, cand.y, decision.value);
      }
      const goalObsBase = { urlBefore: urlBeforeAction, pageText: (next.visibleText || '') };

      transition.to_state = next.state.state_id;
      transition.url_after = next.state.url;
      transition.state_similarity = {
        same_url: next.state.url === current.state.url,
        repeated_fingerprint: visitedFingerprints.has(next.fingerprint),
      };

      if (!/^https?:/i.test(next.state.url)) {
        // Non-web destinations (about:blank, error pages, external app handlers)
        // are dead ends — reject them like repeated states.
        transition.result = 'invalid_state_skipped';
        transition.url_after = next.state.url;
        transitions.push(transition);
        recordFailure(2); // non-http destination = definitive dead end
        warnings.push(`Rejected non-http destination ${next.state.url} after ${decision.action}`);
        console.log(`[explore] ${transition.from_state} --${decision.action}--> non-http state rejected, going back`);
        if (activeGoal()) noteGoal(advanceGoalPhase(activeGoal(), buildObservation({ ...goalObsBase, urlAfter: next.state.url })));
        if (page.url() !== urlBeforeAction) {
          await page.goBack({ waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {});
        }
        await page.waitForTimeout(1000);
        continue;
      }

      if (START_ORIGIN) {
        let nextOrigin = '';
        try { nextOrigin = new URL(next.state.url).origin; } catch (_) {}
        if (nextOrigin && nextOrigin !== START_ORIGIN) {
          // EXTERNAL DOMAIN: never adopt, never interact further (the action
          // may already have landed on a third-party login form — leave).
          transition.result = 'external_domain_skipped';
          transition.url_after = next.state.url;
          transitions.push(transition);
          recordFailure(2); // off-site link = definitive dead end for this family
          warnings.push(`External domain blocked: ${next.state.url}`);
          console.log(`[explore] ${transition.from_state} --${decision.action}--> ⛔ external domain (${nextOrigin}) — going back`);
          if (activeGoal()) noteGoal(advanceGoalPhase(activeGoal(), buildObservation({ ...goalObsBase, urlAfter: next.state.url })));
          if (page.url() !== urlBeforeAction) {
            await page.goBack({ waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {});
          }
          await page.waitForTimeout(1000);
          continue;
        }
      }

      if (visitedFingerprints.has(next.fingerprint)) {
        transition.result = 'repeated_state_skipped';
        transitions.push(transition);
        // A click that produced NO change at all (same URL, same fingerprint)
        // is a strong junk/broken-control signal; a navigation elsewhere that
        // landed somewhere already visited is weaker (could be timing noise).
        recordFailure(transition.state_similarity.same_url ? 2 : 1);
        console.log(`[explore] ${transition.from_state} --${decision.action}--> repeated state, going back`);
        if (activeGoal()) noteGoal(advanceGoalPhase(activeGoal(), buildObservation({ ...goalObsBase, urlAfter: next.state.url })));
        // goBack is ONLY valid when the action actually NAVIGATED somewhere
        // (URL changed) and landed on an already-visited page — then going
        // back restores the pre-action page. When the click produced no
        // navigation at all (same URL), the browser never left this page and
        // a goBack would unwind OLDER history, silently desyncing the browser
        // from the state table (root cause of the stalled /elements run).
        if (!transition.state_similarity.same_url && page.url() !== urlBeforeAction) {
          await page.goBack({ waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {});
        } else if (!transition.state_similarity.same_url) {
          // URL already back to the pre-action page by itself; nothing to do.
        }
        await page.waitForTimeout(1000);
        continue; // stay on the same visual state; candidate now marked tried
      }

      visitedFingerprints.set(next.fingerprint, next.state.state_id);
      states.push(next.state);
      transitions.push(transition);
      if (activeGoal()) {
        const closing = currentOpenPhase(activeGoal());
        const res = advanceGoalPhase(activeGoal(), buildObservation({
          ...goalObsBase,
          urlAfter: next.state.url,
          ...(decision.action === 'fill' && fillVerified ? {
            inputVerified: true,
            inputFieldKey: `${Math.round(cand.x / 20)},${Math.round(cand.y / 20)}`,
          } : {}),
        }));
        noteGoal(res);
        if (res.advanced && closing) {
          const g = activeGoal();
          console.log(`[explore] GOAL phase done: ${closing.id} (${g ? donePhaseIds(g).length : '?'}/${goalPlan.phases.length} phases)`);
        }
      }
      depthOfCurrent += 1;
      current = next;
      console.log(
        `[explore] ${transition.from_state} --${decision.action}(${cand.type}:${cand.text || ''})--> ` +
        `${next.state.state_id} @ ${next.state.url}`
      );
    }

    if (states.length >= LIMITS.MAX_STATES) terminationReason = 'max_states_reached';
    if (transitions.length >= LIMITS.MAX_STEPS) terminationReason = 'max_steps_reached';
  } catch (err) {
    terminationReason = `fatal_error: ${err.message}`;
    warnings.push(err.message);
  } finally {
    await browser.close().catch(() => {});
  }

  // ------------------------------------------------------------------
  // Generate replayable multi-step test cases from ACTUAL discovered paths.
  // ------------------------------------------------------------------
  const workflows = workflowsFromStates(states);
  const wfTests = workflows.map((steps, i) => {
    // Goal runs: distill exploratory clicks, keep phase-relevant steps (R3-T8 C).
    const kept = goalPlan ? distillGoalSteps(steps, goalPlan) : steps;
    const distilled = kept.length !== steps.length;
    // Honest navigation expectation from the RECORDED URL span (R3-T9):
    // the old hardcoded `false` lied on every multi-page workflow.
    const { navigated, route } = navigationExpectation(kept);
    return {
    id: `TC${String(i + 1).padStart(2, '0')}`,
    objective: 'Replays an autonomously discovered visual workflow: '
      + kept.map((s) => `${s.action}${s.elementText ? `(${s.elementText})` : ''}`).join(' -> '),
    evidence: [(distilled
      ? `distilled to phase-relevant steps (${steps.length}->${kept.length}) during exploration run ${runId}`
      : `discovered during exploration run ${runId}`)],
    inferred_behavior: 'Recorded sequence of real executed actions',
    steps: kept.map((s) => ({
      action: s.action === 'navigate' ? 'navigate' : s.action,
      x: ['click', 'fill'].includes(s.action) ? s.x : null,
      y: ['click', 'fill'].includes(s.action) ? s.y : null,
      value: s.value || '',
      // Target hint so replay can re-resolve on the CURRENT visual state.
      ...(s.elementType || s.elementText ? {
        target: { type: s.elementType || '', text: s.elementText || '' },
      } : {}),
      ...(s.action === 'navigate' && s.url ? { url: s.url } : {}),
    })),
    expected_result: navigated
      ? `Replay crosses ${urls.length} pages and each step resolves live.${route}`
      : 'All recorded actions execute without errors and the final page renders non-trivially.',
    expect_navigation: navigated,
    expected_text: null,
    };
  });
  // R3-T11 wire (master): one replayable test per completed goal phase,
  // appended after workflow tests. Pure module, guarded — failures never
  // break test-case writing.
  let phaseTests = [];
  try {
    const donePhases = goalPlan && Array.isArray(goalPlan.phases)
      ? goalPlan.phases.filter((p) => p && p.done) : [];
    if (donePhases.length) {
      const built = require('./phaseTests').buildPhaseTests(transitions, states, goalPlan.phases);
      phaseTests = (Array.isArray(built) ? built : []).map((t, k) => {
        const ph = donePhases.find((p) => p.id === t.phase_id) || {};
        return {
          id: `PT${String(k + 1).padStart(2, '0')}`,
          objective: `Goal phase replay: ${ph.name || t.phase_id}`,
          evidence: [`phase ${t.phase_id} completed during exploration run ${runId}`],
          inferred_behavior: 'Phase-relevant prefix of real executed actions',
          steps: Array.isArray(t.steps) ? t.steps : [],
          expected_result: t.expect_navigation
            ? 'Replay crosses pages and each step resolves live.'
            : 'All phase steps execute without errors.',
          expect_navigation: Boolean(t.expect_navigation),
          expected_text: null,
        };
      }).filter((t) => t.steps.length >= 2);
    }
  } catch (e) { warnings.push(`phaseTests wire skipped: ${e.message}`); }
  const testCases = wfTests.concat(phaseTests);
  const tcPath = path.join(OUTPUT_DIR, `test_cases_${runId}_exploration.json`);
  fs.writeFileSync(tcPath, JSON.stringify(testCases, null, 2));

  const result = {
    run_id: runId,
    start_url: url,
    started_at: new Date(startedAt).toISOString(),
    finished_at: new Date().toISOString(),
    duration_ms: Date.now() - startedAt,
    limits: LIMITS,
    termination_reason: terminationReason,
    goal: goalPlan ? {
      goal: goalPlan.goal,
      phases: goalPlan.phases.map((p) => ({ id: p.id, name: p.name, done: Boolean(p.done), failCount: p.failCount || 0 })),
      blocked: goalBlocked,
    } : null,
    totals: {
      total_steps: transitions.length,
      total_states: states.length,
      unique_states: visitedFingerprints.size,
      unique_urls: new Set(states.map((s) => s.url)).size,
      repeated_states_skipped: transitions.filter((t) => t.result === 'repeated_state_skipped').length,
      action_errors: transitions.filter((t) => t.result === 'error').length,
      click_actions: transitions.filter((t) => ['click', 'submit'].includes(t.action.type)).length,
      fill_actions: transitions.filter((t) => t.action.type === 'fill').length,
      scroll_actions: transitions.filter((t) => t.action.type === 'scroll').length,
      submit_actions: transitions.filter((t) => t.action.type === 'submit').length,
      generated_tests: testCases.length,
      avg_steps_per_test: testCases.length
        ? Number((testCases.reduce((n, t) => n + t.steps.length, 0) / testCases.length).toFixed(2))
        : 0,
    },
    visited_urls: [...new Set(states.map((s) => s.url))],
    screenshots_dir: relDir.replace(/\\/g, '/'),
    test_cases_file: tcPath,
    warnings,
    states,
    transitions,
  };

  fs.writeFileSync(path.join(OUTPUT_DIR, `${runId}_exploration_history.json`), JSON.stringify(result, null, 2));
  const slim = { ...result, states: undefined, transitions: undefined };
  fs.writeFileSync(path.join(OUTPUT_DIR, `${runId}_exploration_result.json`), JSON.stringify(slim, null, 2));

  return result;
}

module.exports = {
  runExploration,
  buildCandidates,
  buildGoalPlan,
  currentOpenPhase,
  donePhaseIds,
  goalPromptBlock,
  buildObservation,
  advanceGoalPhase,
  isDoneAllowed,
  selectActionLLM,
  setRunLogFile,
  noteLesson,
  lessonBlock,
  clearLessons,
  pickUnfilledInput,
  filledKeysForState,
  navigationExpectation,
  pickUnfilledInputBatch,
  pickSeededLoginBatch,
  groupInputsByRow,
  clearGuardQueue,
  __setCallLLM,
  __resetParseStrikes,
  distillGoalSteps,
};
