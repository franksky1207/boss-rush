import { launchBrowser, browserName } from './browser-engine.mjs';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { MOVES } from '../data/rules.js';

const url = process.env.BOSS_RUSH_TEST_URL ?? 'http://127.0.0.1:8000/';
const output = process.env.BOSS_RUSH_TEST_OUTPUT ?? '/tmp/boss-rush-boss-validation';
await mkdir(output, { recursive: true });
const browser = await launchBrowser();
const ratios = [1.5, 0.95, 1.25, 1.35, 1.7];
const ids = ['iron-guard', 'shadow-assassin', 'flame-general', 'void-lord', 'final-overlord'];
const errors = [];

async function bounds(page, label, ratio) {
  const info = await page.evaluate(() => {
    const rect = element => {
      const r = element.getBoundingClientRect();
      return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, height: r.height };
    };
    const texts = ['move', 'cue', 'countdown'].map(id => {
      const range = document.createRange();
      range.selectNodeContents(document.getElementById(id));
      return rect(range);
    });
    return { width: innerWidth, height: innerHeight, scrollWidth: document.documentElement.scrollWidth, scrollHeight: document.documentElement.scrollHeight,
      arena: rect(document.getElementById('arena')), texts,
      actors: [...document.querySelectorAll('.fighter')].map(rect),
      sprites: [...document.querySelectorAll('.actor-image')].map(rect),
      buttons: [...document.querySelectorAll('button[data-action]')].map(rect),
    };
  });
  assert.ok(info.scrollWidth <= info.width && info.scrollHeight <= info.height, `scroll: ${label}`);
  assert.ok(Math.abs(info.actors[1].height / info.actors[0].height - ratio) < 0.02, `ratio: ${label}`);
  for (const sprite of info.sprites) {
    assert.ok(sprite.left >= info.arena.left && sprite.right <= info.arena.right && sprite.top >= info.arena.top && sprite.bottom <= info.arena.bottom, `clipped: ${label} ${JSON.stringify(sprite)}`);
    for (const text of info.texts) {
      assert.equal(sprite.left < text.right && sprite.right > text.left && sprite.top < text.bottom && sprite.bottom > text.top, false, `text overlap: ${label}`);
    }
  }
  for (const item of [...info.texts, ...info.buttons]) assert.ok(item.left >= 0 && item.right <= info.width && item.top >= 0 && item.bottom <= info.height, `core clipping: ${label}`);
}

