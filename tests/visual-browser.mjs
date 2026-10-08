import { launchBrowser, browserName } from './browser-engine.mjs';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

const url = process.env.BOSS_RUSH_TEST_URL ?? 'http://127.0.0.1:8000/';
const output = process.env.BOSS_RUSH_TEST_OUTPUT ?? '/tmp/boss-rush-visual-validation';
await mkdir(output, { recursive: true });
const browser = await launchBrowser();
const actions = ['attack', 'defend', 'dodge', 'counter'];
const durations = [650, 750, 750, 850];
const errors = [];

async function contextFor(viewport, moveIndex = 0) {
  const context = await browser.newContext({ viewport });
  await context.addInitScript(index => {
    let time = 0;
    let callback;
    Math.random = () => (index + 0.1) / 4;
    performance.now = () => time;
    window.requestAnimationFrame = fn => { callback = fn; return 1; };
    window.__refresh = () => { const fn = callback; callback = null; if (fn) fn(time); };
    window.__advance = ms => {
      const end = time + ms;
      while (time < end) { time = Math.min(end, time + 10); window.__refresh(); }
    };
    window.__action = action => {
      const event = new PointerEvent('pointerdown', { bubbles: true, isPrimary: true, button: 0 });
      Object.defineProperty(event, 'timeStamp', { value: time });
      document.querySelector(`button[data-action="${action}"]`).dispatchEvent(event);
    };
  }, moveIndex);
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  return { context, page };
}

async function start(page) {
  await page.goto(url);
  await page.locator('#start').click();
  await page.evaluate(() => window.__advance(1300));
}

async function presentation(page) {
  return page.evaluate(() => ({
    phase: document.getElementById('arena').dataset.phase,
    presentation: document.getElementById('arena').dataset.presentation,
    heroTransform: document.querySelector('.hero .motion').style.transform,
    enemyTransform: document.querySelector('.enemy .motion').style.transform,
    kind: document.getElementById('combat-effect').dataset.kind,
    opacity: Number(document.getElementById('combat-effect').style.opacity),
    trail: Number(document.getElementById('dodge-trail').style.opacity),
    hp: document.getElementById('boss-hp').textContent,
    combo: document.getElementById('combo').textContent,
  }));
}

async function checkBounds(page, label) {
  const layout = await page.evaluate(() => {
    const rect = element => {
      const r = element.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, width: r.width, height: r.height };
    };
    const text = id => {
      const range = document.createRange();
      range.selectNodeContents(document.getElementById(id));
      return rect(range);
    };
    return {
      width: innerWidth, height: innerHeight, scrollWidth: document.documentElement.scrollWidth, scrollHeight: document.documentElement.scrollHeight,
      arena: rect(document.getElementById('arena')),
      text: ['move', 'countdown', 'cue'].map(text),
      sprites: [...document.querySelectorAll('.actor-image')].map(rect),
      buttons: [...document.querySelectorAll('button[data-action]')].map(rect),
      actors: [...document.querySelectorAll('.fighter')].map(rect),
      poses: [...document.querySelectorAll('.fighter')].map(element => element.dataset.pose),
    };
  });
  assert.ok(layout.scrollWidth <= layout.width && layout.scrollHeight <= layout.height, `scroll: ${label}`);
  for (const rect of [...layout.buttons, ...layout.text]) {
    assert.ok(rect.left >= 0 && rect.right <= layout.width && rect.top >= 0 && rect.bottom <= layout.height, `core clipping: ${label}`);
  }
  for (const rect of layout.buttons) assert.ok(rect.height >= 48 && rect.width >= 48);
  assert.equal(layout.buttons[0].top === layout.buttons[2].top, layout.width > layout.height);
  for (const sprite of layout.sprites) {
    assert.ok(sprite.left >= layout.arena.left && sprite.right <= layout.arena.right && sprite.top >= layout.arena.top && sprite.bottom <= layout.arena.bottom, `sprite clipping: ${label} ${JSON.stringify(sprite)}`);
    for (const text of layout.text) {
      const overlaps = sprite.left < text.right && sprite.right > text.left && sprite.top < text.bottom && sprite.bottom > text.top;
      assert.equal(overlaps, false, `sprite obscures core text: ${label}`);
    }
  }
  assert.ok(Math.abs(layout.actors[1].height / layout.actors[0].height - 1.5) < 0.02, `first boss ratio: ${label}`);
  return layout;
}

