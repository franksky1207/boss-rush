import test from 'node:test';
import assert from 'node:assert/strict';
import { Battle } from '../core/battle.js';
import { DIFFICULTIES } from '../data/rules.js';
import { simulate } from './simulate.mjs';
import { createRecord } from '../core/results.js';
import { LocalStore, LEADERBOARD_KEY } from '../storage/local.js';

test('三難度教學／挑戰的扣血、死亡與過王回血皆採開局規則', () => {
  for (const difficulty of Object.keys(DIFFICULTIES)) for (const mode of ['challenge','tutorial']) {
    const hp=DIFFICULTIES[difficulty];
    for (const kind of ['wrong','timeout']) {
      const result=simulate({difficulty,mode,profile:{kind:'scripted',choose:()=>({kind,fraction:.4})}});
      assert.equal(result.phase,'dead');
      assert.equal(result.turns,Math.ceil(100/hp[kind]));
    }
    let now=0;const battle=new Battle({clock:()=>now,random:()=>0});battle.start(mode,difficulty);
    let missed=0;
    for(let guard=0;guard<500;guard++){
      const s=battle.snapshot();assert.equal(s.difficulty,difficulty);
      if(s.bossIndex===1){assert.equal(s.playerHP,Math.min(100,100-2*hp.timeout+hp.recovery));break;}
      if(s.phase==='tutorial')battle.confirmTutorial(s);
      else if(s.phase==='awaitingInput'){
        if(missed<2){now+=s.boss.limit+1;battle.tick();missed++;}
        else battle.submit(s.move.action,s);
      }else{now+=s.phaseDurationMs;battle.tick();}
      assert.ok(guard<499);
    }
  }
});
test('未知難度拒絕且不重設當局；預設普通',()=>{
  const b=new Battle();b.start();assert.equal(b.snapshot().difficulty,'normal');
  const old=b.snapshot();assert.throws(()=>b.start('challenge','unknown'),RangeError);
  assert.equal(b.snapshot().session,old.session);
});
test('三榜各保留20名、名次獨立、重載保留；無難度舊紀錄歸困難且非法難度拒絕',()=>{
  const data=new Map();const storage={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v)};
  const state={phase:'victory',mode:'challenge',bossIndex:4,bossHP:0,playerHP:100,highestCombo:52,battleMs:100,
    stats:{correct:52,wrong:0,timeout:0,PERFECT:0,GREAT:52,GOOD:0}};
  const old=createRecord(state,'舊玩家',{id:'legacy',completedAt:1});delete old.difficulty;
  storage.setItem(LEADERBOARD_KEY,JSON.stringify({version:1,records:[old]}));
  const store=new LocalStore({storage:()=>storage});assert.equal(store.records[0].difficulty,'hard');
  for(const difficulty of Object.keys(DIFFICULTIES))for(let i=0;i<25;i++){
    const record=createRecord({...state,difficulty,battleMs:i},'玩家',{id:`${difficulty}-${i}`,completedAt:2});
    const saved=store.add(record);assert.equal(saved.rank,i<20?i+1:null);
  }
  for(const difficulty of Object.keys(DIFFICULTIES))assert.equal(store.records.filter(r=>r.difficulty===difficulty).length,20);
  assert.equal(store.records.length,60);assert.equal(new LocalStore({storage:()=>storage}).records.length,60);
  assert.equal(store.add({...old,difficulty:'unknown'}).reason,'invalid');
});
