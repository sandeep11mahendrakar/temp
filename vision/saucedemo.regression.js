'use strict';
// Saucedemo regression: login + checkout (standard_user) + locked_out negative.
// Run: node saucedemo.regression.js  (from vision/, playwright dep lives here)
// Exit 0 = all checks pass, non-zero = regression failure.
const { chromium } = require('playwright');

const BASE = 'https://www.saucedemo.com';
const results = [];
const check = (name, ok, extra = {}) => {
  results.push({ name, ok: !!ok, ...extra });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra.detail ? '  :: ' + extra.detail : ''}`);
};

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    // 1. login
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.locator('[data-test="username"]').fill('standard_user');
    await page.locator('[data-test="password"]').fill('secret_sauce');
    await page.locator('[data-test="login-button"]').click();
    await page.waitForURL('**/inventory.html', { timeout: 10000 });
    check('login standard_user -> inventory', page.url().endsWith('/inventory.html'), { detail: page.url() });

    const title = await page.locator('.title').textContent();
    check('inventory title is Products', /Products/.test(title || ''), { detail: (title || '').trim() });

    // 2. add to cart
    await page.locator('[data-test="add-to-cart-sauce-labs-backpack"]').click();
    const badge = await page.locator('.shopping_cart_badge').textContent();
    check('add backpack -> badge=1', badge === '1', { detail: 'badge=' + badge });

    // 3. cart (wait for render before counting — fixes race)
    await page.locator('.shopping_cart_link').click();
    await page.waitForURL('**/cart.html', { timeout: 8000 });
    await page.waitForSelector('.cart_item', { timeout: 8000 });
    const n = await page.locator('.cart_item').count();
    check('cart contains >=1 item', n >= 1, { detail: 'count=' + n });

    // 4. checkout info -> overview
    await page.locator('[data-test="checkout"]').click();
    await page.waitForURL('**/checkout-step-one.html', { timeout: 8000 });
    await page.locator('[data-test="firstName"]').fill('Reg');
    await page.locator('[data-test="lastName"]').fill('Test');
    await page.locator('[data-test="postalCode"]').fill('560001');
    await page.locator('[data-test="continue"]').click();
    await page.waitForURL('**/checkout-step-two.html', { timeout: 8000 });
    check('checkout info -> overview', page.url().includes('checkout-step-two'), { detail: page.url() });

    // 5. finish
    const total = (await page.locator('.summary_total_label').textContent() || '').trim();
    await page.locator('[data-test="finish"]').click();
    await page.waitForURL('**/checkout-complete.html', { timeout: 8000 });
    const hdr = (await page.locator('.complete-header').textContent() || '').trim();
    check('finish -> Thank you for your order', /thank you/i.test(hdr), { detail: `${hdr} | ${total}` });

    // 6. negative: locked_out_user
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.locator('[data-test="username"]').fill('locked_out_user');
    await page.locator('[data-test="password"]').fill('secret_sauce');
    await page.locator('[data-test="login-button"]').click();
    await page.waitForSelector('[data-test="error"]', { timeout: 8000 });
    const err = (await page.locator('[data-test="error"]').textContent() || '');
    check('locked_out_user blocked', /locked out/i.test(err), { detail: err.slice(0, 100) });
  } catch (e) {
    check('no unhandled exception', false, { detail: String(e).slice(0, 300) });
  } finally {
    await browser.close();
  }
  const failed = results.filter(r => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  process.exit(failed.length ? 1 : 0);
})();
