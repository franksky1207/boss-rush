import test from 'node:test';
import assert from 'node:assert/strict';
import { MOVES } from '../data/rules.js';
import { MovePicker, unlockedMoves } from '../core/moves.js';

function seeded(seed) {
  return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32; };
}

test('16 招名稱、唯一正解與逐王解鎖符合規格', () => {
  const expected = {
    A01: ['魔力蓄積', 'attack', 1], D01: ['全場震盪', 'defend', 1], E01: ['巨斧重擊', 'dodge', 1], C01: ['直線突刺', 'counter', 1],
    E02: ['橫掃千軍', 'dodge', 2], C03: ['疾風突襲', 'counter', 2], D02: ['火焰爆發', 'defend', 3], A03: ['能量聚集', 'attack', 3],
    A02: ['黑暗詠唱', 'attack', 4], D04: ['虛空爆震', 'defend', 4], A04: ['禁咒吟唱', 'attack', 5], D03: ['雷霆衝擊', 'defend', 5],
    E03: ['墜星轟擊', 'dodge', 5], E04: ['毀滅斬落', 'dodge', 5], C02: ['精準穿刺', 'counter', 5], C04: ['致命刺擊', 'counter', 5],
  };
  assert.equal(MOVES.length, 16);
  assert.equal(new Set(MOVES.map(move => move.id)).size, 16);
  for (const move of MOVES) {
    assert.deepEqual([move.name, move.action, move.unlockBoss], expected[move.id]);
    assert.ok(move.cue && move.gesture);
    assert.ok(Object.isFrozen(move));
  }
  assert.deepEqual([0, 1, 2, 3, 4].map(boss => unlockedMoves(boss).length), [4, 6, 8, 10, 16]);
  for (let boss = 1; boss < 5; boss++) {
    for (const move of unlockedMoves(boss - 1)) assert.ok(unlockedMoves(boss).includes(move));
  }
});

test('四個種子、五王共 40,000 次抽招符合解鎖及連續限制，包括跨王', () => {
  for (const seed of [1, 42, 2026, 123456]) {
    const picker = new MovePicker(seeded(seed));
    let previous = null;
    let run = 0;
    for (let boss = 0; boss < 5; boss++) {
      const seen = new Set();
      const classes = new Set();
      for (let draw = 0; draw < 2000; draw++) {
        const move = picker.next(boss);
        assert.ok(move.unlockBoss <= boss + 1);
        assert.notEqual(move.id, previous?.id);
        run = previous?.action === move.action ? run + 1 : 1;
        assert.ok(run <= 2);
        seen.add(move.id);
        classes.add(move.action);
        previous = move;
      }
      assert.equal(seen.size, unlockedMoves(boss).length);
      assert.equal(classes.size, 4);
    }
  }
});

test('固定亂數邊界不會卡住抽招，非法關卡拒絕處理', () => {
  for (const roll of [0, 1 - Number.EPSILON, 1]) {
    const picker = new MovePicker(() => roll);
    let previous = null;
    let run = 0;
    for (let i = 0; i < 100; i++) {
      const move = picker.next(4);
      assert.notEqual(move.id, previous?.id);
      run = move.action === previous?.action ? run + 1 : 1;
      assert.ok(run <= 2);
      previous = move;
    }
  }
  for (const invalid of [-1, 5, 1.5, NaN]) assert.throws(() => unlockedMoves(invalid), RangeError);
});

test('當王新招較同類舊招常見，四類抽取仍維持覆蓋', () => {
  const picker = new MovePicker(seeded(20261008));
  const counts = Object.fromEntries(unlockedMoves(1).map(move => [move.id, 0]));
  const categories = { attack: 0, defend: 0, dodge: 0, counter: 0 };
  for (let i = 0; i < 20000; i++) {
    const move = picker.next(1);
    counts[move.id] += 1;
    categories[move.action] += 1;
  }
  assert.ok(counts.E02 > counts.E01 * 1.25);
  assert.ok(counts.C03 > counts.C01 * 1.25);
  for (const count of Object.values(categories)) assert.ok(count > 4000 && count < 6000);
});