try {
  for (const [width, height] of [[1280, 720], [1024, 768], [360, 640], [667, 320]]) {
    const context = await browser.newContext({ viewport: { width, height } });
    await context.addInitScript(() => {
      let time = 0;
      let callback;
      let seed = 20261008;
      Math.random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32; };
      performance.now = () => time;
      window.requestAnimationFrame = fn => { callback = fn; return 1; };
      window.__advance = ms => {
        const end = time + ms;
        while (time < end) { time = Math.min(end, time + 10); const fn = callback; callback = null; if (fn) fn(time); }
      };
      window.__action = action => {
        const event = new PointerEvent('pointerdown', { bubbles: true, isPrimary: true, button: 0 });
        Object.defineProperty(event, 'timeStamp', { value: time });
        document.querySelector(`button[data-action="${action}"]`).dispatchEvent(event);
      };
    });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
    await page.goto(url);
    await page.locator('#start').click();
    let lastMove = null;
    let run = 0;
    let lastStage = 0;
    let berserks = 0;
    const stageSeen = new Set();
    const backgrounds = new Set();
    for (let guard = 0; !(await page.locator('#result').isVisible()); guard++) {
      assert.ok(guard < 100);
      await page.evaluate(() => {
        for (let i = 0; i < 500; i++) {
          const phase = document.getElementById('arena').dataset.phase;
          if (phase === 'awaitingInput' || phase === 'berserkTransition' || !document.getElementById('result').hidden) break;
          window.__advance(10);
        }
      });
      if (await page.locator('#result').isVisible()) break;
      const phase = await page.locator('#arena').getAttribute('data-phase');
      const stage = Number((await page.locator('#stage').textContent()).split('/')[0]);
      const berserk = phase === 'berserkTransition';
      if (stage !== lastStage || berserk) {
        try {
          // 測試凍結了 rAF；資源載入應以真實固定間隔輪詢，不等待視覺時計。
          await page.waitForFunction(() => [...document.querySelectorAll('.fighter')].every(element => element.dataset.asset === 'ready') && !document.getElementById('scene-image').hidden, null, { polling: 50 });
        } catch (error) {
          const detail = await page.evaluate(() => ({
            phase: document.getElementById('arena').dataset.phase,
            actors: [...document.querySelectorAll('.fighter')].map(element => ({ ...element.dataset, src: element.querySelector('img').src })),
            background: { src: document.getElementById('scene-image').src, hidden: document.getElementById('scene-image').hidden, complete: document.getElementById('scene-image').complete },
          }));
          throw new Error(`asset readiness ${width}x${height} stage ${stage}: ${JSON.stringify(detail)}`, { cause: error });
        }
        await bounds(page, `${width}x${height} stage ${stage} ${phase}`, ratios[stage - 1]);
        const actor = await page.locator('.enemy').getAttribute('data-actor');
        assert.equal(actor, berserk ? 'final-overlord-berserk' : ids[stage - 1]);
        const background = await page.locator('#scene-image').getAttribute('src');
        backgrounds.add(background);
        await page.screenshot({ path: `${output}/${width}x${height}-boss${stage}${berserk ? '-berserk' : ''}.png` });
        stageSeen.add(stage);
        lastStage = stage;
      }
      if (berserk) {
        berserks += 1;
        assert.equal(stage, 5);
        assert.equal(await page.locator('#boss-hp').textContent(), '1920 / 4800');
        assert.equal(await page.locator('button[data-action="attack"]').isDisabled(), true);
        const frozen = await page.evaluate(() => ['boss-hp', 'player-hp', 'combo', 'time'].map(id => document.getElementById(id).textContent));
        await page.evaluate(() => { window.__action('attack'); window.__advance(500); window.dispatchEvent(new Event('blur')); });
        assert.equal(await page.locator('#pause').isVisible(), true);
        await page.evaluate(() => window.__advance(20000));
        await page.locator('#resume').click();
        assert.deepEqual(await page.evaluate(() => ['boss-hp', 'player-hp', 'combo', 'time'].map(id => document.getElementById(id).textContent)), frozen);
        await page.evaluate(() => window.__advance(500));
        assert.equal(await page.locator('#arena').getAttribute('data-phase'), 'nextTurn');
        assert.deepEqual(await page.evaluate(() => ['boss-hp', 'player-hp', 'combo', 'time'].map(id => document.getElementById(id).textContent)), frozen);
        continue;
      }
      const name = await page.locator('#move').textContent();
      const selected = MOVES.find(move => move.name === name);
      assert.ok(selected && selected.unlockBoss <= stage);
      assert.notEqual(selected.id, lastMove?.id);
      run = lastMove?.action === selected.action ? run + 1 : 1;
      assert.ok(run <= 2);
      lastMove = selected;
      if (stage === 5) assert.equal(await page.locator('#countdown').textContent(), '2.00 秒');
      await bounds(page, `${width}x${height} ${name}`, ratios[stage - 1]);
      const before = await page.locator('#boss-hp').textContent();
      await page.evaluate(action => { window.__action(action); window.__action(action); window.__advance(250); }, selected.action);
      assert.notEqual(await page.locator('#boss-hp').textContent(), before);
      await bounds(page, `${width}x${height} ${name} impact`, ratios[stage - 1]);
    }
    assert.equal(await page.locator('#result-title').textContent(), '五王擊破！');
    assert.equal(stageSeen.size, 5);
    assert.equal(backgrounds.size, 5);
    assert.equal(berserks, 1);
    await page.locator('#restart').click();
    assert.equal(await page.locator('#arena').getAttribute('data-berserk'), 'false');
    assert.equal(await page.locator('#stage').textContent(), '1 / 5');
    await context.close();
    console.log(`PASS: ${width}x${height}, all five bosses/ratios/backgrounds, locked moves, draw constraints, single berserk at 1920 HP, pause, 2s deadline, victory and restart`);
  }
  assert.deepEqual(errors, []);
} finally { await browser.close(); }
