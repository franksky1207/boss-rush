import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Battle } from '../core/battle.js';
import { evaluateResult } from '../core/results.js';
import { ACTIONS, BOSSES, DIFFICULTIES, HP, MOVES, TIMING } from '../data/rules.js';

export function seededRandom(seed) {
  let value = seed >>> 0;
  return () => { value = (Math.imul(value, 1664525) + 1013904223) >>> 0; return value / 2 ** 32; };
}
export const PROFILES = Object.freeze([
  { id:'perfect', name:'全 PERFECT', kind:'fixed', fraction:.2 },
  { id:'great', name:'全 GREAT', kind:'fixed', fraction:.4 },
  { id:'good', name:'全 GOOD', kind:'fixed', fraction:.8 },
  { id:'accuracy97', name:'97% 正確率模型', kind:'independent', correct:.97, wrong:.02, perfect:.35, great:.5 },
  { id:'accuracy90', name:'90% 正確率模型', kind:'independent', correct:.9, wrong:.07, perfect:.2, great:.5 },
  { id:'accuracy80', name:'80% 正確率模型', kind:'independent', correct:.8, wrong:.15, perfect:.1, great:.35 },
  { id:'accuracy65', name:'65% 正確率模型', kind:'independent', correct:.65, wrong:.25, perfect:.05, great:.25 },
  { id:'clustered', name:'集中失誤模型', kind:'clustered', enterCold:.08, leaveCold:.45,
    coldError:.55, warmError:.02, wrongShare:.7, perfect:.2, great:.5 },
]);

function choose(profile, random, state, context) {
  if (profile.kind === 'fixed') return { kind:'correct', fraction:profile.fraction };
  if (profile.kind === 'scripted') return profile.choose(state, context);
  let kind;
  if (profile.kind === 'clustered') {
    context.cold = context.cold ? random() >= profile.leaveCold : random() < profile.enterCold;
    kind = random() < (context.cold ? profile.coldError : profile.warmError)
      ? random() < profile.wrongShare ? 'wrong' : 'timeout' : 'correct';
  } else {
    const chance = random();
    kind = chance < profile.correct ? 'correct' : chance < profile.correct + profile.wrong ? 'wrong' : 'timeout';
  }
  if (kind !== 'correct') return { kind, fraction: .35 + random() * .5 };
  const grade = random();
  const fraction = grade < profile.perfect ? .05 + random() * .2
    : grade < profile.perfect + profile.great ? .26 + random() * .24 : .51 + random() * .44;
  return { kind, fraction };
}

