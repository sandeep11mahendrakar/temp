'use strict';
// M2 toggle-diag ground truth (LoopB, headed, zero API calls, no services needed).
// Adds 3 todos, probes 2nd-item toggle via input-center click, label click,
// focus+Space; records li class / checked / counter / elementFromPoint.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '..', 'screenshots', 'm2_diag');
fs.mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function groundTruth(page) {
  return page.evaluate(() => {
    const items = [...document.querySelectorAll('.todo-list li')].map((li) => {
      const input = li.querySelector('input.toggle');
      const label = li.querySelector('label');
      const r = input ? input.getBoundingClientRect() : null;
      return {
        text: label ? label.textContent : '',
        liClass: li.className,
        checked: input ? Boolean(input.checked) : null,
        bbox: r ? { x: r.x, y: r.y, w: r.width, h: r.height, cx: r.x + r.width / 2, cy: r.y + r.height / 2 } : null,
      };
    });
    const counter = document.querySelector('.todo-count');
    const toggleAll = document.querySelector('.toggle-all');
    const ta = toggleAll ? toggleAll.getBoundingClientRect() : null;
    return {
      items,
      counter: counter ? counter.textContent.trim() : null,
      clearCompleted: Boolean(document.querySelector('.clear-completed')),
      toggleAll: toggleAll ? { tag: toggleAll.tagName, type: toggleAll.getAttribute('type'), bbox: { x: ta.x, y: ta.y, w: ta.width, h: ta.height } } : null,
    };
  });
}

async function elAt(page, x, y) {
  return page.evaluate(([px, py]) => {
    const el = document.elementFromPoint(px, py);
    if (!el) return null;
    return { tag: el.tagName.toLowerCase(), type: el.getAttribute ? (el.getAttribute('type') || '') : '', cls: el.className || '', text: (el.textContent || '').slice(0, 40) };
  }, [Math.round(x), Math.round(y)]);
}

(async () => {
  const log = [];
  const browser = await chromium.launch({ headless: false, slowMo: 120 });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto('https://todomvc.com/examples/react/dist/', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.new-todo', { timeout: 20000 });
  for (const t of ['Buy milk', 'Read book', 'Write code']) {
    await page.fill('.new-todo', t);
    await page.press('.new-todo', 'Enter');
    await sleep(400);
  }
  let g = await groundTruth(page);
  log.push({ step: '3todos', counter: g.counter, items: g.items.map((i) => ({ text: i.text, liClass: i.liClass, checked: i.checked, bbox: i.bbox })) , toggleAll: g.toggleAll, clearCompleted: g.clearCompleted });
  await page.screenshot({ path: path.join(OUT, 'm2_3todos.png') });

  const second = g.items[1];
  const { cx, cy } = second.bbox;
  const pre = await elAt(page, cx, cy);
  log.push({ step: 'pre-click', cx: Math.round(cx), cy: Math.round(cy), elementFromPoint: pre });
  await page.mouse.click(cx, cy);
  await sleep(600);
  g = await groundTruth(page);
  log.push({ step: 'post-input-click', counter: g.counter, struck: g.items[1].liClass, checked: g.items[1].checked, clearCompleted: g.clearCompleted });
  await page.screenshot({ path: path.join(OUT, 'm2_after_input_click.png') });

  if (!g.items[1].checked) {
    // Variant L: click the label text.
    const label = page.locator('.todo-list li:nth-child(2) label');
    await label.click();
    await sleep(600);
    g = await groundTruth(page);
    log.push({ step: 'post-label-click', counter: g.counter, struck: g.items[1].liClass, checked: g.items[1].checked, clearCompleted: g.clearCompleted });
    await page.screenshot({ path: path.join(OUT, 'm2_after_label_click.png') });
  }
  if (!g.items[1].checked) {
    // Variant S: focus input + Space (FIX-B candidate).
    await page.locator('.todo-list li:nth-child(2) input.toggle').focus();
    await page.keyboard.press('Space');
    await sleep(600);
    g = await groundTruth(page);
    log.push({ step: 'post-focus-space', counter: g.counter, struck: g.items[1].liClass, checked: g.items[1].checked, clearCompleted: g.clearCompleted });
    await page.screenshot({ path: path.join(OUT, 'm2_after_focus_space.png') });
  }
  fs.writeFileSync(path.join(__dirname, 'm2_diag.json'), JSON.stringify({ ts: new Date().toISOString(), headed: true, api_calls: 0, log }, null, 2));
  console.log(JSON.stringify(log, null, 2));
  await browser.close();
})().catch((e) => { console.error('DIAG-FAIL', e.message); process.exit(1); });
