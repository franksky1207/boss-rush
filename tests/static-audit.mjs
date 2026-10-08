import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { resolve, relative, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { HERO_VISUAL, BOSS_VISUALS, BERSERK_VISUAL, ARENA_VISUALS } from '../data/visuals.js';

export const root = fileURLToPath(new URL('../',import.meta.url));
export function resolveReference(specifier, filename, version) {
  assert.ok(specifier.startsWith('./') || specifier.startsWith('../'),'Pages 資源需使用相對路徑：'+specifier);
  const url = new URL(specifier,pathToFileURL(filename));
  const path = fileURLToPath(url);
  assert.ok(path.startsWith(root),'資源不可超出儲存庫：'+specifier);
  assert.equal(url.searchParams.get('v'),version,'快取版本不一致：'+specifier);
  return path;
}
export async function auditStatic() {
  const packageInfo=JSON.parse(await readFile(resolve(root,'package.json'),'utf8'));
  const version=packageInfo.version;
  const html=await readFile(resolve(root,'index.html'),'utf8');
  const files=new Set(['index.html','.nojekyll']);
  const pending=[];
  for(const match of html.matchAll(/(?:src|href)="([^"]+)"/g)){
    if(match[1].startsWith('data:'))continue;
    const path=resolveReference(match[1],resolve(root,'index.html'),version);
    pending.push(path);
  }
  for(let index=0;index<pending.length;index++){
    const path=pending[index],name=relative(root,path).split(sep).join('/');
    if(files.has(name))continue;
    await stat(path);
    files.add(name);
    const source=await readFile(path,'utf8');
    if(path.endsWith('.js')){
      for(const match of source.matchAll(/\bfrom\s+['"]([^'"]+)['"]/g)){
        pending.push(resolveReference(match[1],path,version));
      }
    }
    if(path.endsWith('.css')){
      for(const match of source.matchAll(/url\(['"]?([^)'"]+)['"]?\)/g)){
        if(!match[1].startsWith('data:'))pending.push(resolveReference(match[1],path,version));
      }
    }
  }
  const sources=[HERO_VISUAL,...BOSS_VISUALS,BERSERK_VISUAL,...ARENA_VISUALS]
    .flatMap(item=>item.poses?Object.values(item.poses):[item.src]);
  for(const source of new Set(sources)){
    const url=new URL(source);
    assert.equal(url.protocol,'file:','美術應由本專案提供');
    assert.equal(url.searchParams.get('v'),version,'美術快取版本不一致');
    const path=fileURLToPath(url);
    assert.ok(path.startsWith(root));
    await stat(path);
    files.add(relative(root,path).split(sep).join('/'));
  }
  await stat(resolve(root,'.nojekyll'));
  return {version,files:[...files].sort(),modules:[...files].filter(path=>path.endsWith('.js')).length,
    styles:[...files].filter(path=>path.endsWith('.css')).length,fonts:[...files].filter(path=>/\.woff2?$/.test(path)).length,images:[...files].filter(path=>/\.(svg|webp|png)$/.test(path)).length};
}
if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const result=await auditStatic();
  console.log(`PASS: v=${result.version}，${result.modules} 個模組、${result.styles} 份樣式、${result.fonts} 份本機字體、${result.images} 張圖片，全數存在且相對路徑／快取版本一致；.nojekyll 已備妥`);
}
