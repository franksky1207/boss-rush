import test from 'node:test';
import assert from 'node:assert/strict';
import { Battle } from '../core/battle.js';

function setup(mode = 'tutorial') {
  let now = 0;
  const battle = new Battle({ clock: () => now, random: () => 0 });
  const step = ms => { now += ms; battle.tick(); return battle.snapshot(); };
  battle.start(mode);
  step(900);
  return { battle, step };
}
test('首次教學停表，僅確認才標記；過期與重複確認拒絕', () => {
  const { battle, step } = setup();
  const first = battle.snapshot();
  assert.equal(first.phase, 'tutorial');
  assert.deepEqual(first.seenTutorialMoves, []);
  assert.equal(battle.submit(first.move.action, first), false);
  assert.equal(battle.confirmTutorial({ ...first, session: 0 }), false);
  assert.deepEqual(step(10000), first);
  assert.equal(battle.confirmTutorial(first), true);
  assert.equal(battle.confirmTutorial(first), false);
  assert.deepEqual(battle.snapshot().seenTutorialMoves, [first.move.id]);
  assert.equal(step(400).remainingMs, 4000);
  step(1000);
  battle.submit(first.move.action, first);
  assert.equal(battle.snapshot().combo, 1);
  assert.equal(battle.snapshot().bossHP, 930);
});
test('同局不重複教學，新局與返家重設已教清單', () => {
  const { battle, step } = setup();
  const seen = new Set();
  for (let guard = 0; battle.snapshot().turn < 9; guard++) {
    assert.ok(guard < 100);
    const state = battle.snapshot();
    if (state.phase === 'tutorial') {
      assert.equal(seen.has(state.move.id), false);
      battle.confirmTutorial(state);
      seen.add(state.move.id);
    } else if (state.phase === 'awaitingInput') {
      assert.ok(seen.has(state.move.id));
      battle.submit(state.move.action, state);
    } else step(state.phaseDurationMs);
  }
  assert.ok(seen.size >= 2);
  battle.home();
  assert.deepEqual(battle.snapshot().seenTutorialMoves, []);
  battle.start('tutorial');
  assert.equal(step(900).phase, 'tutorial');
  assert.deepEqual(battle.snapshot().seenTutorialMoves, []);
});
test('退出先凍結，取消保持暫停；確認返家使舊操作失效', () => {
  const { battle, step } = setup('challenge');
  step(400); step(1200);
  const before = battle.snapshot();
  assert.equal(battle.requestExit(), true);
  step(10000);
  battle.resume();
  assert.equal(battle.snapshot().paused, true);
  assert.equal(battle.submit(before.move.action, before), false);
  assert.equal(battle.snapshot().remainingMs, before.remainingMs);
  battle.cancelExit();
  assert.equal(battle.snapshot().paused, true);
  battle.resume();
  assert.equal(battle.snapshot().remainingMs, before.remainingMs);
  battle.requestExit();
  battle.confirmExit();
  assert.equal(battle.snapshot().phase, 'home');
  assert.notEqual(battle.snapshot().session, before.session);
  assert.equal(battle.submit(before.move.action, before), false);
  assert.equal(battle.snapshot().stats.correct, 0);
});
test('教學被暫停或退出取消不會提前標記', () => {
  const { battle, step } = setup();
  const state = battle.snapshot();
  battle.pause(); step(20000);
  assert.equal(battle.confirmTutorial(state), false);
  battle.requestExit(); battle.cancelExit(); battle.resume();
  assert.equal(battle.snapshot().phase, 'tutorial');
  assert.deepEqual(battle.snapshot().seenTutorialMoves, []);
  assert.equal(battle.confirmTutorial(state), true);
});
test('教學與挑戰全 GREAT 路徑數值與有效戰鬥時間一致', () => {
  function play(mode) {
    const { battle, step } = setup(mode);
    for (let guard = 0; guard < 10000; guard++) {
      const s = battle.snapshot();
      if (s.phase === 'victory') return s;
      if (s.phase === 'tutorial') { step(10000); battle.confirmTutorial(s); }
      else if (s.phase === 'awaitingInput') { step(s.boss.limit * .4); battle.submit(s.move.action, s); }
      else step(s.phaseDurationMs);
    }
    assert.fail('未通關');
  }
  const tutorial = play('tutorial'), challenge = play('challenge');
  assert.deepEqual(tutorial.stats, challenge.stats);
  assert.equal(tutorial.stats.GREAT, 52);
  assert.equal(tutorial.battleMs, challenge.battleMs);
  assert.equal(tutorial.highestCombo, 52);
  assert.equal(tutorial.playerHP, 100);
  assert.deepEqual(challenge.seenTutorialMoves, []);
});
test('非法模式不重設當局；死亡重玩重設教學', () => {
  const { battle, step } = setup();
  const first = battle.snapshot();
  assert.throws(() => battle.start('invalid'), RangeError);
  assert.deepEqual(battle.snapshot(), first);
  for (let guard = 0; battle.snapshot().phase !== 'dead'; guard++) {
    assert.ok(guard < 100);
    const s = battle.snapshot();
    if (s.phase === 'tutorial') battle.confirmTutorial(s);
    else if (s.phase === 'awaitingInput') battle.submit(s.move.action === 'attack' ? 'defend' : 'attack', s);
    else step(s.phaseDurationMs);
  }
  battle.start('tutorial');
  assert.deepEqual(battle.snapshot().seenTutorialMoves, []);
  assert.equal(step(900).phase, 'tutorial');
});
