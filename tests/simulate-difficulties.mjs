import { PROFILES, simulate, summarize } from './simulate.mjs';
import { DIFFICULTIES } from '../data/rules.js';
import { readFile, writeFile } from 'node:fs/promises';
const samples=Number(process.env.BOSS_RUSH_SAMPLES ?? 100);
if(!Number.isInteger(samples)||samples<1||samples>10000)throw new RangeError('樣本數需為 1–10000');
const version=JSON.parse(await readFile(new URL('../package.json',import.meta.url),'utf8')).version;
const variants=[];
for(const difficulty of Object.keys(DIFFICULTIES)){
  const summaries=PROFILES.map(profile=>summarize(profile,Array.from({length:samples},(_,i)=>simulate({difficulty,profile,seed:20261008+i}))));
  variants.push({difficulty,hp:DIFFICULTIES[difficulty],summaries});
  console.log(`PASS: ${difficulty}, ${samples*PROFILES.length} 局及規則斷言`);
}
const report={gameVersion:version,samplesPerProfile:samples,seedStart:20261008,totalSamples:samples*PROFILES.length*variants.length,variants};
await writeFile(new URL(`../reports/difficulties-v${version}.json`,import.meta.url),JSON.stringify(report,null,2)+'\n');
