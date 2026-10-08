import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { MOVES } from '../data/rules.js';
import { createRecord } from '../core/results.js';
import { PREFERENCES_KEY, LEADERBOARD_KEY } from '../storage/local.js';

const { chromium } = createRequire(import.meta.url)('playwright');
const browser = await chromium.launch({ ...((process.env.CHROMIUM_PATH || existsSync('/usr/bin/chromium')) ? {executablePath:process.env.CHROMIUM_PATH ?? '/usr/bin/chromium'} : {}), headless:true });
const url = process.env.BOSS_RUSH_TEST_URL ?? 'http://127.0.0.1:8000/';
const output = process.env.BOSS_RUSH_TEST_OUTPUT ?? '/tmp/boss-rush-score-validation';
await mkdir(output,{recursive:true});
const errors=[];
const answers=Object.fromEntries(MOVES.map(move=>[move.name,move.action]));
async function contextFor({failure=null,seed=null,viewport={width:390,height:844}}={}) {
  const context=await browser.newContext({viewport});
  await context.addInitScript(({failure,seed,boardKey})=>{
    let time=0, frame;
    Math.random=()=>0;
    performance.now=()=>time;
    requestAnimationFrame=fn=>{frame=fn;return 1;};
    window.__advance=ms=>{
      const end=time+ms;
      while(time<end){time=Math.min(end,time+10);const fn=frame;frame=null;if(fn)fn(time);}
    };
    window.__action=action=>{
      const event=new PointerEvent('pointerdown',{bubbles:true,isPrimary:true,button:0});
      Object.defineProperty(event,'timeStamp',{value:time});
      document.querySelector('[data-action="'+action+'"]').dispatchEvent(event);
    };
    if(seed!==null)localStorage.setItem(boardKey,JSON.stringify(seed));
    if(failure==='quota')Storage.prototype.setItem=()=>{throw new DOMException('測試儲存空間不足','QuotaExceededError');};
    if(failure==='blocked')Object.defineProperty(window,'localStorage',{get(){throw new DOMException('測試禁止儲存','SecurityError');}});
    const NativeContext=window.AudioContext;
    window.__audioCreated=0;
    window.__oscillators=0;
    window.__audioGains=[];
    if(NativeContext)window.AudioContext=class extends NativeContext {
      constructor(...args){super(...args);window.__audioCreated++;window.__audioContext=this;}
      createGain(){const gain=super.createGain();window.__audioGains.push(gain);return gain;}
      createBufferSource(){window.__oscillators=(window.__oscillators??0)+1;return super.createBufferSource();}
      createOscillator(){window.__oscillators++;return super.createOscillator();}
    };
    if(failure==='blocked'&&NativeContext)window.AudioContext=class extends window.AudioContext {
      get state(){return 'suspended';}
      resume(){return Promise.reject(new Error('測試音訊未獲允許'));}
    };
  },{failure,seed,boardKey:LEADERBOARD_KEY});
  const page=await context.newPage();
  page.on('pageerror',error=>errors.push(error.message));
  page.on('response',response=>{if(response.status()>=400)errors.push(response.url());});
  await page.goto(url);
  return {context,page};
}
async function play(page,mode='challenge',reaction=.4,wrong=false) {
  await page.locator(mode==='tutorial'?'#start-tutorial':'#start').click();
  await page.evaluate(({answers,reaction,wrong})=>{
    for(let guard=0;guard<600;guard++){
      if(!document.getElementById('result').hidden)return;
      if(!document.getElementById('tutorial').hidden)document.getElementById('confirm-tutorial').click();
      else if(!document.querySelector('[data-action]').disabled){
        const stage=Number(document.getElementById('stage').textContent.split('/')[0]);
        const correct=answers[document.getElementById('move').textContent];
        window.__advance([4000,3500,3000,2500,2000][stage-1]*reaction);
        window.__action(wrong?(correct==='attack'?'defend':'attack'):correct);
      }
      for(let i=0;i<300;i++){
        if(!document.getElementById('result').hidden||!document.getElementById('tutorial').hidden||!document.querySelector('[data-action]').disabled)break;
        window.__advance(10);
      }
    }
    throw new Error('測試路徑未完成');
  },{answers,reaction,wrong});
}
async function board(page){await page.locator('[data-open-board]:visible').first().click();}
async function setVolume(page,value){
  await page.locator('#volume').evaluate((element,value)=>{element.value=value;element.dispatchEvent(new Event('input',{bubbles:true}));},String(value));
}
try {
  const main=await contextFor();
  const {page}=main;
  assert.equal(await page.evaluate(()=>window.__audioCreated),0);
  await page.locator('[data-open-settings]:visible').click();
  await page.waitForFunction(()=>window.__audioContext?.state==='running',null,{polling:50});
  assert.equal(await page.evaluate(()=>window.__audioCreated),1);
  await setVolume(page,37);
  assert.equal(await page.locator('#volume-value').textContent(),'37%');
  assert.ok(Math.abs(await page.evaluate(()=>window.__audioGains[0].gain.value)-.37*.22)<1e-6);
  await page.locator('#test-sound').click();
  assert.ok(await page.evaluate(()=>window.__oscillators)>0);
  await setVolume(page,0);
  const silent=await page.evaluate(()=>window.__oscillators);
  await page.locator('#test-sound').click();
  assert.equal(await page.evaluate(()=>window.__oscillators),silent);
  await setVolume(page,100);
  assert.ok(Math.abs(await page.evaluate(()=>window.__audioGains[0].gain.value)-.22)<1e-6);
  await page.locator('#sound-enabled').uncheck();
  const off=await page.evaluate(()=>window.__oscillators);
  await page.locator('#test-sound').click();
  assert.equal(await page.evaluate(()=>window.__oscillators),off);
  await setVolume(page,37);
  await page.locator('#reduced-effects').check();
  await page.screenshot({path:output+'/settings-390x844.png'});
  await page.locator('#close-settings').click();
  await page.reload();
  assert.equal(await page.evaluate(()=>window.__audioCreated),0);
  await page.locator('[data-open-settings]:visible').click();
  assert.equal(await page.locator('#sound-enabled').isChecked(),false);
  assert.equal(await page.locator('#volume').inputValue(),'37');
  assert.equal(await page.locator('#reduced-effects').isChecked(),true);
  await page.locator('#close-settings').click();

  await play(page);
  assert.equal(await page.locator('#result-grade').textContent(),'評價 SS');
  assert.ok((await page.locator('#summary').textContent()).includes('52 / 0 / 0'));
  assert.equal(await page.locator('#save-score').isVisible(),true);
  await page.locator('#nickname').fill('😀'.repeat(13));
  await page.locator('#submit-score').click();
  assert.equal(await page.locator('#nickname').getAttribute('aria-invalid'),'true');
  assert.equal(await page.evaluate(key=>localStorage.getItem(key),LEADERBOARD_KEY),null);
  await page.locator('#nickname').fill('測試學生');
  await page.locator('#submit-score').click();
  assert.equal(await page.locator('#submit-score').isDisabled(),true);
  await page.locator('#save-score').evaluate(form=>form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
  const read=()=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)),LEADERBOARD_KEY);
  assert.equal((await read()).records.length,1);
  await board(page);
  assert.equal(await page.locator('#leaderboard-list li').count(),1);
  await page.locator('#clear-board').click();
  assert.equal(await page.locator('#clear-confirmation').isVisible(),true);
  await page.locator('#cancel-clear').click();
  assert.equal(await page.locator('#leaderboard-list li').count(),1);
  await page.locator('#close-board').click();
  assert.equal(await page.locator('#submit-score').isDisabled(),true);
  await page.screenshot({path:output+'/result-390x844.png'});
  await page.reload();
  await board(page);
  assert.equal(await page.locator('#leaderboard-list li').count(),1);
  await page.locator('#close-board').click();
  await play(page,'challenge',.2);
  assert.equal(await page.locator('#result-grade').textContent(),'評價 SSS');
  await page.locator('#nickname').fill('測試學生');
  await page.locator('#submit-score').click();
  assert.equal((await read()).records.length,2);
  assert.deepEqual((await read()).records.map(record=>record.grade),['SSS','SS']);
  await page.locator('#back-home').click();
  await play(page,'tutorial');
  assert.equal(await page.locator('#result-grade').textContent(),'評價 SS');
  assert.equal(await page.locator('#save-score').isVisible(),false);
  assert.equal((await read()).records.length,2);
  await page.locator('#back-home').click();
  await play(page,'challenge',.1,true);
  assert.equal(await page.locator('#result-grade').textContent(),'評價 C');
  assert.equal(await page.locator('#save-score').isVisible(),false);
  assert.equal((await read()).records.length,2);
  await page.locator('#back-home').click();
  await page.locator('#start').click();
  await page.evaluate(()=>window.__advance(1300));
  assert.equal(await page.locator('#arena').getAttribute('data-reduced'),'true');
  const remaining=await page.locator('#countdown').textContent();
  await page.locator('#manual-pause').click();
  await page.locator('#pause [data-open-settings]').click();
  await page.locator('#reduced-effects').uncheck();
  await page.evaluate(()=>window.__advance(5000));
  await page.locator('#close-settings').click();
  assert.equal(await page.locator('#pause').isVisible(),true);
  await page.locator('#resume').click();
  assert.equal(await page.locator('#countdown').textContent(),remaining);
  assert.equal(await page.locator('#arena').getAttribute('data-reduced'),'false');
  await page.locator('#exit').click();
  await page.locator('#confirm-exit').click();
  assert.equal((await read()).records.length,2);
  await board(page);
  await page.screenshot({path:output+'/board-390x844.png'});
  await page.locator('#clear-board').click();
  await page.locator('#confirm-clear').click();
  assert.equal(await page.locator('#leaderboard-list li').count(),0);
  assert.equal((await read()).records.length,0);
  assert.deepEqual(await page.evaluate(key=>JSON.parse(localStorage.getItem(key)).preferences,PREFERENCES_KEY),
    {sound:false,volume:37,reducedEffects:false});
  await page.reload();
  await board(page);
  assert.equal(await page.locator('#leaderboard-list li').count(),0);
  await main.context.close();
  console.log('PASS: real Web Audio unlock/gain/off/zero, preferences reload, full GREAT SS, full PERFECT SSS, same-name persistent scores, duplicate prevention, tutorial/death/exit exclusion, clear cancel/confirm, pause settings remaining time');

  for(const failure of ['quota','blocked']){
    const run=await contextFor({failure,viewport:{width:667,height:320}});
    await run.page.locator('[data-open-settings]:visible').click();
    await run.page.locator('#reduced-effects').check();
    assert.ok((await run.page.locator('#settings-status').textContent()).includes('無法儲存'));
    await run.page.locator('#close-settings').click();
    await play(run.page);
    assert.equal(await run.page.locator('#result-grade').textContent(),'評價 SS');
    await run.page.locator('#nickname').fill('暫存學生');
    await run.page.locator('#submit-score').click();
    assert.ok((await run.page.locator('#save-status').textContent()).includes('無法儲存'));
    assert.ok((await run.page.locator('#summary').textContent()).includes('52 / 0 / 0'));
    await board(run.page);
    assert.equal(await run.page.locator('#leaderboard-list li').count(),1);
    await run.page.locator('#clear-board').click();
    await run.page.locator('#confirm-clear').click();
    assert.equal(await run.page.locator('#leaderboard-list li').count(),0);
    assert.ok((await run.page.locator('#leaderboard-status').textContent()).includes('重新整理可能再次出現'));
    await run.page.locator('#close-board').click();
    assert.equal(await run.page.locator('#submit-score').isDisabled(),true);
    await run.page.locator('#restart').click();
    assert.equal(await run.page.locator('#stage').textContent(),'1 / 5');
    await run.context.close();
    console.log('PASS: '+failure+' storage, denied audio, complete result retained, one-time in-memory score, failed clear notice, replay');
  }

  const records=Array.from({length:25},(_,index)=>createRecord({phase:'victory',mode:'challenge',bossIndex:4,bossHP:0,
    playerHP:100,highestCombo:100,battleMs:1000-index,stats:{correct:100,wrong:0,timeout:0,PERFECT:0,GREAT:100,GOOD:0}},
    index===24?'<img src=x>':'學生'+index,{id:String(index),completedAt:1000+index}));
  const seeded=await contextFor({seed:{version:1,records},viewport:{width:360,height:640}});
  await board(seeded.page);
  assert.equal(await seeded.page.locator('#leaderboard-list li').count(),20);
  assert.ok((await seeded.page.locator('#leaderboard-list li').first().textContent()).includes('<img src=x>'));
  assert.equal(await seeded.page.locator('#leaderboard-list img').count(),0);
  await seeded.page.screenshot({path:output+'/board-360x640.png'});
  await seeded.context.close();

  // 真實時計與觸控，加上 4 倍 CPU 節流，檢查降低特效下仍能判定。
  const slow=await browser.newContext({viewport:{width:667,height:320},hasTouch:true,isMobile:true});
  await slow.addInitScript(key=>localStorage.setItem(key,JSON.stringify({version:1,
    preferences:{sound:false,volume:70,reducedEffects:true}})),PREFERENCES_KEY);
  const slowPage=await slow.newPage();
  slowPage.on('pageerror',error=>errors.push(error.message));
  const client=await slow.newCDPSession(slowPage);
  await client.send('Emulation.setCPUThrottlingRate',{rate:4});
  await slowPage.goto(url);
  await slowPage.locator('#start').tap();
  await slowPage.waitForFunction(()=>!document.querySelector('[data-action]').disabled);
  const slowMove=await slowPage.locator('#move').textContent();
  await slowPage.locator('[data-action="'+answers[slowMove]+'"]').tap();
  assert.equal(await slowPage.locator('#combo').textContent(),'1');
  assert.equal(await slowPage.locator('#player-hp').textContent(),'100 / 100');
  assert.equal(await slowPage.locator('#arena').getAttribute('data-reduced'),'true');
  await slowPage.screenshot({path:output+'/reduced-cpu-667x320.png'});
  await slow.close();
  console.log('PASS: real-clock touch judgment with reduced effects and 4x CPU throttling');
  assert.deepEqual(errors,[]);
  console.log('PASS: loaded top 20 sorting, escaped nickname, mobile board, no runtime/resource errors');
} finally { await browser.close(); }
