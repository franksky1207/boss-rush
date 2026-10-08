import test from 'node:test';
import assert from 'node:assert/strict';
import { sceneFrame } from '../effects/scene.js';
import { Battle } from '../core/battle.js';
import { ACTIONS } from '../data/rules.js';

test('四種成功動作具備不同呈現且不修改戰鬥快照', () => {
  const signatures = [];
  for (const action of ACTIONS) {
    const state = { phase: 'resolving', phaseElapsedMs: action.duration * 0.3, phaseDurationMs: action.duration,
      bossHP: 900, playerHP: 100, combo: 1, result: { action: action.id, grade: 'GREAT', damage: 110 } };
    const before = structuredClone(state);
    const frame = sceneFrame(state);
    assert.deepEqual(state, before);
    assert.equal(frame.damage, 110);
    assert.ok(frame.strength > 0);
    signatures.push(JSON.stringify([frame.hero, frame.enemy, frame.effect, frame.trail]));
  }
  assert.equal(new Set(signatures).size, 4);
});

test('每種動畫在尾端回到錨點並清除特效；下一回合、新局無殘留', () => {
  for (const action of ACTIONS) {
    const state = { phase: 'resolving', phaseElapsedMs: action.duration, phaseDurationMs: action.duration,
      result: { action: action.id, grade: 'PERFECT', damage: 120 } };
    const finished = sceneFrame(state);
    assert.equal(finished.hero.forward, 0);
    assert.equal(finished.hero.side, 0);
    assert.equal(finished.enemy.forward, 0);
    assert.equal(finished.strength, 0);
    assert.equal(finished.trail, 0);
    for (const phase of ['nextTurn', 'home', 'bossIntro', 'dead', 'victory']) {
      const cleared = sceneFrame({ ...state, phase });
      assert.equal(cleared.effect, null);
      assert.equal(cleared.damage, 0);
      assert.equal(cleared.hero.pose, 'idle');
    }
  }
});

test('錯誤與超時只播放受傷，沒有成功特效或傷害字', () => {
  for (const grade of ['wrong', 'timeout']) {
    const frame = sceneFrame({ phase: 'resolving', phaseElapsedMs: 200, phaseDurationMs: 600,
      result: { grade, action: 'attack', damage: 0 } });
    assert.equal(frame.hero.pose, 'hurt');
    assert.equal(frame.effect, 'hurt');
    assert.equal(frame.damage, 0);
  }
});

test('核心暫停時呈現進度凍結，恢復延續而非重播動畫', () => {
  let now = 0;
  const battle = new Battle({ clock: () => now, random: () => 0 });
  battle.start();
  now = 900; battle.tick();
  now = 1300; battle.tick();
  battle.submit('attack', battle.snapshot());
  now += 200;
  battle.pause();
  const paused = battle.snapshot();
  const visual = sceneFrame(paused);
  now += 50000;
  battle.tick();
  assert.deepEqual(sceneFrame(battle.snapshot()), visual);
  assert.equal(battle.snapshot().phaseElapsedMs, paused.phaseElapsedMs);
  battle.resume();
  assert.deepEqual(sceneFrame(battle.snapshot()), visual);
  now += 500; battle.tick();
  assert.equal(battle.snapshot().phase, 'nextTurn');
  assert.equal(sceneFrame(battle.snapshot()).hero.forward, 0);
});

test('四種預告可辨識；擊敗漸出不觸發判定', () => {
  const cues = ACTIONS.map(action => sceneFrame({ phase: 'telegraph', move: { action: action.id } }).cue);
  assert.deepEqual(cues, ['attack', 'defend', 'dodge', 'counter']);
  const state = { phase: 'bossDefeated', bossHP: 0, phaseDurationMs: 1500, phaseElapsedMs: 750 };
  const before = structuredClone(state);
  assert.equal(sceneFrame(state).enemy.opacity, 0.5);
  assert.deepEqual(state, before);
});

test('五王專屬特效與狂暴只使用呈現資料，不改傷害或耗時', () => {
  const frames = [];
  for (let bossIndex = 0; bossIndex < 5; bossIndex++) {
    const state = { bossIndex, phase: 'resolving', phaseElapsedMs: 250, phaseDurationMs: 750,
      result: { grade: 'GREAT', action: 'defend', damage: 330 }, bossHP: 1000, battleMs: 2000 };
    const before = structuredClone(state);
    frames.push(sceneFrame(state));
    assert.deepEqual(state, before);
  }
  assert.ok(frames[1].enemyTrail > 0);
  assert.ok(frames[2].ambient > 0 && frames[3].ambient > 0 && frames[4].ambient > 0);
  const state = { phase: 'berserkTransition', bossIndex: 4, phaseElapsedMs: 500, phaseDurationMs: 1000 };
  const frame = sceneFrame(state);
  assert.equal(frame.damage, 0);
  assert.equal(frame.effect, null);
  assert.ok(frame.ambient > 0);
});

test('降低特效移除晃動／殘影／能量，保留招式線索、姿態與傷害且不改狀態', () => {
  for (const action of ACTIONS) {
    const state = {phase:'resolving',bossIndex:1,phaseElapsedMs:200,phaseDurationMs:action.duration,
      result:{action:action.id,grade:'GREAT',damage:110},bossHP:940,battleMs:2000};
    const before=structuredClone(state), normal=sceneFrame(state), reduced=sceneFrame(state,{reducedEffects:true});
    assert.deepEqual(state,before);
    assert.equal(reduced.hero.angle,0);
    assert.equal(reduced.enemy.angle,0);
    assert.equal(reduced.trail,0);
    assert.equal(reduced.enemyTrail,0);
    assert.equal(reduced.ambient,0);
    assert.equal(reduced.damage,normal.damage);
    assert.equal(reduced.hero.pose,normal.hero.pose);
    assert.equal(reduced.hero.forward,normal.hero.forward*.15);
    assert.equal(sceneFrame({...state,phase:'telegraph',move:{action:action.id}},{reducedEffects:true}).cue,action.id);
  }
});
