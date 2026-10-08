import { launchBrowser, browserName } from './browser-engine.mjs';
// 選用瀏覽器驗收：需外部提供 Playwright 與 Chromium，不是網站執行依賴。
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

const baseURL = process.env.BOSS_RUSH_TEST_URL ?? 'http://127.0.0.1:8000/';
const output = process.env.BOSS_RUSH_TEST_OUTPUT ?? '/tmp/boss-rush-validation';
await mkdir(output, { recursive: true });
const browser = await launchBrowser();
const errors = [];
const answers = {
  '魔力蓄積': 'attack', '全場震盪': 'defend', '巨斧重擊': 'dodge', '直線突刺': 'counter',
  '橫掃千軍': 'dodge', '疾風突襲': 'counter', '火焰爆發': 'defend', '能量聚集': 'attack',
  '黑暗詠唱': 'attack', '虛空爆震': 'defend', '禁咒吟唱': 'attack', '雷霆衝擊': 'defend',
  '墜星轟擊': 'dodge', '毀滅斬落': 'dodge', '精準穿刺': 'counter', '致命刺擊': 'counter',
};

function monitor(page) {
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
}

try {
  // 真實瀏覽器時計與滑鼠／觸控，驗證操作及超時。
  for (const touch of [false, true]) {
    const context = await browser.newContext({ viewport: { width: touch ? 390 : 1280, height: touch ? 844 : 720 }, hasTouch: touch, ...(browserName === 'firefox' ? {} : {isMobile: touch}) });
    const page = await context.newPage();
    monitor(page);
    await page.goto(baseURL);
    await page.locator('#start').click();
    await page.waitForFunction(() => !document.querySelector('[data-action]').disabled);
    const name = await page.locator('#move').textContent();
    const button = page.locator(`[data-action="${answers[name]}"]`);
    if (touch) await button.tap(); else await button.click();
    await page.waitForFunction(() => document.querySelector('#combo').textContent === '1');
    assert.equal(await page.locator('#player-hp').textContent(), '100 / 100');
    await page.waitForFunction(() => document.querySelector('#feedback').textContent.includes('超時'), null, { timeout: 10000 });
    assert.equal(await page.locator('#player-hp').textContent(), '80 / 100');
    await context.close();
    console.log(`PASS: real ${touch ? 'touch' : 'mouse'} input and timeout`);
  }

  // 獨立可控制的單調時間用於完整 UI 路徑，不需等待每個視覺回合。
  const context = await browser.newContext();
  await context.addInitScript(() => {
    let time = 0;
    let callback;
    performance.now = () => time;
    window.requestAnimationFrame = fn => { callback = fn; return 1; };
    window.__advance = ms => {
      const end = time + ms;
      while (time < end) {
        time = Math.min(end, time + 20);
        const fn = callback;
        callback = null;
        if (fn) fn(time);
      }
    };
    window.__action = action => {
      const event = new PointerEvent('pointerdown', { bubbles: true, button: 0, isPrimary: true });
      Object.defineProperty(event, 'timeStamp', { value: time });
      document.querySelector(`[data-action="${action}"]`).dispatchEvent(event);
    };
  });
  const page = await context.newPage();
  monitor(page);
  await page.goto(baseURL);
  await page.locator('#start').click();
  const sizes = [[1280, 720], [1024, 768], [360, 640], [390, 844], [844, 390]];
  await page.evaluate(() => window.__advance(1400));
  for (const [width, height] of sizes) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(70);
    if (await page.locator("#pause").isVisible()) await page.locator("#resume").click();
    const layout = await page.evaluate(() => {
      const rect = id => {
        const r = document.getElementById(id).getBoundingClientRect();
        return { top: r.top, bottom: r.bottom, left: r.left, right: r.right };
      };
      return {
        width: innerWidth, height: innerHeight,
        scrollWidth: document.documentElement.scrollWidth, scrollHeight: document.documentElement.scrollHeight,
        buttons: [...document.querySelectorAll('[data-action]')].map(element => {
          const r = element.getBoundingClientRect();
          return { top: r.top, left: r.left, bottom: r.bottom, right: r.right, height: r.height, width: r.width };
        }), move: rect('move'), countdown: rect('countdown'), hp: rect('player-hp'),
        fighters: [...document.querySelectorAll('.fighter .silhouette, .fighter > span, .fighter .gesture')].map(element => {
          const r = element.getBoundingClientRect();
          return { top: r.top, bottom: r.bottom, left: r.left, right: r.right };
        }),
      };
    });
    assert.ok(layout.scrollWidth <= width && layout.scrollHeight <= height, `overflow ${width}x${height}: ${JSON.stringify(layout)}`);
    for (const rect of [...layout.buttons, layout.move, layout.countdown, layout.hp]) {
      assert.ok(rect.left >= 0 && rect.right <= width && rect.top >= 0 && rect.bottom <= height, `clipped ${width}x${height}`);
    }
    for (const rect of layout.buttons) assert.ok(rect.height >= 48 && rect.width >= 48);
    for (const fighter of layout.fighters) {
      for (const text of [layout.move, layout.countdown]) {
        const overlaps = fighter.left < text.right && fighter.right > text.left && fighter.top < text.bottom && fighter.bottom > text.top;
        assert.equal(overlaps, false, `fighter overlaps core text at ${width}x${height}`);
      }
    }
    assert.equal(layout.buttons[0].top === layout.buttons[2].top, width > height);
    await page.screenshot({ path: `${output}/${width}x${height}.png` });
    console.log(`PASS: layout ${width}x${height}, button order, no overflow, screenshot`);
  }
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.waitForTimeout(70);
  if (await page.locator("#pause").isVisible()) await page.locator("#resume").click();
  const counts = [0, 0, 0, 0, 0];
  for (let guard = 0; !(await page.locator('#result').isVisible()); guard++) {
    assert.ok(guard < 100);
    const info = await page.evaluate(() => ({
      stage: Number(document.getElementById('stage').textContent.split('/')[0]),
      name: document.getElementById('move').textContent,
      ready: !document.querySelector('[data-action]').disabled,
    }));
    if (!info.ready) { await page.evaluate(() => window.__advance(2000)); continue; }
    counts[info.stage - 1] += 1;
    const limit = [4000, 3500, 3000, 2500, 2000][info.stage - 1];
    await page.evaluate(({ elapsed, action }) => {
      window.__advance(elapsed);
      window.__action(action);
      // 同一畫面快速再觸發一次不得多次扣血。
      window.__action(action);
    }, { elapsed: limit * 0.4, action: answers[info.name] });
    await page.evaluate(() => {
      for (let i = 0; i < 300; i++) {
        if (!document.querySelector('[data-action]').disabled || !document.getElementById('result').hidden) break;
        window.__advance(20);
      }
    });
  }
  assert.deepEqual(counts, [8, 8, 10, 11, 15]);
  assert.equal(await page.locator('#result-title').textContent(), '五王擊破！');
  assert.ok((await page.locator('#summary').textContent()).includes('52 / 0 / 0'));
  await page.locator('#restart').click();
  assert.equal(await page.locator('#stage').textContent(), '1 / 5');
  for (let i = 0; i < 7; i++) {
    await page.evaluate(() => window.__advance(2500));
    const name = await page.locator('#move').textContent();
    const wrong = Object.values(answers).find(action => action !== answers[name]);
    await page.evaluate(action => window.__action(action), wrong);
  }
  assert.equal(await page.locator('#result-title').textContent(), '挑戰結束');
  await page.locator('#restart').click();
  assert.equal(await page.locator('#player-hp').textContent(), '100 / 100');
  assert.equal(await page.locator('#boss-hp').textContent(), '1050 / 1050');
  await page.evaluate(() => window.__advance(1500));
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  assert.equal(await page.locator('#pause').isVisible(), true);
  const frozen = await page.locator('#countdown').textContent();
  await page.evaluate(() => window.__advance(20000));
  assert.equal(await page.locator('#countdown').textContent(), frozen);
  await page.locator('#resume').click();
  assert.equal(await page.locator('#pause').isVisible(), false);
  assert.equal(await page.locator('#countdown').textContent(), frozen);
  await page.reload();
  assert.equal(await page.locator('#home').isVisible(), true);
  await context.close();
  assert.deepEqual(errors, []);
  console.log('PASS: full GREAT UI path 8/8/10/11/15, duplicate input, death, restart, background safety, refresh, no browser/resource errors');
} finally {
  await browser.close();
}
