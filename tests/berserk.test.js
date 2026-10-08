import test from 'node:test';
import assert from 'node:assert/strict';
import { Battle, shouldBerserk } from '../core/battle.js';
import { TIMING } from '../data/rules.js';

function fixture() {
  let now = 0;
  const battle = new Battle({ clock: () => now, random: () => 0 });
  const advance = ms => { now += ms; battle.tick(); return battle.snapshot(); };
  const ready = () => {
    for (let guard = 0; guard < 20; guard++) {
      const state = battle.snapshot();
      if (state.phase === 'awaitingInput') return state;
      assert.ok(!['victory', 'dead'].includes(state.phase));
      advance(2000);
    }
    throw new Error('未進入判斷期');
  };
  const success = () => { const state = ready(); battle.submit(state.move.action, state); return battle.snapshot(); };
  battle.start();
  return { battle, advance, ready, success };
}

test('狂暴包含 HP=1920，僅第五王；擊敗與已觸發者不再觸發', () => {
  assert.equal(shouldBerserk(4, 1921, false), false);
  assert.equal(shouldBerserk(4, 1920, false), true);
  assert.equal(shouldBerserk(4, 1, false), true);
  assert.equal(shouldBerserk(4, 0, false), false);
  assert.equal(shouldBerserk(4, 1920, true), false);
  for (let boss = 0; boss < 4; boss++) assert.equal(shouldBerserk(boss, 1, false), false);
});

test('正好 1920 HP 進入一次狂暴；過場不計有效時間、不扣 HP、不接受輸入', () => {
  const f = fixture();
  while (f.ready().bossIndex < 4) f.success();
  for (let i = 0; i < 8; i++) f.success();
  const crossed = f.battle.snapshot();
  assert.equal(crossed.bossHP, 1920);
  assert.equal(crossed.berserkTriggered, true);
  assert.equal(crossed.berserkCount, 0);
  f.advance(1000);
  const transition = f.battle.snapshot();
  assert.equal(transition.phase, 'berserkTransition');
  assert.equal(transition.berserkCount, 1);
  assert.equal(transition.phaseDurationMs, TIMING.berserk);
  assert.equal(f.battle.submit(transition.move.action, transition), false);
  const frozen = { hp: transition.bossHP, combo: transition.combo, stats: transition.stats, time: transition.battleMs };
  f.advance(999);
  assert.equal(f.battle.snapshot().phase, 'berserkTransition');
  f.advance(1);
  const after = f.battle.snapshot();
  assert.equal(after.phase, 'nextTurn');
  assert.deepEqual({ hp: after.bossHP, combo: after.combo, stats: after.stats, time: after.battleMs }, frozen);
  const ready = f.ready();
  assert.equal(ready.remainingMs, 2000);
  assert.equal(ready.boss.limit, 2000);
  for (let guard = 0; f.battle.snapshot().phase !== 'victory'; guard++) {
    assert.ok(guard < 30);
    if (f.battle.snapshot().bossHP === 0) { f.advance(1000); f.advance(1500); }
    else f.success();
  }
  assert.equal(f.battle.snapshot().berserkCount, 1);
});

test('狂暴過場可凍結／延續，新局清空狂暴狀態', () => {
  const f = fixture();
  while (f.ready().bossIndex < 4) f.success();
  while (!f.battle.snapshot().berserkTriggered) f.success();
  f.advance(1000);
  f.advance(250);
  f.battle.pause();
  const paused = f.battle.snapshot();
  f.advance(100000);
  assert.deepEqual(f.battle.snapshot(), paused);
  f.battle.resume();
  f.advance(749);
  assert.equal(f.battle.snapshot().phase, 'berserkTransition');
  f.advance(1);
  assert.equal(f.battle.snapshot().phase, 'nextTurn');
  f.battle.start();
  const fresh = f.battle.snapshot();
  assert.equal(fresh.berserk, false);
  assert.equal(fresh.berserkTriggered, false);
  assert.equal(fresh.berserkPending, false);
  assert.equal(fresh.berserkCount, 0);
});
