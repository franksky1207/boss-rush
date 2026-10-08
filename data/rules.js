export const BOSSES = Object.freeze([
  { name: '鐵甲守衛', hp: 1050, limit: 4000 },
  { name: '暗影刺客', hp: 1750, limit: 3500 },
  { name: '烈焰魔將', hp: 3000, limit: 3000 },
  { name: '虛空領主', hp: 3500, limit: 2500 },
  { name: '終焉魔王', hp: 4800, limit: 2000 },
].map(Object.freeze));

export const ACTIONS = Object.freeze([
  { id: 'attack', label: '攻擊', symbol: '⚔️', duration: 650 },
  { id: 'defend', label: '防禦', symbol: '🛡️', duration: 750 },
  { id: 'dodge', label: '閃避', symbol: '💨', duration: 750 },
  { id: 'counter', label: '反擊', symbol: '✨', duration: 850 },
].map(Object.freeze));

export const MOVES = Object.freeze([
  { id: 'A01', name: '魔力蓄積', action: 'attack', unlockBoss: 1, cue: '雙手向內聚集藍色魔力', gesture: '◎' },
  { id: 'D01', name: '全場震盪', action: 'defend', unlockBoss: 1, cue: '地面向外擴散圓環', gesture: '↔' },
  { id: 'E01', name: '巨斧重擊', action: 'dodge', unlockBoss: 1, cue: '高舉巨斧準備下劈', gesture: '↓' },
  { id: 'C01', name: '直線突刺', action: 'counter', unlockBoss: 1, cue: '武器尖端直指勇者', gesture: '→' },
  { id: 'E02', name: '橫掃千軍', action: 'dodge', unlockBoss: 2, cue: '武器向側邊蓄勢、準備橫掃', gesture: '⌒' },
  { id: 'C03', name: '疾風突襲', action: 'counter', unlockBoss: 2, cue: '壓低身形準備直線疾衝', gesture: '⇢' },
  { id: 'D02', name: '火焰爆發', action: 'defend', unlockBoss: 3, cue: '火焰向外擴散', gesture: '↔' },
  { id: 'A03', name: '能量聚集', action: 'attack', unlockBoss: 3, cue: '胸前能量球向內聚集', gesture: '◎' },
  { id: 'A02', name: '黑暗詠唱', action: 'attack', unlockBoss: 4, cue: '紫色符文與法陣凝聚', gesture: '◎' },
  { id: 'D04', name: '虛空爆震', action: 'defend', unlockBoss: 4, cue: '虛空衝擊環向外擴張', gesture: '↔' },
  { id: 'A04', name: '禁咒吟唱', action: 'attack', unlockBoss: 5, cue: '巨型法陣聚集能量', gesture: '◎' },
  { id: 'D03', name: '雷霆衝擊', action: 'defend', unlockBoss: 5, cue: '全場雷電衝擊', gesture: '↯' },
  { id: 'E03', name: '墜星轟擊', action: 'dodge', unlockBoss: 5, cue: '巨大武器／能量自上方落下', gesture: '⇓' },
  { id: 'E04', name: '毀滅斬落', action: 'dodge', unlockBoss: 5, cue: '高舉巨劍準備猛烈下斬', gesture: '↓' },
  { id: 'C02', name: '精準穿刺', action: 'counter', unlockBoss: 5, cue: '細長光線鎖定勇者', gesture: '→' },
  { id: 'C04', name: '致命刺擊', action: 'counter', unlockBoss: 5, cue: '尖端十字鎖定後突刺', gesture: '⊕' },
].map(Object.freeze));

export const TIMING = Object.freeze({ intro: 900, telegraph: 400, prepare: 700, defeat: 1500, miss: 600, berserk: 1000 });
export const DIFFICULTIES = Object.freeze({
  easy: Object.freeze({ id: 'easy', name: '簡單', initial: 100, wrong: 10, timeout: 15, recovery: 30 }),
  normal: Object.freeze({ id: 'normal', name: '普通', initial: 100, wrong: 15, timeout: 20, recovery: 30 }),
  hard: Object.freeze({ id: 'hard', name: '困難', initial: 100, wrong: 20, timeout: 30, recovery: 20 }),
});
export const HP = DIFFICULTIES.normal;
export const BERSERK_HP = BOSSES.at(-1).hp * 0.4;
