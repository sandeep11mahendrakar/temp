'use strict';
// M2 perception screenshot: headed, 2 todos, save PNG for gateway /vision/process.
const { chromium } = require('playwright');
const path = require('path');

const OUT = path.join(__dirname, '..', 'screenshots', 'm2_diag', 'm2_2todos.png');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch({ headless: false, slowMo: 120 });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto('https://todomvc.com/examples/react/dist/', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.new-todo', { timeout: 20000 });
  for (const t of ['Buy milk', 'Read book']) {
    await page.fill('.new-todo', t);
    await page.press('.new-todo', 'Enter');
    await sleep(400);
  }
  await sleep(800);
  await page.screenshot({ path: OUT });
  const probe = await page.evaluate(() => {
    const out = {};
    for (const [k, px, py] of [['executor_point', 632, 284], ['true_center_2nd', 535, 285]]) {
      const el = document.elementFromPoint(px, py);
      if (!el) { out[k] = null; continue; }
      const li = el.closest ? el.closest('li') : null;
      const input = li ? li.querySelector('input.toggle') : null;
      const r = input ? input.getBoundingClientRect() : null;
      out[k] = {
        tag: el.tagName.toLowerCase(), cls: el.className || '',
        labelControl: (el.tagName === 'LABEL') ? Boolean(el.control) : null,
        liInputCenter: r ? [Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2)] : null,
      };
    }
    return out;
  });
  console.log('PROBE ' + JSON.stringify(probe));
  console.log('saved ' + OUT);
  await browser.close();
})().catch((e) => { console.error('SHOT-FAIL', e.message); process.exit(1); });