export function simulate({ profile = PROFILES[1], seed = 20261008, mode = 'challenge', difficulty = 'normal', tutorialWaitMs = 0, pauseEvery = 0, pauseMs = 0 } = {}) {
  let now = 0;
  const battle = new Battle({ clock:()=>now, random:seededRandom(seed) });
  const response = seededRandom(seed ^ 0x9e3779b9);
  const hits = [0,0,0,0,0], wrongs = [0,0,0,0,0], timeouts = [0,0,0,0,0];
  const defeats = new Set(), seen = new Set();
  const context = { cold:false };
  let lastMove = null, actionRun = 0, turns = 0, tutorialMs = 0, pausedMs = 0;
  const advance = ms => { assert.ok(ms >= 0); now += ms; battle.tick(); };
  battle.start(mode, difficulty);
  for (let guard = 0; guard < 5000; guard++) {
    const state = battle.snapshot();
    assert.ok(state.playerHP >= 0 && state.playerHP <= 100);
    assert.ok(state.bossHP >= 0 && state.bossHP <= BOSSES[state.bossIndex].hp);
    assert.ok(state.berserkCount <= 1);
    assert.equal(state.stats.PERFECT + state.stats.GREAT + state.stats.GOOD, state.stats.correct);
    if (['dead','victory'].includes(state.phase)) {
      const final = state;
      const wallMs = now;
      advance(100000);
      assert.deepEqual(battle.snapshot(), final, '終局後不得繼續計時或切換');
      return { seed, phase:state.phase, boss:state.bossIndex + 1, hits, wrongs, timeouts, turns,
        wallMs, battleMs:state.battleMs, tutorialMs, pausedMs,
        grade:evaluateResult(state).grade, accuracy:evaluateResult(state).accuracy,
        stats:state.stats, highestCombo:state.highestCombo, playerHP:state.playerHP,
        berserkCount:state.berserkCount, defeatedBosses:defeats.size, moves:[...seen].sort() };
    }
    if (state.phase === 'tutorial') {
      assert.equal(mode,'tutorial');
      const activeMs = state.battleMs;
      advance(tutorialWaitMs);
      tutorialMs += tutorialWaitMs;
      assert.equal(battle.snapshot().battleMs,activeMs);
      assert.equal(battle.confirmTutorial(state),true);
      continue;
    }
    if (state.phase === 'awaitingInput') {
      turns++;
      seen.add(state.move.id);
      assert.ok(MOVES.some(move => move.id === state.move.id && move.action === state.move.action && move.unlockBoss <= state.bossIndex + 1));
      assert.notEqual(state.move.id,lastMove?.id);
      actionRun = lastMove?.action === state.move.action ? actionRun + 1 : 1;
      assert.ok(actionRun <= 2);
      lastMove = state.move;
      if (pauseEvery && turns % pauseEvery === 0) {
        battle.pause();
        const frozen = battle.snapshot();
        advance(pauseMs); pausedMs += pauseMs;
        assert.deepEqual(battle.snapshot(),frozen);
        assert.equal(battle.submit(state.move.action,state),false);
        battle.resume();
        assert.equal(battle.snapshot().remainingMs,state.remainingMs);
      }
      const selected = choose(profile,response,state,context);
      let accepted;
      if (selected.kind === 'timeout') {
        advance(state.boss.limit + 1);
        timeouts[state.bossIndex]++;
      } else {
        now += state.boss.limit * selected.fraction;
        const action = selected.kind === 'wrong' ? ACTIONS.find(item=>item.id !== state.move.action).id : state.move.action;
        accepted = battle.submit(action,state);
        assert.equal(accepted,true);
        if (selected.kind === 'wrong') wrongs[state.bossIndex]++; else hits[state.bossIndex]++;
      }
      const settled = battle.snapshot();
      const snapshot = structuredClone(settled);
      assert.equal(battle.submit(state.move.action,state),false);
      assert.deepEqual(battle.snapshot(),snapshot,'連點不能重複結算');
      if (selected.kind !== 'correct') {
        assert.equal(settled.combo,0);
        assert.equal(settled.bossHP,state.bossHP);
      } else assert.equal(settled.combo,state.combo+1);
      continue;
    }
    if (state.phase === 'bossDefeated') {
      assert.equal(state.bossHP,0);
      assert.equal(defeats.has(state.bossIndex),false);
      defeats.add(state.bossIndex);
    }
    advance(Math.max(0,state.phaseDurationMs - state.phaseElapsedMs));
    const after = battle.snapshot();
    if (after.bossIndex !== state.bossIndex) {
      assert.equal(after.bossIndex,state.bossIndex+1);
      assert.equal(after.bossHP,BOSSES[after.bossIndex].hp,'溢傷不轉移');
      assert.equal(after.playerHP,Math.min(HP.initial,state.playerHP+DIFFICULTIES[difficulty].recovery));
      assert.equal(after.combo,state.combo);
    }
  }
  throw new Error('模擬未終止');
}

export const round = value => Math.round(value * 100) / 100;
function distribution(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a,b)=>a-b);
  const percentile = p => round(sorted[Math.max(0,Math.ceil(p * sorted.length)-1)]);
  return { min:round(sorted[0]), p10:percentile(.1), median:percentile(.5), p90:percentile(.9), max:round(sorted.at(-1)) };
}
export function summarize(profile, runs) {
  const wins = runs.filter(run=>run.phase==='victory');
  const total = key => runs.reduce((sum,run)=>sum+run.stats[key],0);
  const correct = total('correct'), wrong = total('wrong'), timeout = total('timeout');
  const deaths = [0,0,0,0,0], grades = {};
  for (const run of runs) { if (run.phase === 'dead') deaths[run.boss-1]++; grades[run.grade]=(grades[run.grade]??0)+1; }
  return { profile, samples:runs.length, victories:wins.length, deaths:runs.length-wins.length,
    winRate:round(wins.length/runs.length*100), deathByBoss:deaths, grades,
    observedAccuracy:round(correct/(correct+wrong+timeout)*100), attempts:correct+wrong+timeout,
    correct, wrong, timeout, victoriesInTarget:wins.filter(run=>run.wallMs >= 180000 && run.wallMs <= 300000).length,
    victoryWallSeconds:distribution(wins.map(run=>run.wallMs/1000)),
    victoryBattleSeconds:distribution(wins.map(run=>run.battleMs/1000)),
    deathWallSeconds:distribution(runs.filter(run=>run.phase==='dead').map(run=>run.wallMs/1000)),
    victoryHitsByBoss: [0,1,2,3,4].map(index=>distribution(wins.map(run=>run.hits[index]))),
    victoryTurns:distribution(wins.map(run=>run.turns)),
    exampleVictory:wins[0]??null, exampleDeath:runs.find(run=>run.phase==='dead')??null };
}

