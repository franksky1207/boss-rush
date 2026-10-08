import test from 'node:test';
import assert from 'node:assert/strict';
import { Battle, comboMultiplier, damage, reactionGrade } from '../core/battle.js';
import { BOSSES, MOVES, TIMING } from '../data/rules.js';

function fixture() {
  let now = 0;
  const battle = new Battle({ clock: () => now, random: () => 0 });
  const advance = ms => { now += ms; battle.tick(); return battle.snapshot(); };
  const ready = () => {
    let state = battle.snapshot();
    for (let guard = 0; state.phase !== 'awaitingInput'; guard++) {
      assert.ok(guard < 10, `unexpected phase ${state.phase}`);
      assert.ok(!['dead', 'victory'].includes(state.phase));
      state = advance(2000);
    }
    return state;
  };
  const choose = (action, elapsed = 0, token = battle.snapshot()) => {
    now += elapsed;
    return battle.submit(action, token, now);
  };
  return { battle, advance, ready, choose, now: () => now };
}

test('連擊倍率跨檻及三種評級傷害', () => {
  for (const [combo, multiplier] of [[1, 1], [4, 1], [5, 1.5], [9, 1.5], [10, 2], [14, 2], [15, 2.5], [19, 2.5], [20, 3], [100, 3]]) {
    assert.equal(comboMultiplier(combo), multiplier);
    for (const [grade, reaction] of [['PERFECT', 1.2], ['GREAT', 1.1], ['GOOD', 1]]) {
      assert.equal(damage(combo, grade), Math.round(100 * multiplier * reaction));
    }
  }
  assert.equal(damage(20, 'PERFECT'), 360);
  assert.equal(damage(20, 'timeout'), 0);
});

test('反應時間各區間及截止時間包含等號', () => {
  assert.equal(reactionGrade(0, 4000), 'PERFECT');
  assert.equal(reactionGrade(1000, 4000), 'PERFECT');
  assert.equal(reactionGrade(1000.01, 4000), 'GREAT');
  assert.equal(reactionGrade(2000, 4000), 'GREAT');
  assert.equal(reactionGrade(2000.01, 4000), 'GOOD');
  assert.equal(reactionGrade(4000, 4000), 'GOOD');
  assert.equal(reactionGrade(4000.01, 4000), 'timeout');
});

test('預告完成、按鈕可操作後才開始完整 T 秒', () => {
  const f = fixture();
  f.battle.start();
  assert.equal(f.battle.submit('attack', f.battle.snapshot()), false);
  assert.equal(f.advance(TIMING.intro).phase, 'telegraph');
  assert.equal(f.advance(TIMING.telegraph - 1).phase, 'telegraph');
  const ready = f.advance(1);
  assert.equal(ready.phase, 'awaitingInput');
  assert.equal(ready.remainingMs, 4000);
  assert.equal(ready.battleMs, 400);
  f.advance(4000);
  assert.equal(f.choose(ready.move.action), true);
  assert.equal(f.battle.snapshot().result.grade, 'GOOD');
});

test('先加連擊再計傷害；連點與錯誤動作不重複判定', () => {
  const f = fixture();
  f.battle.start();
  const expected = [120, 120, 120, 120, 180];
  for (const dealt of expected) {
    const state = f.ready();
    const before = state.bossHP;
    assert.equal(f.choose(state.move.action), true);
    assert.equal(f.battle.snapshot().bossHP, before - dealt);
    assert.equal(f.choose(state.move.action, 0, state), false);
    assert.equal(f.battle.snapshot().bossHP, before - dealt);
  }
  const state = f.ready();
  assert.equal(f.choose(MOVES.find(move => move.action !== state.move.action).action), true);
  const result = f.battle.snapshot();
  assert.equal(result.playerHP, 85);
  assert.equal(result.combo, 0);
  assert.equal(result.bossHP, state.bossHP);
  assert.equal(result.result.grade, 'wrong');
  assert.equal(result.stats.PERFECT, 5);
});

test('超時扣 20，歸零立即死亡且不再發招', () => {
  const f = fixture();
  f.battle.start();
  for (const hp of [80, 60, 40, 20, 0]) {
    const state = f.ready();
    f.advance(state.boss.limit + 1);
    assert.equal(f.battle.snapshot().playerHP, hp);
    assert.equal(f.battle.snapshot().stats.timeout, [80, 60, 40, 20, 0].indexOf(hp) + 1);
  }
  const dead = f.battle.snapshot();
  assert.equal(dead.phase, 'dead');
  f.advance(100000);
  assert.deepEqual(f.battle.snapshot(), dead);
  assert.equal(f.choose(dead.move.action), false);
});

test('選錯七次死亡，重新開始清空 HP／連擊／統計並回第一王', () => {
  const f = fixture();
  f.battle.start();
  const oldSession = f.battle.snapshot().session;
  for (let i = 0; i < 7; i++) {
    const state = f.ready();
    f.choose(MOVES.find(move => move.action !== state.move.action).action);
  }
  assert.equal(f.battle.snapshot().phase, 'dead');
  f.battle.start();
  const fresh = f.battle.snapshot();
  assert.equal(fresh.bossIndex, 0);
  assert.equal(fresh.playerHP, 100);
  assert.equal(fresh.bossHP, 1050);
  assert.equal(fresh.combo, 0);
  assert.equal(fresh.stats.wrong, 0);
  assert.notEqual(fresh.session, oldSession);
});

