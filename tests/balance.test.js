import test from 'node:test';
import assert from 'node:assert/strict';
import { PROFILES, simulate } from './simulate.mjs';
import { Battle } from '../core/battle.js';

test('三條無失誤基準：PERFECT 49／GREAT 52／GOOD 56，逐王命中及評價正確', () => {
  for (const [profile,hits,grade] of [[PROFILES[0],[8,8,9,10,14],'SSS'],
    [PROFILES[1],[8,8,10,11,15],'SS'],[PROFILES[2],[9,8,11,12,16],'SS']]) {
    const result=simulate({profile});
    assert.equal(result.phase,'victory');
    assert.deepEqual(result.hits,hits);
    assert.equal(result.grade,grade);
    assert.equal(result.playerHP,100);
    assert.equal(result.berserkCount,1);
    assert.equal(result.defeatedBosses,5);
  }
});
test('相同種子重現成功／失敗與時間，不混用抽招與反應亂數', () => {
  for (const profile of PROFILES.slice(3)) {
    for (const seed of [20261008,20261009,20261131]) {
      assert.deepEqual(simulate({profile,seed}),simulate({profile,seed}));
    }
  }
});
test('單次第三王失誤可復原通關；七次連續選錯與五次連續超時立即死亡', () => {
  const once=simulate({profile:{kind:'scripted',choose(state,context){
    if(state.bossIndex===2&&!context.missed){context.missed=true;return {kind:'wrong',fraction:.4};}
    return {kind:'correct',fraction:.4};
  }}});
  assert.equal(once.phase,'victory');
  assert.deepEqual(once.wrongs,[0,0,1,0,0]);
  assert.ok(once.turns>52);
  assert.equal(once.playerHP,100);
  for (const [kind,count] of [['wrong',7],['timeout',5]]) {
    const result=simulate({profile:{kind:'scripted',choose:()=>({kind,fraction:.4})}});
    assert.equal(result.phase,'dead');
    assert.equal(result.boss,1);
    assert.equal(result.turns,count);
    assert.equal(result.playerHP,0);
    assert.equal(result.defeatedBosses,0);
  }
});
test('首王與第五王各四次失誤仍可通關獲 A；驗證跨王回血路徑', () => {
  const result=simulate({profile:{kind:'scripted',choose(state,context){
    if(state.turn<=4)return {kind:'wrong',fraction:.2};
    if(state.bossIndex===4&&(context.lastWrongs??0)<4){
      context.lastWrongs=(context.lastWrongs??0)+1;return {kind:'wrong',fraction:.2};
    }
    return {kind:'correct',fraction:.2};
  }}});
  assert.equal(result.phase,'victory');
  assert.equal(result.stats.wrong,8);
  assert.equal(result.playerHP,40);
  assert.equal(result.grade,'A');
});
test('教學等待及每三回合 30 秒暫停不增加有效時間或改變結果', () => {
  const plain=simulate(),paused=simulate({pauseEvery:3,pauseMs:30000});
  const tutorial=simulate({mode:'tutorial',tutorialWaitMs:5000});
  for(const other of [paused,tutorial]){
    assert.deepEqual(other.stats,plain.stats);
    assert.deepEqual(other.hits,plain.hits);
    assert.equal(other.battleMs,plain.battleMs);
    assert.equal(other.wallMs,plain.wallMs+other.tutorialMs+other.pausedMs);
  }
});

function phaseFixture(target) {
  let now=0;
  const battle=new Battle({clock:()=>now,random:()=>.25});
  battle.start(target==='tutorial'?'tutorial':'challenge');
  for(let guard=0;guard<1000;guard++){
    const s=battle.snapshot();
    if(s.phase===target){
      if(target!=='tutorial'){now+=s.phaseDurationMs*.37;battle.tick();}
      return {battle,advance(ms){now+=ms;battle.tick();}};
    }
    if(s.phase==='tutorial')battle.confirmTutorial(s);
    else if(s.phase==='awaitingInput')battle.submit(s.move.action,s);
    else {now+=s.phaseDurationMs;battle.tick();}
  }
  assert.fail('找不到狀態 '+target);
}
test('八種活動狀態中暫停、退出取消與恢復皆保留時鐘／回合，舊操作不能穿透', () => {
  for(const phase of ['bossIntro','tutorial','telegraph','awaitingInput','resolving','nextTurn','bossDefeated','berserkTransition']){
    const {battle,advance}=phaseFixture(phase);
    const before=battle.snapshot();
    assert.equal(before.phase,phase);
    battle.pause();
    const frozen=battle.snapshot();
    advance(50000);
    assert.deepEqual(battle.snapshot(),frozen);
    assert.equal(battle.submit('attack',before),false);
    battle.requestExit();advance(50000);battle.resume();
    assert.equal(battle.snapshot().exitConfirmation,true);
    battle.cancelExit();
    assert.equal(battle.snapshot().paused,true);
    battle.resume();
    assert.deepEqual(battle.snapshot(),before,'恢復未延續 '+phase);
  }
});
