import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateResult, eligibleForLeaderboard, createRecord, compareRecords, topRecords, validNickname } from '../core/results.js';
import { LocalStore, DEFAULT_PREFERENCES, normalizePreferences, PREFERENCES_KEY, LEADERBOARD_KEY } from '../storage/local.js';

function state(correct = 100, wrong = 0, timeout = 0, perfect = 0, overrides = {}) {
  return { phase: 'victory', mode: 'challenge', bossIndex: 4, bossHP: 0, playerHP: 100,
    highestCombo: correct, battleMs: 100000,
    stats: { correct, wrong, timeout, PERFECT: perfect, GREAT: correct - perfect, GOOD: 0 }, ...overrides };
}
function record(id, changes = {}, result = state()) {
  return { ...createRecord(result, '同名學生', { id, completedAt: 1000 }), ...changes };
}
function memory() {
  const data = new Map();
  return { data, getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
}

test('SSS 需通關、零選錯／超時，PERFECT 達原始 30% 邊界', () => {
  assert.equal(evaluateResult(state(100, 0, 0, 30)).grade, 'SSS');
  assert.equal(evaluateResult(state(100000, 0, 0, 29999)).grade, 'SS');
  assert.equal(evaluateResult(state(100, 1, 0, 100)).grade, 'SS');
  assert.equal(evaluateResult(state(100, 0, 1, 100)).grade, 'SS');
  assert.equal(evaluateResult(state(100, 0, 0, 100, { phase: 'dead' })).grade, 'C');
});
test('SS／S／A／B 比較原始比例，不因百分比顯示四捨五入越級', () => {
  for (const [correct, wrong, grade] of [[95,5,'SS'],[94999,5001,'S'],[90,10,'S'],
    [89999,10001,'A'],[80,20,'A'],[79999,20001,'B']]) {
    assert.equal(evaluateResult(state(correct, wrong)).grade, grade);
  }
  assert.equal(evaluateResult(state(0, 0, 0, 0, { phase: 'dead' })).accuracy, 0);
  assert.equal(evaluateResult(state(0, 0, 0, 0, { phase: 'dead' })).perfectRate, 0);
  assert.equal(evaluateResult(state(1,0,0,0,{phase:'home'})), null);
});
test('僅挑戰模式擊敗第五王可建立成績，死亡／教學／退出拒絕', () => {
  for (const changes of [{mode:'tutorial'},{phase:'dead'},{phase:'home'},{bossIndex:3},{bossHP:1},{playerHP:0}]) {
    assert.equal(eligibleForLeaderboard(state(100,0,0,0,changes)), false);
    assert.equal(createRecord(state(100,0,0,0,changes), '學生', {id:'id',completedAt:1000}), null);
  }
  assert.ok(createRecord(state(), '學生', {id:'id',completedAt:1000}));
});
test('暱稱 1–12 Unicode 字元，空白去頭尾、同名可重複', () => {
  assert.equal(validNickname('   '), false);
  assert.equal(validNickname('😀'.repeat(12)), true);
  assert.equal(validNickname('😀'.repeat(13)), false);
  const storage = memory(), store = new LocalStore({storage:()=>storage});
  assert.equal(store.add(record('a')).accepted, true);
  assert.equal(store.add(record('b')).accepted, true);
  assert.equal(store.records.length, 2);
  assert.equal(createRecord(state(), '  學生  ', {id:'c',completedAt:1000}).name, '學生');
});
test('排行依評價、精確正確率、有效時間、較早完成；完全相同穩定排序', () => {
  const a = record('SSS', { battleMs: 900000 }, state(100,0,0,30));
  const b = record('accuracy', { battleMs: 900000 }, state(100,1));
  const c = record('time', { battleMs: 100 }, state(100,2));
  const d = record('early', { battleMs: 100, completedAt: 500 }, state(100,2));
  const e = record('stable', { battleMs: 100, completedAt: 500 }, state(100,2));
  assert.deepEqual(topRecords([c,b,a,d,e]).map(item=>item.id), ['SSS','accuracy','early','stable','time']);
  assert.ok(compareRecords(record('a',{},state(94999,5001)),record('b',{},state(94998,5002))) < 0);
});
test('保留前 20 名，未入榜、連續提交及清榜後同局不可重複寫入', () => {
  const storage = memory(), store = new LocalStore({storage:()=>storage});
  for (let i = 0; i < 25; i++) store.add(record(String(i),{battleMs:i}));
  assert.equal(store.records.length, 20);
  assert.deepEqual(store.records.map(item=>item.id), Array.from({length:20},(_,i)=>String(i)));
  assert.deepEqual(store.add(record('24')), {accepted:false,reason:'duplicate'});
  store.clear();
  assert.deepEqual(store.add(record('0')), {accepted:false,reason:'duplicate'});
  assert.equal(store.records.length, 0);
});
test('重載保留資料、提交識別與排序；回傳快照不可修改儲存資料', () => {
  const storage = memory(), first = new LocalStore({storage:()=>storage});
  first.add(record('a'));
  const second = new LocalStore({storage:()=>storage});
  assert.equal(second.records[0].id, 'a');
  assert.equal(second.add(record('a')).accepted, false);
  const copy = second.records;
  copy[0].stats.correct = 0;
  assert.equal(second.records[0].stats.correct, 100);
});
test('錯誤 JSON、版本與部分不合法紀錄安全降級，保留合法紀錄', () => {
  for (const value of ['{', 'null', '{"version":2,"records":[]}', '{"version":1,"records":{}}']) {
    const storage = memory();
    storage.setItem(LEADERBOARD_KEY,value);
    const store = new LocalStore({storage:()=>storage});
    assert.deepEqual(store.records, []);
    assert.equal(store.leaderboardError,true);
    assert.equal(store.add(record('new')).persistent,true);
  }
  const storage = memory();
  storage.setItem(LEADERBOARD_KEY,JSON.stringify({version:1,records:[record('good'),record('bad',{grade:'SSS'}),null]}));
  const store = new LocalStore({storage:()=>storage});
  assert.deepEqual(store.records.map(item=>item.id),['good']);
  assert.equal(store.leaderboardError,true);
});
test('儲存取得／讀取／Quota 寫入錯誤保留當次成績，且不重複提交', () => {
  for (const storage of [()=>{throw new Error('SecurityError');},
    ()=>({getItem:()=>{throw new Error('SecurityError');},setItem:()=>{throw new Error('QuotaExceededError');}})]) {
    const store = new LocalStore({storage});
    assert.deepEqual(store.loadPreferences(),DEFAULT_PREFERENCES);
    const saved = store.add(record('a'));
    assert.equal(saved.persistent,false);
    assert.equal(store.records.length,1);
    assert.equal(store.add(record('a')).accepted,false);
    assert.equal(store.clear(),false);
    assert.equal(store.records.length,0);
    assert.equal(store.leaderboardError,true);
  }
});
test('偏好開關與音量驗證、保存／重載；清榜不清設定，失敗不丟當次設定', () => {
  assert.deepEqual(normalizePreferences({sound:'false',volume:Infinity,reducedEffects:'yes'}),DEFAULT_PREFERENCES);
  assert.equal(normalizePreferences({volume:-1}).volume,0);
  assert.equal(normalizePreferences({volume:101}).volume,100);
  const storage = memory(), store = new LocalStore({storage:()=>storage});
  const preferences = {sound:false,music:false,volume:37,reducedEffects:true};
  store.savePreferences(preferences);
  store.add(record('a')); store.clear();
  assert.deepEqual(new LocalStore({storage:()=>storage}).loadPreferences(),preferences);
  storage.setItem(PREFERENCES_KEY,'{');
  assert.deepEqual(store.loadPreferences(),DEFAULT_PREFERENCES);
  assert.equal(store.preferenceError,true);
  const broken = new LocalStore({storage:()=>({getItem:()=>null,setItem:()=>{throw new Error('quota');}})});
  assert.deepEqual(broken.savePreferences(preferences),preferences);
  assert.equal(broken.preferenceError,true);
});
