import { launchBrowser, browserName } from './browser-engine.mjs';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
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
  await mkdir('/tmp/boss-rush-presentation-validation',{recursive:true});
  const page = await context.newPage();
  page.on('pageerror', e => errors.push(e.message));
  page.on('response', r => { if (r.status() >= 400) errors.push(r.url()); });
  await page.goto(process.env.BOSS_RUSH_TEST_URL ?? 'http://127.0.0.1:8000/');
  await page.evaluate(()=>document.fonts.ready);
  assert.equal(await page.evaluate(()=>document.fonts.check('700 24px "Rush Serif TC"','魔力蓄積')),true);
  await page.screenshot({path:'/tmp/boss-rush-presentation-validation/home.png'});
  await page.locator('#start').click();await page.evaluate(()=>window.__advance(1400));
  async function choose(correct=true){
    const name=await page.locator('#move').textContent();const action=MOVES.find(m=>m.name===name).action;
    await page.evaluate(action=>window.__action(action),correct?action:action==='attack'?'defend':'attack');
  }
  await choose();await page.evaluate(()=>window.__advance(250));
  assert.equal(await page.locator('#rating-text').textContent(),'PERFECT');
  assert.equal(await page.locator('#damage-text').textContent(),'−120');
  assert.ok(Number(await page.locator('#combat-effect').evaluate(el=>getComputedStyle(el).opacity))>0);
  assert.notEqual(await page.locator('#combat-effect').evaluate(el=>getComputedStyle(el,'::before').display),'none');
  async function presentation(){return page.evaluate(()=>Object.fromEntries(['damage-text','rating-text','combo-burst','combat-effect'].map(id=>[id,{text:document.getElementById(id).textContent,style:document.getElementById(id).getAttribute('style')}])));}
  const before=await presentation();await page.locator('#manual-pause').click();
  await page.evaluate(()=>window.__advance(50000));assert.deepEqual(await presentation(),before);
  await page.locator('#resume').click();assert.deepEqual(await presentation(),before);
  await page.screenshot({path:'/tmp/boss-rush-presentation-validation/mobile-impact.png'});
  await page.setViewportSize({width:1280,height:720});await page.waitForTimeout(100);
  // 旋轉自動暫停，手動恢復後再拍攝，並確認文字特效不佔操作空間。
  if(await page.locator('#pause').isVisible())await page.locator('#resume').click();
  await page.screenshot({path:'/tmp/boss-rush-presentation-validation/desktop-impact.png'});
  await page.locator('#manual-pause').click();
  await page.locator('#pause [data-open-settings]').click();
  await page.locator('#reduced-effects').check();await page.locator('#close-settings').click();
  assert.equal(await page.locator('#combat-effect').evaluate(el=>getComputedStyle(el,'::before').display),'none');
  assert.ok((await page.locator('#damage-text').getAttribute('style')).includes('scale(1)'));
  await page.locator('#resume').click();
  for(let i=0;i<4;i++){await page.evaluate(()=>window.__advance(2400));await choose();await page.evaluate(()=>window.__advance(250));}
  assert.equal(await page.locator('#combo').textContent(),'5');assert.equal(await page.locator('#combo-burst').textContent(),'5 連擊');
  await page.locator('#exit').click();await page.locator('#confirm-exit').click();
  assert.equal(await page.locator('#rating-text').textContent(),'');assert.equal(await page.locator('#combo-burst').textContent(),'');
  for(const [difficulty,wrong,timeout] of [['easy',10,15],['normal',15,20],['hard',20,30]]){
    await page.locator('#difficulty').selectOption(difficulty);await page.locator('#start').click();
    await page.evaluate(()=>window.__advance(1400));await choose(false);await page.evaluate(()=>window.__advance(200));
    assert.ok((await page.locator('#feedback').textContent()).includes(`−${wrong} HP`));
    assert.equal(await page.locator('#rating-text').textContent(),'MISS');
    await page.evaluate(()=>{let guard=0;while(!document.querySelector('#feedback').textContent.includes('超時')){window.__advance(10);if(++guard>1000)throw new Error('timeout not observed');}window.__advance(200);});
    assert.ok((await page.locator('#feedback').textContent()).includes(`−${timeout} HP`));
    assert.equal(await page.locator('#rating-text').textContent(),'TIME OUT');
    await page.locator('#exit').click();await page.locator('#confirm-exit').click();
  }
  assert.deepEqual(errors,[]);
  // 字體載入失敗仍能顯示系統字體與判定，不等待重試。
  const fallback=await browser.newContext();const fallbackPage=await fallback.newPage();let fontRequests=0;
  await fallbackPage.route('**/assets/fonts/*.woff*',route=>{fontRequests++;return route.abort();});
  await fallbackPage.goto(process.env.BOSS_RUSH_TEST_URL??'http://127.0.0.1:8000/');
  await fallbackPage.locator('#start').click();await fallbackPage.waitForFunction(()=>!document.querySelector('[data-action="attack"]').disabled);
  assert.equal(fontRequests,1);assert.ok((await fallbackPage.locator('#move').textContent()).length>0);
  await fallback.close();
  console.log('PASS: local font, combat particles, rating/damage/combo text, pause/resume freeze, reduced effects, exit cleanup, three difficulty feedback, font-failure fallback');
} finally {await browser.close();}