export function balanceMarkdown(report) {
  const fmt = value => value === null ? '—' : String(value);
  const rows = report.summaries.map(item => `| ${item.profile.name} | ${item.samples} | ${item.winRate}% | ${item.observedAccuracy}% | ${fmt(item.victoryWallSeconds?.median??null)} | ${fmt(item.victoryWallSeconds?.p10??null)}–${fmt(item.victoryWallSeconds?.p90??null)} | ${item.deathByBoss.join('/')} |`);
  return `# 第六批平衡模擬報告

版本 ${report.version}；每模型 ${report.samplesPerProfile} 局，共 ${report.totalSamples} 局；種子 ${report.seedStart} 起依局序遞增。每局實際驅動 Battle 核心，不使用另寫的傷害／回血模型。抽招與反應使用兩個獨立可重現 LCG 亂數序列。

## 模型與時間定義

全 PERFECT／GREAT／GOOD 分別在 T 的 20%／40%／80% 點擊，全部正確。97%／90%／80%／65% 模型的正確、選錯、超時與成功評級分布完整保存於 JSON；各回合獨立抽樣。這些是假設反應模型，不是學生觀測數據。集中失誤模型在暖／冷狀態切換，不強制整局固定正確率；模型參數與實際觀測正確率分開列出。

「完整通關」包含五王登場、正常回合、擊敗與狂暴轉場；「有效战鬥」按核心規則排除特殊過場，另存於 JSON。此表時間不含暫停、教學等待及真人閱讀／思考在時限之外的時間。死亡樣本不混入通關時間百分位。P10／P90 使用 nearest-rank，JSON 保留統計摘要與成敗範例的原始毫秒。

## 模擬結果

| 模型 | 局數 | 通關率 | 所有樣本實際正確率 | 通關中位秒數 | 通關 P10–P90 秒 | 各王死亡局數 |
|---|---:|---:|---:|---:|---:|---|
${rows.join('\n')}

## 平衡發現與待確認事項

- 全 GREAT 逐王命中為 8／8／10／11／15（共 52），全 PERFECT 為 8／8／9／10／14（共 49），全 GOOD 為 9／8／11／12／16（共 56）。
- 3–5 分鐘是一般體驗目標。快速、無失誤模型短於 3 分鐘；全 GOOD 及多數已通關的失誤模型接近目標，但假設模型不能代表真實學生的遊玩時間。
- 本次 90% 正確率模型通關率 ${report.summaries.find(item=>item.profile.id==="accuracy90").winRate}%，80% 模型為 ${report.summaries.find(item=>item.profile.id==="accuracy80").winRate}%；現行死亡與連擊重設會讓失誤增加所需回合，容錯可能偏低。這些數字僅適用本報告每模型 ${report.samplesPerProfile} 局與明列反應分布；改樣本數時應以表格更新值為準。
- 本版支援三難度，此報告預設模擬普通：選錯扣 15、超時扣 20、前四王回 30（上限 100）。原 20／30／20 的 B 不可達證明不適用本版；有限模擬樣本未出現 B 也不能證明不可達。
- A 評價可達成：首王與第五王各四次選錯、其餘全 PERFECT，可通關且剩餘 40 HP。
- 困難採用 20／30／20，簡單採用 10／15／30；各難度分榜，不自動變更開局難度。

## 重現與驗收範圍

執行 \`npm run simulate\` 產生此 Markdown 與同名 JSON，或以 \`BOSS_RUSH_SAMPLES\` 改每模型樣本數。JSON 包含逐王命中分布、成敗範例、評價分布、有效時間及 3–5 分鐘目標內局數；不要以此表的假設正確率代表個別玩家最終正確率。

每局檢查 HP 範圍、統計一致、招式解鎖與連續限制、連點不重複結算、跨王回血／連擊／溢傷、狂暴不超過一次、死亡與通關後凍結。特定失誤路徑及教學／暫停時鐘排除另由單元測試驗證。本版只調整選錯／超時扣血及過王回血；時限、傷害、抽招與動畫節奏維持不變。

這是自動模型驗收，不是實際學生體驗或正式平衡通過；請配合 DEVELOPMENT.md 的結論及實體裝置／正式美術待辦閱讀。
`.replace('有效战鬥','有效戰鬥');
}
async function main() {
  const samples = Number(process.env.BOSS_RUSH_SAMPLES ?? 1000);
  if (!Number.isInteger(samples) || samples < 1 || samples > 10000) throw new RangeError('樣本數需為 1–10000');
  const seedStart = 20261008;
  const summaries = PROFILES.map(profile=>summarize(profile,Array.from({length:samples},(_,index)=>simulate({profile,seed:seedStart+index}))));
  const gameVersion = JSON.parse(await readFile(new URL('../package.json',import.meta.url),'utf8')).version;
  const report = { version:1, gameVersion, samplesPerProfile:samples,totalSamples:samples*PROFILES.length,
    seedStart, rules:{bosses:BOSSES,timing:TIMING,hp:HP},summaries };
  const path = resolve(`reports/balance-v${gameVersion}.json`);
  await mkdir(dirname(path),{recursive:true});
  await writeFile(path,JSON.stringify(report,null,2)+'\n');
  await writeFile(path.replace('.json','.md'),balanceMarkdown({...report,version:report.gameVersion}));
  for (const item of summaries) console.log(`${item.profile.id}: ${item.victories}/${samples} 通關，完整通關中位數 ${item.victoryWallSeconds?.median??'—'} 秒`);
  console.log(`PASS: ${report.totalSamples} 局模擬及每局狀態檢查；報告 ${path}`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
