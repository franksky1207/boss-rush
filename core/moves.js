import { ACTIONS, BOSSES, MOVES } from '../data/rules.js?v=0.9.2';

export function unlockedMoves(bossIndex) {
  if (!Number.isInteger(bossIndex) || bossIndex < 0 || bossIndex >= BOSSES.length) throw new RangeError('無效關卡');
  return MOVES.filter(move => move.unlockBoss <= bossIndex + 1);
}

function weightedChoice(items, weight, random) {
  const total = items.reduce((sum, item) => sum + weight(item), 0);
  const roll = random();
  if (!Number.isFinite(roll)) throw new RangeError('亂數必須為有限數值');
  let target = Math.max(0, Math.min(1 - Number.EPSILON, roll)) * total;
  for (const item of items) {
    target -= weight(item);
    if (target < 0) return item;
  }
  return items.at(-1);
}

// 先選行動類別再選招式，避免某類招式較多就壟斷出現率。
export class MovePicker {
  #random;
  #last = null;
  #run = 0;
  #boss = -1;
  #counts = {};

  constructor(random = Math.random) { this.#random = random; }

  next(bossIndex) {
    const unlocked = unlockedMoves(bossIndex);
    if (this.#boss !== bossIndex) {
      this.#boss = bossIndex;
      this.#counts = Object.fromEntries(ACTIONS.map(action => [action.id, 0]));
    }
    const distinct = unlocked.filter(move => move.id !== this.#last?.id);
    let candidates = distinct.filter(move => this.#run < 2 || move.action !== this.#last?.action);
    // 無法同時滿足時，固定答案與不重複同招優先；現有五王資料不會走到此分支。
    if (!candidates.length) candidates = distinct;
    const categories = ACTIONS.map(action => action.id).filter(action => candidates.some(move => move.action === action));
    const category = weightedChoice(categories, action => 1 / (1 + this.#counts[action]), this.#random);
    const move = weightedChoice(candidates.filter(move => move.action === category),
      item => item.unlockBoss === bossIndex + 1 ? 2 : 1, this.#random);
    this.#counts[category] += 1;
    this.#run = this.#last?.action === move.action ? this.#run + 1 : 1;
    this.#last = move;
    return move;
  }
}