try {
  const sizes = [[1920, 1080], [1280, 720], [1024, 768], [360, 640], [390, 844], [844, 390], [667, 320]];
  for (const [width, height] of sizes) {
    for (let index = 0; index < actions.length; index++) {
      const action = actions[index];
      const { context, page } = await contextFor({ width, height }, index);
      await start(page);
      await page.waitForFunction(() => [...document.querySelectorAll('.fighter')].every(element => element.dataset.asset === 'ready'), null, { polling: 50 });
      await page.evaluate(() => window.__refresh());
      const base = await checkBounds(page, `${width}x${height} ${action} idle`);
      if (width > height) {
        for (const [actor, x] of [[base.actors[0], 0.22], [base.actors[1], 0.78]]) {
          assert.ok(Math.abs((actor.left + actor.width / 2 - base.arena.left) / base.arena.width - x) < 0.01);
          assert.ok(Math.abs((actor.bottom - base.arena.top) / base.arena.height - 0.87) < 0.01);
        }
      }
      await page.evaluate(action => { window.__action(action); window.__action(action); }, action);
      assert.equal(await page.locator('#boss-hp').textContent(), '930 / 1050');
      assert.equal(await page.locator('#combo').textContent(), '1');
      await page.evaluate(ms => window.__advance(ms), durations[index] * 0.3);
      const impact = await presentation(page);
      assert.equal(impact.phase, 'resolving');
      assert.equal(impact.presentation, action);
      assert.ok(impact.opacity > 0);
      if (action === 'attack') {
        const translation = impact.heroTransform.match(/translate\(([-\d.]+)px, ([-\d.]+)px\)/);
        assert.ok(width > height ? Number(translation[1]) > 0 : Number(translation[2]) < 0, `attack advances toward Boss at ${width}x${height}`);
      }
      if (action === 'dodge') assert.ok(impact.trail > 0);
      const geometry = await checkBounds(page, `${width}x${height} ${action} impact`);
      assert.ok(geometry.poses.includes(action === 'defend' || action === 'counter' ? 'defend' : action === 'attack' ? 'attack' : 'idle'));
      await page.screenshot({ path: `${output}/${width}x${height}-${action}.png` });
      await page.evaluate(() => window.dispatchEvent(new Event('blur')));
      const paused = await presentation(page);
      await page.evaluate(() => window.__advance(5000));
      assert.deepEqual(await presentation(page), paused);
      await page.locator('#resume').click();
      assert.deepEqual(await presentation(page), paused);
      await page.evaluate(ms => window.__advance(ms), durations[index] * 0.4);
      if (action === 'defend') assert.equal((await presentation(page)).kind, 'shockwave');
      if (action === 'counter') assert.equal((await presentation(page)).kind, 'counter-slash');
      await checkBounds(page, `${width}x${height} ${action} late`);
      await page.evaluate(ms => window.__advance(ms), durations[index] * 0.4);
      const ended = await presentation(page);
      assert.equal(ended.phase, 'nextTurn');
      assert.equal(ended.heroTransform, 'translate(0px, 0px) rotate(0deg)');
      assert.equal(ended.enemyTransform, 'translate(0px, 0px) rotate(0deg)');
      assert.equal(ended.opacity, 0);
      assert.equal(ended.trail, 0);
      assert.equal(ended.hp, '930 / 1050');
      assert.equal(ended.combo, '1');
      await page.evaluate(() => window.__advance(1300));
      assert.equal(await page.locator('#arena').getAttribute('data-phase'), 'awaitingInput');
      await context.close();
    }
    console.log(`PASS: ${width}x${height}, all four animations, size ratio, anchors, clipping, pause, return and duplicate input`);
  }

  // 動畫中旋轉不清空戰鬥，新的方向立即重測，恢復後無舊特效殘留。
  const rotated = await contextFor({ width: 844, height: 390 });
  await start(rotated.page);
  await rotated.page.evaluate(() => { window.__action('attack'); window.__advance(200); });
  await rotated.page.setViewportSize({ width: 390, height: 844 });
  await rotated.page.waitForTimeout(70);
  assert.equal(await rotated.page.locator('#pause').isVisible(), true);
  await rotated.page.evaluate(() => window.__advance(20000));
  await rotated.page.locator('#resume').click();
  await rotated.page.evaluate(() => window.__refresh());
  await checkBounds(rotated.page, 'rotation during attack');
  assert.equal(await rotated.page.locator('#boss-hp').textContent(), '930 / 1050');
  assert.equal(await rotated.page.locator('#combo').textContent(), '1');
  await rotated.page.evaluate(() => window.__advance(600));
  assert.equal((await presentation(rotated.page)).heroTransform, 'translate(0px, 0px) rotate(0deg)');
  await rotated.context.close();

  // 新勇者受傷姿態也須能載入，並隱藏原型武器，不能影響扣血。
  const hurt = await contextFor({ width: 390, height: 844 });
  await start(hurt.page);
  await hurt.page.evaluate(() => { window.__action('defend'); window.__advance(200); });
  await hurt.page.waitForFunction(() => document.querySelector('.hero').dataset.asset === 'ready', null, { polling: 50 });
  assert.equal(await hurt.page.locator('.hero').getAttribute('data-pose'), 'hurt');
  assert.ok((await hurt.page.locator('.hero .actor-image').getAttribute('src')).includes('/hurt.webp'));
  assert.equal(await hurt.page.locator('.hero .weapon').isVisible(), false);
  assert.equal(await hurt.page.locator('.hero .actor-shield').isVisible(), false);
  assert.equal(await hurt.page.locator('#player-hp').textContent(), '85 / 100');
  await hurt.page.screenshot({ path: `${output}/hero-hurt.png` });
  await hurt.context.close();
  console.log('PASS: hero hurt image and transparent sprite layer, prototype weapon hidden, HP unchanged');

  // 圖片載入失敗為預期測試：保留幾何角色及 CSS 場景，戰鬥仍可操作。
  const missing = await contextFor({ width: 390, height: 844 });
  let blocked = 0;
  await missing.page.route('**/assets/**/*.webp*', route => { blocked++; return route.abort(); });
  await start(missing.page);
  await missing.page.waitForFunction(() => [...document.querySelectorAll('.fighter')].every(element => element.dataset.asset === 'fallback'), null, { polling: 50 });
  assert.equal(await missing.page.locator('#scene-image').isVisible(), false);
  assert.equal(await missing.page.locator('.hero .silhouette').isVisible(), true);
  await missing.page.evaluate(() => { window.__action('attack'); window.__advance(1000); });
  assert.equal(await missing.page.locator('#boss-hp').textContent(), '930 / 1050');
  assert.equal(blocked, 5, 'missing images should not trigger retry loops');
  await missing.page.screenshot({ path: `${output}/missing-images.png` });
  await missing.context.close();
  assert.deepEqual(errors, []);
  console.log('PASS: rotation, missing-image fallback, no retry loops or runtime errors');
} finally {
  await browser.close();
}
