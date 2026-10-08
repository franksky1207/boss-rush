import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
const engines=createRequire(import.meta.url)('playwright');
export const browserName=process.env.BOSS_RUSH_BROWSER ?? 'chromium';
if(!['chromium','firefox','webkit'].includes(browserName))throw new RangeError('未知瀏覽器：'+browserName);
export async function launchBrowser(){
  const options={headless:true};
  if(browserName==='chromium'){
    const path=process.env.CHROMIUM_PATH ?? (existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined);
    if(path)options.executablePath=path;
  }
  const browser=await engines[browserName].launch(options);
  console.log(`ENGINE: ${browserName} ${browser.version()}`);
  return browser;
}
