import { launchBrowser, browserName } from './browser-engine.mjs';
import assert from 'node:assert/strict';
import { MOVES } from '../data/rules.js';
import { LEADERBOARD_KEY } from '../storage/local.js';
const browser = await launchBrowser();
const url=process.env.BOSS_RUSH_TEST_URL??'http://127.0.0.1:8000/';
const errors=[], answers=Object.fromEntries(MOVES.map(move=>[move.name,move.action]));
try {
  const context=await browser.newContext({viewport:{width:1280,height:720}});
  await context.addInitScript(()=>{
    let now=0,id=0;
    const frames=new Map();
    performance.now=()=>now;
    Math.random=()=>.25;
    requestAnimationFrame=fn=>{frames.set(++id,fn);return id;};
    cancelAnimationFrame=key=>frames.delete(key);
    window.__pendingFrames=()=>frames.size;
    window.__advance=ms=>{
      const end=now+ms;
      while(now<end){
        now=Math.min(end,now+10);
        const work=[...frames.values()];frames.clear();
        for(const fn of work)fn(now);
      }
    };
    window.__action=(action,stale=false)=>{
      const event=new PointerEvent('pointerdown',{bubbles:true,button:0,isPrimary:true});
      Object.defineProperty(event,'timeStamp',{value:stale?0:now});
      document.querySelector('[data-action="'+action+'"]').dispatchEvent(event);
    };
    window.__gameTimers=0;
    for(const name of ['setTimeout','setInterval']){
      const native=window[name];
      window[name]=(...args)=>{
        if(/\/(?:ui|core|effects|storage)\//.test(new Error().stack))window.__gameTimers++;
        return native(...args);
      };
    }
  });
  const page=await context.newPage();
  page.on('pageerror',error=>errors.push(error.message));
  page.on('response',response=>{if(response.status()>=400)errors.push(response.url());});
  await page.goto(url);
  const view=()=>page.evaluate(()=>({
    phase:document.getElementById('arena').dataset.phase,
    fields:['stage','boss-hp','player-hp','combo','countdown','time'].map(id=>document.getElementById(id).textContent),
    transforms:[...document.querySelectorAll('.fighter .motion')].map(element=>element.style.transform),
  }));
  for(const phase of ['bossIntro','telegraph','awaitingInput','resolving','nextTurn','bossDefeated','berserkTransition','tutorial']){
    await page.locator(phase==='tutorial'?'#start-tutorial':'#start').click();
    await page.evaluate(({target,answers})=>{
      for(let i=0;i<50000;i++){
        if(document.getElementById('arena').dataset.phase===target)return;
        if(!document.querySelector('[data-action]').disabled)window.__action(answers[document.getElementById('move').textContent]);
        window.__advance(10);
      }
      throw new Error('無法到達 '+target);
    },{target:phase,answers});
    const before=await view();
    await page.locator(phase==='tutorial'?'#tutorial-pause':'#manual-pause').click();
    assert.equal(await page.locator('#battle').isVisible(),false);
    await page.evaluate(()=>window.__advance(50000));
    assert.deepEqual(await view(),before);
    await page.locator('#paused-exit').click();
    await page.locator('#cancel-exit').click();
    assert.equal(await page.locator('#pause').isVisible(),true);
    await page.locator('#resume').click();
    assert.deepEqual(await view(),before);
    assert.equal(await page.evaluate(()=>window.__pendingFrames()),1);
    await page.locator(phase==='tutorial'?'#tutorial-exit':'#exit').click();
    await page.locator('#confirm-exit').click();
    assert.equal(await page.locator('#home').isVisible(),true);
    console.log('PASS: pause/exit-cancel/remaining animation and clock '+phase);
  }
  // 200 次同頁反覆新局／退出；不存在多重 rAF、舊輸入或殘留排行榜寫入。
  await page.evaluate(answers=>{
    for(let i=0;i<200;i++){
      document.getElementById(i%2?'start-tutorial':'start').click();
      window.__advance(900);
      if(!document.getElementById('tutorial').hidden)document.getElementById('confirm-tutorial').click();
      window.__advance(400);
      const action=answers[document.getElementById('move').textContent];
      window.__action(action,true);
      if(document.getElementById('combo').textContent!=='0')throw new Error('舊事件被接受');
      document.getElementById('exit').click();
      document.getElementById('confirm-exit').click();
      if(window.__pendingFrames()!==1)throw new Error('新局新增 rAF');
    }
  },answers);
  assert.equal(await page.evaluate(()=>window.__pendingFrames()),1);
  assert.equal(await page.evaluate(()=>window.__gameTimers),0);
  assert.equal(await page.evaluate(key=>localStorage.getItem(key),LEADERBOARD_KEY),null);

  await page.locator('#start').click();
  await page.evaluate(()=>window.__advance(1300));
  const answer=answers[await page.locator('#move').textContent()];
  await page.evaluate(action=>{window.__advance(4000);window.__action(action);window.__action(action);},answer);
  assert.ok((await page.locator('#feedback').textContent()).startsWith('GOOD'));
  assert.equal(await page.locator('#combo').textContent(),'1');
  await page.locator('#exit').click();await page.locator('#confirm-exit').click();
  await page.locator('#start').click();
  await page.evaluate(()=>{window.__advance(5301);window.__action('attack');window.__action('attack');});
  assert.equal(await page.locator('#player-hp').textContent(),'80 / 100');
  assert.ok((await page.locator('#feedback').textContent()).includes('超時'));
  assert.equal(await page.evaluate(()=>window.__pendingFrames()),1);
  assert.equal(await page.evaluate(()=>window.__gameTimers),0);
  assert.deepEqual(errors,[]);
  await context.close();
  console.log('PASS: 200 mode/restart/exit cycles, one rAF, zero game timeout/interval, stale timestamp rejection, exact deadline GOOD and late timeout only once');
}finally{await browser.close();}
