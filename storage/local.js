import { topRecords, validRecord } from '../core/results.js?v=0.9.1';

export const PREFERENCES_KEY = 'boss-rush.preferences.v1';
export const LEADERBOARD_KEY = 'boss-rush.leaderboard.v1';
export const DEFAULT_PREFERENCES = Object.freeze({ sound: true, volume: 70, reducedEffects: false });

export function normalizePreferences(value, defaults = DEFAULT_PREFERENCES) {
  return {
    sound: typeof value?.sound === 'boolean' ? value.sound : defaults.sound,
    volume: Number.isFinite(value?.volume) ? Math.round(Math.min(100, Math.max(0, value.volume))) : defaults.volume,
    reducedEffects: typeof value?.reducedEffects === 'boolean' ? value.reducedEffects : defaults.reducedEffects,
  };
}

// localStorage 取得、JSON 解析與寫入皆在保護範圍內；不保存進行中的戰鬥。
export class LocalStore {
  #storage;
  #records = [];
  #submitted = new Set();
  #defaults;
  preferenceError = false;
  leaderboardError = false;

  constructor({ storage = () => globalThis.localStorage, defaults = DEFAULT_PREFERENCES } = {}) {
    this.#storage = storage;
    this.#defaults = normalizePreferences(defaults);
    try {
      const raw = this.#storage().getItem(LEADERBOARD_KEY);
      if (raw !== null) {
        const data = JSON.parse(raw);
        if (data.version !== 1 || !Array.isArray(data.records)) throw new Error('不支援的成績資料');
        this.leaderboardError = data.records.some(record => !validRecord(record));
        this.#records = topRecords(data.records);
        for (const record of this.#records) this.#submitted.add(record.id);
      }
    } catch { this.leaderboardError = true; }
  }

  get records() { return structuredClone(this.#records); }

  loadPreferences() {
    try {
      const raw = this.#storage().getItem(PREFERENCES_KEY);
      if (raw === null) return { ...this.#defaults };
      const data = JSON.parse(raw);
      if (data.version !== 1) throw new Error('不支援的設定資料');
      return normalizePreferences(data.preferences, this.#defaults);
    } catch {
      this.preferenceError = true;
      return { ...this.#defaults };
    }
  }

  savePreferences(value) {
    const preferences = normalizePreferences(value, this.#defaults);
    try {
      this.#storage().setItem(PREFERENCES_KEY, JSON.stringify({ version: 1, preferences }));
      this.preferenceError = false;
    } catch { this.preferenceError = true; }
    return preferences;
  }

  add(record) {
    if (!validRecord(record)) return { accepted: false, reason: 'invalid' };
    if (this.#submitted.has(record.id)) return { accepted: false, reason: 'duplicate' };
    // 即使未進入前 20 名或寫入失敗，同次結算亦只能提交一次。
    this.#submitted.add(record.id);
    this.#records = topRecords([...this.#records, structuredClone(record)]);
    const persistent = this.#saveRecords();
    const index = this.#records.filter(item => item.difficulty === (record.difficulty ?? 'hard')).findIndex(item => item.id === record.id);
    return { accepted: true, persistent, rank: index < 0 ? null : index + 1 };
  }

  #saveRecords() {
    try {
      this.#storage().setItem(LEADERBOARD_KEY, JSON.stringify({ version: 1, records: this.#records }));
      this.leaderboardError = false;
      return true;
    } catch { this.leaderboardError = true; return false; }
  }

  clear() {
    this.#records = [];
    // 不重設已提交識別，清榜後不能將同次結算重複寫入。
    return this.#saveRecords();
  }
}
