'use strict';

/**
 * Browser capture service.
 * Holds ONE persistent Chromium across /capture calls (R3-T9 churn fix:
 * launching + closing a browser per capture cost 15-40s each under load).
 * A fresh page is opened per capture (cheap, isolated); the browser lives
 * until the service stops. Dead browsers are recreated, never reused.
 */

const express = require('express');
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(express.json());

const PORT = process.env.BROWSER_SERVICE_PORT || 5004;
const SCREENSHOT_DIR = path.join(__dirname, '..', '..', 'temp_screenshots');

app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'browser' }));

let sharedBrowser = null;
async function getBrowser() {
  if (sharedBrowser) {
    let alive = false;
    try { alive = typeof sharedBrowser.isConnected === 'function' ? sharedBrowser.isConnected() : true; }
    catch (_) { alive = false; }
    if (alive) return sharedBrowser;
    try { await sharedBrowser.close(); } catch (_) {}
    sharedBrowser = null;
  }
  // Headful by default (Review-3: operator observes runs). Set
  // VISION_HEADED=false to run headless.
  const HEADED = process.env.VISION_HEADED !== 'false';
  sharedBrowser = await chromium.launch({ headless: !HEADED, slowMo: HEADED ? 300 : 0, timeout: 90000 });
  return sharedBrowser;
}

app.post('/capture', async (req, res) => {
  const { url } = req.body || {};
  if (!url || !/^https?:\/\//.test(url)) {
    return res.status(400).json({ error: 'A valid http(s) URL is required' });
  }

  let page;
  try {
    const browser = await getBrowser();
    page = await browser.newPage();
    await page.setViewportSize({ width: 1280, height: 900 });

    console.log(`[browser] Capturing: ${url}`);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(2500);

    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
    const filename = `ss_${Date.now()}.png`;
    const fullPath = path.join(SCREENSHOT_DIR, filename);
    await page.screenshot({ path: fullPath, fullPage: false });

    res.json({ image_path: fullPath, url, viewport: '1280x900' });
  } catch (err) {
    console.error('[browser] Capture failed:', err.message);
    // Browser-level death (not page-level): drop the shared browser so the
    // next capture recreates instead of reusing a corpse.
    if (/closed|disconnected|crash|terminated/i.test(err.message || '')) {
      try { if (sharedBrowser) await sharedBrowser.close(); } catch (_) {}
      sharedBrowser = null;
    }
    res.status(500).json({ error: 'Screenshot capture failed', detail: err.message });
  } finally {
    if (page) await page.close().catch(() => {});
  }
});

app.listen(PORT, () => console.log(`[browser] Browser service running on :${PORT}`));
