import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { launchBrowser } from './browser-engine.mjs';

const browser = await launchBrowser();
const url = process.env.BOSS_RUSH_TEST_URL ?? 'http://127.0.0.1:8000/';
await mkdir('/tmp/boss-rush-home-v0.9.1', {recursive:true});
try {
  for (const [width,height] of [[320,568],[390,844],[430,932],[844,390]]) {
    const page=await browser.newPage({viewport:{width,height}});
    const errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.addInitScript(()=>{
      const Native=window.AudioContext;
      window.__tracks=[];
      window.AudioContext=class extends Native {
        createBufferSource(){
          const source=super.createBufferSource();
          const stop=source.stop.bind(source);
          source.stop=(...args)=>{source.__stopped=true;return stop(...args);};
          window.__tracks.push(source);return source;
        }
      };
    });
    await page.goto(url);
    assert.ok(!(await page.locator('#home').textContent()).includes('原型版本'));
    const boxes=await page.locator('#home .mode-buttons button').evaluateAll(elements=>elements.map(e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width};}));
    if(height>width){
      assert.equal(boxes[0].y,boxes[1].y);
      assert.equal(boxes[2].y,boxes[3].y);
      assert.ok(boxes[2].y>boxes[0].y);
      assert.equal(await page.locator('#difficulty-description span').first().evaluate(e=>getComputedStyle(e).display),'block');
    }else assert.equal(new Set(boxes.map(b=>b.y)).size,1);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    await page.screenshot({path:`/tmp/boss-rush-home-v0.9.1/${width}x${height}.png`});
    await page.locator('#start').click();
    await page.waitForFunction(()=>window.__tracks.some(s=>s.loop&&!s.__stopped));
    assert.equal(await page.evaluate(()=>window.__tracks.filter(s=>s.loop&&!s.__stopped).length),1);
    assert.ok(await page.evaluate(()=>window.__tracks.find(s=>s.loop).buffer.getChannelData(0).some(n=>Math.abs(n)>.05)));
    await page.locator('#manual-pause').click();
    assert.equal(await page.evaluate(()=>window.__tracks.filter(s=>s.loop&&!s.__stopped).length),0);
    await page.locator('#resume').click();
    await page.waitForFunction(()=>window.__tracks.some(s=>s.loop&&!s.__stopped));
    assert.deepEqual(errors,[]);
    await page.close();
    console.log(`PASS: ${width}x${height} home layout, real music buffer, pause/resume`);
  }
}finally{await browser.close();}
