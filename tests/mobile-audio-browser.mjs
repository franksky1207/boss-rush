import assert from 'node:assert/strict';
import { launchBrowser } from './browser-engine.mjs';

const browser=await launchBrowser();
try {
  // 模擬 iPhone 裝置辨識，仍使用目前選定的瀏覽器引擎，不視為實機結果。
  const context=await browser.newContext({viewport:{width:390,height:844},
    userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1'});
  await context.addInitScript(()=>{
    const NativeAudio=window.Audio;
    window.__outputs=[];
    window.Audio=function(...args){const audio=new NativeAudio(...args);window.__outputs.push(audio);return audio;};
    const NativeContext=window.AudioContext;
    window.AudioContext=class extends NativeContext {
      constructor(...args){super(...args);window.__audio=this;}
      createMediaStreamDestination(){const destination=super.createMediaStreamDestination();window.__stream=destination.stream;return destination;}
      createBufferSource(){window.__oscillators=(window.__oscillators??0)+1;return super.createBufferSource();}
      createOscillator(){window.__oscillators=(window.__oscillators??0)+1;return super.createOscillator();}
    };
  });
  const page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(process.env.BOSS_RUSH_TEST_URL??'http://127.0.0.1:8000/');
  await page.locator('[data-open-settings]:visible').click();
  await page.locator('#test-sound').click();
  await page.waitForFunction(()=>window.__audio?.state==='running'&&window.__outputs[0]?.paused===false);
  assert.equal(await page.evaluate(()=>window.__outputs.length),1);
  assert.equal(await page.evaluate(()=>window.__outputs[0].srcObject===window.__stream),true);
  assert.equal(await page.evaluate(()=>window.__stream.getAudioTracks()[0].readyState),'live');
  assert.ok(await page.evaluate(()=>window.__oscillators)>0);
  assert.match(await page.locator('#settings-status').textContent(),/手機媒體輸出/);
  await page.locator('#sound-enabled').uncheck();
  await page.locator('#test-sound').click();
  assert.match(await page.locator('#settings-status').textContent(),/關閉/);
  await page.locator('#sound-enabled').check();
  await page.locator('#test-sound').click();
  await page.waitForFunction(()=>window.__outputs[0]?.paused===false);
  assert.equal(await page.evaluate(()=>window.__outputs.length),1);
  await page.evaluate(()=>window.dispatchEvent(new Event('pagehide')));
  assert.equal(await page.evaluate(()=>window.__outputs[0].paused),true);
  assert.equal(await page.evaluate(()=>window.__outputs[0].muted),true);
  for (let i=0;i<5;i++) {
    await page.locator('#test-sound').click();
    await page.waitForFunction(()=>window.__audio?.state==='running'&&window.__outputs.at(-1)?.paused===false);
    assert.equal(await page.evaluate(()=>window.__outputs.at(-2).srcObject),null);
    assert.equal(await page.evaluate(()=>window.__stream.getAudioTracks()[0].readyState),'live');
    assert.match(await page.locator('#settings-status').textContent(),/手機媒體輸出/);
    await page.evaluate(()=>window.dispatchEvent(new Event('pagehide')));
    assert.equal(await page.evaluate(()=>window.__outputs.at(-1).paused),true);
  }
  assert.deepEqual(errors,[]);
  console.log('PASS: iPhone detection, media audio, mute/re-enable, five background/return rebuild cycles, visible status');
}finally{await browser.close();}
