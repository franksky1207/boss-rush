import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { auditStatic, resolveReference, root } from './static-audit.mjs';
import { readFile } from 'node:fs/promises';

test('Pages 靜態資源與九個模組完整，入口／全部依賴／素材快取一致', async()=>{
  const result=await auditStatic();
  assert.equal(result.modules,9);
  assert.equal(result.styles,1);
  assert.equal(result.images,21);
  assert.equal(result.fonts,1);
  assert.equal(result.version,JSON.parse(await readFile(resolve(root,'package.json'),'utf8')).version);
});
test('靜態檢查拒絕錯誤版本及 Pages 根絕對路徑，防止子路徑部署失效',()=>{
  assert.throws(()=>resolveReference('./styles/game.css?v=old',resolve(root,'index.html'),'0.6.0'));
  assert.throws(()=>resolveReference('/styles/game.css?v=0.6.0',resolve(root,'index.html'),'0.6.0'));
  assert.throws(()=>resolveReference('../../etc/passwd?v=0.6.0',resolve(root,'index.html'),'0.6.0'));
});
