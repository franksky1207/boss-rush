import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { createHash } from 'node:crypto';
import { root, auditStatic } from '../tests/static-audit.mjs';
const target=resolve(root,'dist/boss-rush');
const manifest=JSON.parse(await readFile(resolve(target,'release-manifest.json'),'utf8'));
const audit=await auditStatic();
assert.equal(manifest.version,audit.version);
assert.equal(manifest.path,'/boss-rush/');
const expected=[...audit.files,'assets/fonts/OFL-NotoSerifTC.txt'].sort();
assert.deepEqual(manifest.files.map(item=>item.file),expected);
const found=[];
async function walk(folder){
  for(const entry of await readdir(folder,{withFileTypes:true})){
    const path=resolve(folder,entry.name);
    if(entry.isDirectory())await walk(path);
    else{assert.ok(entry.isFile(),'發布目錄不得有連結或非檔案項目');found.push(relative(target,path));}
  }
}
await walk(target);
assert.deepEqual(found.sort(),[...expected,'release-manifest.json'].sort());
let total=0;
for(const item of manifest.files){
  const content=await readFile(resolve(target,item.file));
  assert.equal(content.length,item.bytes);
  assert.equal(createHash('sha256').update(content).digest('hex'),item.sha256,item.file);
  assert.deepEqual(content,await readFile(resolve(root,item.file)),item.file+' 必須與目前來源相同');
  total+=content.length;
}
assert.equal(total,manifest.totalBytes);
console.log(`PASS: 發布檔案清單、${manifest.files.length} 份雜湊、來源 bytes、版本與字體授權一致，無測試／舊報告／占位素材`);
