import { DIFFICULTIES } from '../data/rules.js?v=0.9.4';
export const RESULT_VERSION = 1;
export const GRADES = Object.freeze(['SSS', 'SS', 'S', 'A', 'B', 'C']);

export function evaluateResult(state) {
  if (!['victory', 'dead'].includes(state.phase)) return null;
  const { correct, wrong, timeout, PERFECT } = state.stats;
  const total = correct + wrong + timeout;
  const accuracy = total ? correct / total : 0;
  const perfectRate = correct ? PERFECT / correct : 0;
  // 以次數交叉比較，不以格式化後的百分比判定門檻。
  const grade = state.phase === 'dead' ? 'C'
    : wrong === 0 && timeout === 0 && correct > 0 && PERFECT * 10 >= correct * 3 ? 'SSS'
      : correct * 100 >= total * 95 ? 'SS'
        : correct * 100 >= total * 90 ? 'S'
          : correct * 100 >= total * 80 ? 'A' : 'B';
  return { grade, accuracy, perfectRate };
}

export function eligibleForLeaderboard(state) {
  return state.phase === 'victory' && state.mode === 'challenge'
    && state.bossIndex === 4 && state.bossHP === 0 && state.playerHP > 0;
}

// 暱稱以 Unicode 字元計數；不因 emoji 的 UTF-16 長度多算。
export function validNickname(value) {
  if (typeof value !== 'string') return false;
  const length = [...value.trim()].length;
  return length >= 1 && length <= 12;
}

export function createRecord(state, name, { id, completedAt }) {
  if (!eligibleForLeaderboard(state) || !validNickname(name)) return null;
  const record = {
    version: RESULT_VERSION, id, name: name.trim(), completedAt,
    difficulty: state.difficulty ?? 'normal', mode: state.mode, phase: state.phase, battleMs: state.battleMs,
    stats: { ...state.stats }, highestCombo: state.highestCombo, playerHP: state.playerHP,
    grade: evaluateResult(state).grade,
  };
  return validRecord(record) ? record : null;
}

export function validRecord(record) {
  if (!record || (record.difficulty !== undefined && !Object.hasOwn(DIFFICULTIES, record.difficulty)) || record.version !== RESULT_VERSION || record.mode !== 'challenge' || record.phase !== 'victory'
    || typeof record.id !== 'string' || !record.id.length || record.id.length > 128 || !validNickname(record.name)
    || !Number.isSafeInteger(record.completedAt) || record.completedAt < 0
    || !Number.isFinite(record.battleMs) || record.battleMs < 0
    || !Number.isInteger(record.playerHP) || record.playerHP < 1 || record.playerHP > 100
    || !Number.isInteger(record.highestCombo) || record.highestCombo < 1) return false;
  const stats = record.stats;
  if (!stats || !['correct', 'wrong', 'timeout', 'PERFECT', 'GREAT', 'GOOD']
    .every(key => Number.isInteger(stats[key]) && stats[key] >= 0 && stats[key] <= 1000000)) return false;
  return stats.correct > 0 && stats.PERFECT + stats.GREAT + stats.GOOD === stats.correct
    && record.highestCombo <= stats.correct && record.grade === evaluateResult(record).grade;
}

export function compareRecords(a, b) {
  const grade = GRADES.indexOf(a.grade) - GRADES.indexOf(b.grade);
  if (grade) return grade;
  const totalA = a.stats.correct + a.stats.wrong + a.stats.timeout;
  const totalB = b.stats.correct + b.stats.wrong + b.stats.timeout;
  const accuracy = b.stats.correct * totalA - a.stats.correct * totalB;
  return accuracy || a.battleMs - b.battleMs || a.completedAt - b.completedAt;
}

export function topRecords(records) {
  const ids = new Set();
  const counts = new Map();
  return records.filter(record => {
    if (!validRecord(record) || ids.has(record.id)) return false;
    ids.add(record.id);
    return true;
  }).map(record => ({ ...record, difficulty: record.difficulty ?? 'hard' }))
    .sort(compareRecords).filter(record => {
      const count = counts.get(record.difficulty) ?? 0;
      counts.set(record.difficulty, count + 1);
      return count < 20;
    });
}
