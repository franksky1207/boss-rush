import { launchBrowser, browserName } from './browser-engine.mjs';
import assert from 'node:assert/strict';
import { MOVES } from '../data/rules.js';
import { createRecord } from '../core/results.js';
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
  async function miss(){const name=await page.locator('#move').textContent();const answer=MOVES.find(m=>m.name===name).action;await page.evaluate(action=>window.__action(action),answer==='attack'?'defend':'attack');}
  assert.equal(await page.locator('#difficulty').inputValue(),'normal');
  for(const [difficulty,wrong] of [['easy',10],['normal',15],['hard',20]]) {
    await page.locator('#difficulty').selectOption(difficulty);
    assert.ok((await page.locator('#difficulty-description').textContent()).includes(`選錯扣 ${wrong}`));
    await page.locator('#start').click();
    assert.equal(await page.locator('#difficulty').isVisible(),false);
    await page.evaluate(()=>window.__advance(1400));
    await miss();
    assert.equal(await page.locator('#player-hp').textContent(),`${100-wrong} / 100`);
    for(let i=1;i<Math.ceil(100/wrong);i++){
      await page.evaluate(()=>window.__advance(2400));
      await miss();
    }
    assert.equal(await page.locator('#result').isVisible(),true);
    assert.ok((await page.locator('#result-mode').textContent()).includes({easy:'簡單',normal:'普通',hard:'困難'}[difficulty]));
    // 即使 DOM 的選項被改動，重新挑戰也必須沿用完成局難度。
    await page.evaluate(()=>document.querySelector('#difficulty').value='easy');
    await page.locator('#restart').click();
    await page.evaluate(()=>window.__advance(1400));
    await miss();
    assert.equal(await page.locator('#player-hp').textContent(),`${100-wrong} / 100`);
    await page.locator('#exit').click();await page.locator('#confirm-exit').click();
  }
  await page.locator('[data-open-board]').first().click();
  for(const difficulty of ['easy','normal','hard']) {
    await page.locator('#board-difficulty').selectOption(difficulty);
    assert.equal(await page.locator('#leaderboard-list li').count(),0);
  }
  const state={phase:'victory',mode:'challenge',bossIndex:4,bossHP:0,playerHP:100,highestCombo:52,battleMs:100,
    stats:{correct:52,wrong:0,timeout:0,PERFECT:0,GREAT:52,GOOD:0}};
  const records=['easy','normal','hard'].map(difficulty=>createRecord({...state,difficulty},difficulty,{id:difficulty,completedAt:1}));
  const legacy={...records[2],id:'legacy',name:'legacy'};delete legacy.difficulty;records.push(legacy);
  await page.evaluate(records=>localStorage.setItem('boss-rush.leaderboard.v1',JSON.stringify({version:1,records})),records);
  await page.reload();await page.locator('[data-open-board]').first().click();
  for(const difficulty of ['easy','normal','hard']){
    await page.locator('#board-difficulty').selectOption(difficulty);
    const text=await page.locator('#leaderboard-list').textContent();
    assert.ok(text.includes(difficulty));
    assert.equal(await page.locator('#leaderboard-list li').count(),difficulty==='hard'?2:1);
    for(const other of ['easy','normal','hard'].filter(d=>d!==difficulty))assert.ok(!text.includes(other));
  }
  assert.deepEqual(errors,[]);
  console.log('PASS: mobile three difficulty selection, locked battle setting, HP, death/result, replay retention, exit and board switching');
} finally { await browser.close(); }
