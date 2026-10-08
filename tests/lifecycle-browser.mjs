import { launchBrowser, browserName } from './browser-engine.mjs';
import assert from 'node:assert/strict';
import { MOVES } from '../data/rules.js';
const browser = await launchBrowser();
const errors = [];
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.addInitScript(() => {
    let now = 0, frame;
    Math.random = () => 0;
    performance.now = () => now;
    requestAnimationFrame = fn => { frame = fn; return 1; };
    window.__advance = ms => {
      const end = now + ms;
      while (now < end) { now = Math.min(end, now + 10); const fn = frame; frame = null; if (fn) fn(now); }
    };
    window.__action = action => {
      const event = new PointerEvent('pointerdown', { bubbles: true, button: 0, isPrimary: true });
      Object.defineProperty(event, 'timeStamp', { value: now });
      document.querySelector('[data-action="' + action + '"]').dispatchEvent(event);
    };
    let hidden = false;
    Object.defineProperty(document, 'hidden', { get: () => hidden });
    window.__visibility = value => { hidden = value; document.dispatchEvent(new Event('visibilitychange')); };
  });
  const page = await context.newPage();
  page.on('pageerror', e => errors.push(e.message));
  page.on('response', r => { if (r.status() >= 400) errors.push(r.url()); });
  await page.goto(process.env.BOSS_RUSH_TEST_URL ?? 'http://127.0.0.1:8000/');
  await page.evaluate(() => localStorage.setItem('seenTutorialMoves', '["A01"]'));
  await page.locator('#start-tutorial').click();
  await page.evaluate(() => window.__advance(900));
  assert.equal(await page.locator('#tutorial').isVisible(), true);
  assert.equal(await page.locator('#tutorial-answer').textContent(), '攻擊');
  const before = await page.locator('#time').textContent();
  await page.evaluate(() => window.__advance(20000));
  assert.equal(await page.locator('#time').textContent(), before);
  await page.locator('#tutorial-exit').click();
  assert.equal(await page.locator('#tutorial').isVisible(), false);
  assert.equal(await page.locator('#battle').isVisible(), false);
  await page.locator('#cancel-exit').click();
  assert.equal(await page.locator('#pause').isVisible(), true);
  await page.locator('#resume').click();
  assert.equal(await page.locator('#tutorial').isVisible(), true);
  await page.locator('#confirm-tutorial').click();
  await page.evaluate(() => window.__advance(1600));
  const countdown = await page.locator('#countdown').textContent();
  await page.locator('#manual-pause').click();
  assert.equal(await page.locator('#battle').getAttribute('aria-hidden'), 'true');
  await page.evaluate(() => window.__advance(10000));
  await page.locator('#resume').click();
  assert.equal(await page.locator('#countdown').textContent(), countdown);
  await page.evaluate(() => window.__visibility(true));
  assert.equal(await page.locator('#pause').isVisible(), true);
  await page.evaluate(() => { window.__advance(10000); window.__visibility(false); });
  assert.equal(await page.locator('#pause').isVisible(), true);
  await page.locator('#resume').click();
  assert.equal(await page.locator('#countdown').textContent(), countdown);
  await page.setViewportSize({ width: 844, height: 390 });
  await page.waitForTimeout(100);
  assert.equal(await page.locator('#pause').isVisible(), true);
  await page.evaluate(() => window.__advance(10000));
  await page.locator('#resume').click();
  assert.equal(await page.locator('#countdown').textContent(), countdown);
  await page.evaluate(() => window.__action('attack'));
  assert.equal(await page.locator('#combo').textContent(), '1');
  await page.locator('#exit').click();
  await page.locator('#confirm-exit').click();
  assert.equal(await page.locator('#home').isVisible(), true);
  await page.locator('#start-tutorial').click();
  await page.evaluate(() => window.__advance(900));
  assert.equal(await page.locator('#tutorial').isVisible(), true);
  const seen = new Set();
  for (let guard = 0; !(await page.locator('#result').isVisible()); guard++) {
    assert.ok(guard < 300);
    if (await page.locator('#tutorial').isVisible()) {
      const name = await page.locator('#tutorial-title').textContent();
      assert.equal(seen.has(name), false);
      seen.add(name);
      await page.evaluate(() => window.__advance(5000));
      await page.locator('#confirm-tutorial').click();
    } else {
      const info = await page.evaluate(() => ({ ready: !document.querySelector('[data-action]').disabled,
        name: document.getElementById('move').textContent, stage: Number(document.getElementById('stage').textContent.split('/')[0]) }));
      if (info.ready) {
        await page.evaluate(({ action, ms }) => { window.__advance(ms); window.__action(action); },
          { action: MOVES.find(move => move.name === info.name).action, ms: [4000,3500,3000,2500,2000][info.stage-1] * .4 });
      } else await page.evaluate(() => window.__advance(100));
      // Advance only until the next interactive phase to preserve the intended reaction grade.
      await page.evaluate(() => {
        for (let i = 0; i < 300; i++) {
          if (!document.getElementById('tutorial').hidden || !document.querySelector('[data-action]').disabled || !document.getElementById('result').hidden) break;
          window.__advance(10);
        }
      });
    }
  }
  assert.ok((await page.locator('#summary').textContent()).includes('52 / 0 / 0'));
  assert.equal(await page.locator('#result-mode').textContent(), '普通 · 教學模式 · 不列入排行榜');
  await page.locator('#restart').click();
  await page.evaluate(() => window.__advance(900));
  assert.equal(await page.locator('#tutorial').isVisible(), true);
  assert.equal(await page.evaluate(() => localStorage.getItem('seenTutorialMoves')), '["A01"]');
  await page.reload();
  assert.equal(await page.locator('#home').isVisible(), true);
  await page.locator('#start').click();
  await page.evaluate(() => window.__advance(1300));
  assert.equal(await page.locator('#tutorial').isVisible(), false);
  assert.equal(await page.locator('[data-action="attack"]').isEnabled(), true);
  assert.deepEqual(errors, []);
  await context.close();
  console.log('PASS: tutorial lifecycle, full GREAT 52, per-session reset, pause/hidden/rotation remaining time, opaque overlays, exit/cancel, replay, storage independence, refresh, challenge answer isolation');
} finally { await browser.close(); }
