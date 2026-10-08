import { mkdir, readFile, writeFile, cp, rm } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { auditStatic, root } from '../tests/static-audit.mjs';
const audit=await auditStatic();
const target=resolve(root,'dist/boss-rush');
// 只清理由此腳本產生的固定發布目錄，不接受任意刪除路徑。
await rm(target,{recursive:true,force:true});
const files=[...audit.files,'assets/fonts/OFL-NotoSerifTC.txt'];
const entries=[];
for(const file of files.sort()){
  const source=resolve(root,file),destination=resolve(target,file);
  await mkdir(dirname(destination),{recursive:true});
  await cp(source,destination);
  const bytes=await readFile(destination);
  entries.push({file,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});
}
const manifest={version:audit.version,path:'/boss-rush/',totalBytes:entries.reduce((sum,item)=>sum+item.bytes,0),files:entries};
await writeFile(resolve(target,'release-manifest.json'),JSON.stringify(manifest,null,2)+'\n');
console.log(`PASS: v${audit.version} 發布目錄 ${target}，${entries.length} 個必要檔案，${manifest.totalBytes} bytes；含字體授權`);
