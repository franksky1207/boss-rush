import assert from 'node:assert/strict';
import {launchBrowser} from './browser-engine.mjs';
const browser=await launchBrowser();
try {
  for(const [width,height] of [[320,568],[390,844],[844,390]]) {
    const page=await browser.newPage({viewport:{width,height}});
    await page.addInitScript(()=>{
      const Native=AudioContext;window.__loops=[];
      window.AudioContext=class extends Native {
        createBufferSource(){const s=super.createBufferSource();const stop=s.stop.bind(s);s.stop=(...a)=>{s.__stopped=true;return stop(...a);};window.__loops.push(s);return s;}
      };
    });
    await page.goto(process.env.BOSS_RUSH_TEST_URL??'http://127.0.0.1:8000/');
    await page.locator('#start').click();
    await page.waitForFunction(()=>window.__loops.some(s=>s.loop&&!s.__stopped));
    const button=page.locator('#toggle-music');await button.click();
    assert.equal(await button.getAttribute('aria-pressed'),'false');
    assert.equal(await page.evaluate(()=>window.__loops.filter(s=>s.loop&&!s.__stopped).length),0);
    assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('boss-rush.preferences.v1')).preferences.sound),true);
    const box=await button.boundingBox();assert.ok(box.x>=0&&box.x+box.width<=width);
    await button.click();await page.waitForFunction(()=>window.__loops.some(s=>s.loop&&!s.__stopped));
    await button.click();await page.reload();await page.locator('#start').click();
    assert.equal(await button.getAttribute('aria-pressed'),'false');
    console.log(`PASS: ${width}x${height} music toggle, sound preserved, reload preference, button layout`);
    await page.close();
  }
}finally{await browser.close();}
