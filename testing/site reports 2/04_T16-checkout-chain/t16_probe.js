'use strict';
// P7/T16 probe (LoopB scratch, headed, api_calls=0): walk the checkout chain
// with stable CSS selectors, record bbox centers for the executor replay.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '..', 'screenshots', 't16_probe');
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function center(loc) {
  const b = await loc.boundingBox();
  return b ? { x: Math.round(b.x + b.width / 2), y: Math.round(b.y + b.height / 2), w: Math.round(b.width), h: Math.round(b.height) } : null;
}

(async () => {
  const rec = { ts: new Date().toISOString(), api_calls: 0, coords: {}, phases: [] };
  const browser = await chromium.launch({ headless: false, slowMo: 150 });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto('https://www.saucedemo.com/', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#user-name', { timeout: 20000 });
  rec.coords.user = await center(page.locator('#user-name'));
  rec.coords.pass = await center(page.locator('#password'));
  rec.coords.login = await center(page.locator('#login-button'));
  await page.fill('#user-name', 'standard_user');
  await page.fill('#password', 'secret_sauce');
  await page.click('#login-button');
  await page.waitForURL('**/inventory.html', { timeout: 20000 });
  rec.phases.push({ phase: 'login', url: page.url() });
  rec.coords.addBackpack = await center(page.locator('[data-test="add-to-cart-sauce-labs-backpack"]'));
  rec.coords.cart = await center(page.locator('.shopping_cart_link'));
  await page.click('[data-test="add-to-cart-sauce-labs-backpack"]');
  await sleep(500);
  rec.phases.push({ phase: 'add', badge: await page.locator('.shopping_cart_badge').textContent().catch(() => null) });
  await page.click('.shopping_cart_link');
  await page.waitForURL('**/cart.html', { timeout: 20000 });
  rec.coords.checkout = await center(page.locator('#checkout'));
  rec.phases.push({ phase: 'cart', url: page.url(), items: await page.locator('.cart_item').count() });
  await page.click('#checkout');
  await page.waitForURL('**/checkout-step-one.html', { timeout: 20000 });
  rec.coords.first = await center(page.locator('#first-name'));
  rec.coords.last = await center(page.locator('#last-name'));
  rec.coords.zip = await center(page.locator('#postal-code'));
  rec.coords.cont = await center(page.locator('#continue'));
  await page.fill('#first-name', 'John');
  await page.fill('#last-name', 'Doe');
  await page.fill('#postal-code', '12345');
  await page.click('#continue');
  await page.waitForURL('**/checkout-step-two.html', { timeout: 20000 });
  rec.coords.finish = await center(page.locator('#finish'));
  rec.phases.push({ phase: 'overview', url: page.url(), total: await page.locator('.summary_total_label').textContent().catch(() => null) });
  await page.screenshot({ path: path.join(OUT, 't16_overview.png') });
  await page.click('#finish');
  await page.waitForURL('**/checkout-complete.html', { timeout: 20000 });
  const header = await page.locator('.complete-header').textContent().catch(() => null);
  rec.phases.push({ phase: 'complete', url: page.url(), header });
  await page.screenshot({ path: path.join(OUT, 't16_complete.png') });
  fs.writeFileSync(path.join(__dirname, 't16_probe.json'), JSON.stringify(rec, null, 2));
  console.log(JSON.stringify(rec.phases, null, 1));
  await browser.close();
})().catch((e) => { console.error('PROBE-FAIL ' + e.message); process.exit(1); });