test('過期回合與上一局事件不能影響新回合', () => {
  const f = fixture();
  f.battle.start();
  const old = f.ready();
  f.choose(old.move.action);
  const next = f.ready();
  assert.equal(f.choose(next.move.action, 0, old), false);
  assert.equal(f.battle.snapshot().phase, 'awaitingInput');
  f.battle.start();
  const fresh = f.ready();
  assert.equal(f.choose(fresh.move.action, 0, next), false);
  assert.equal(f.battle.snapshot().bossHP, 1050);
});

test('五王全 GREAT 為 8/8/10/11/15，溢傷不轉移、HP 不超過 100', () => {
  const f = fixture();
  f.battle.start();
  const hits = [0, 0, 0, 0, 0];
  for (let guard = 0; f.battle.snapshot().phase !== 'victory'; guard++) {
    assert.ok(guard < 100);
    const state = f.ready();
    hits[state.bossIndex] += 1;
    f.choose(state.move.action, state.boss.limit * 0.4);
    const settled = f.battle.snapshot();
    if (settled.bossHP === 0) {
      f.advance(1000);
      assert.equal(f.battle.snapshot().phase, 'bossDefeated');
      f.advance(TIMING.defeat);
      const next = f.battle.snapshot();
      assert.equal(next.playerHP, 100);
      assert.equal(next.combo, settled.combo);
      if (state.bossIndex < 4) {
        assert.equal(next.bossHP, BOSSES[state.bossIndex + 1].hp);
        assert.equal(next.bossIndex, state.bossIndex + 1);
      }
    }
  }
  assert.deepEqual(hits, [8, 8, 10, 11, 15]);
  const victory = f.battle.snapshot();
  assert.equal(victory.stats.GREAT, 52);
  assert.equal(victory.combo, 52);
  f.advance(100000);
  assert.deepEqual(f.battle.snapshot(), victory);
});

test('受傷後擊敗前四王回復 30 HP', () => {
  const f = fixture();
  f.battle.start();
  let state = f.ready();
  f.advance(state.boss.limit + 1);
  assert.equal(f.battle.snapshot().playerHP, 80);
  state = f.ready();
  f.advance(state.boss.limit + 1);
  assert.equal(f.battle.snapshot().playerHP, 60);
  while (f.battle.snapshot().bossHP > 0) {
    state = f.ready();
    f.choose(state.move.action);
  }
  f.advance(1000);
  f.advance(TIMING.defeat);
  assert.equal(f.battle.snapshot().playerHP, 90);
  assert.equal(f.battle.snapshot().bossIndex, 1);
});

test('暫停凍結時間與數值；恢復沿用剩餘時間', () => {
  const f = fixture();
  f.battle.start();
  const state = f.ready();
  f.advance(1000);
  f.battle.pause();
  const paused = f.battle.snapshot();
  f.advance(50000);
  assert.deepEqual(f.battle.snapshot(), paused);
  assert.equal(f.choose(state.move.action), false);
  f.battle.resume();
  assert.equal(f.battle.snapshot().remainingMs, 3000);
  f.choose(state.move.action, 500);
  assert.equal(f.battle.snapshot().result.grade, 'GREAT');
  assert.equal(f.battle.snapshot().battleMs, paused.battleMs + 500);
});

test('延遲喚醒只結算一個超時，不補發未顯示回合', () => {
  const f = fixture();
  f.battle.start();
  const ready = f.ready();
  const after = f.advance(60000);
  assert.equal(after.stats.timeout, 1);
  assert.equal(after.turn, ready.turn);
  assert.equal(after.phase, 'resolving');
  assert.equal(after.battleMs, ready.battleMs + ready.boss.limit);
});

test('逾時點擊只能造成一次超時，不能追加選錯或傷害', () => {
  const f = fixture();
  f.battle.start();
  const ready = f.ready();
  assert.equal(f.choose(ready.move.action, ready.boss.limit + 0.01), false);
  const settled = f.battle.snapshot();
  assert.equal(settled.playerHP, 80);
  assert.equal(settled.bossHP, 1050);
  assert.equal(settled.stats.timeout, 1);
  assert.equal(f.choose(ready.move.action), false);
  assert.deepEqual(f.battle.snapshot(), settled);
});

test('完整招式維持四種正解且不連續同招；狀態快照不可改寫核心', () => {
  const f = fixture();
  f.battle.start();
  const first = f.ready();
  const answer = first.move.action;
  first.playerHP = 1;
  first.move.action = 'wrong';
  assert.equal(f.battle.snapshot().playerHP, 100);
  assert.equal(f.battle.snapshot().move.action, answer);
  f.choose(answer);
  const second = f.ready();
  assert.notEqual(second.move.id, first.move.id);
  assert.equal(new Set(MOVES.map(move => move.action)).size, 4);
});
