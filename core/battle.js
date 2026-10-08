import { ACTIONS, BERSERK_HP, BOSSES, DIFFICULTIES, HP, TIMING } from '../data/rules.js?v=0.9.0';
import { MovePicker } from './moves.js?v=0.9.0';

const ACTIVE = new Set(['telegraph', 'awaitingInput', 'resolving', 'nextTurn']);
const FINISHED = new Set(['home', 'dead', 'victory']);

export function comboMultiplier(combo) {
  return combo < 5 ? 1 : combo < 10 ? 1.5 : combo < 15 ? 2 : combo < 20 ? 2.5 : 3;
}

export function reactionGrade(elapsed, limit) {
  if (elapsed < 0 || elapsed > limit) return 'timeout';
  return elapsed <= limit * 0.25 ? 'PERFECT' : elapsed <= limit * 0.5 ? 'GREAT' : 'GOOD';
}

export function damage(combo, grade) {
  const multiplier = { PERFECT: 1.2, GREAT: 1.1, GOOD: 1 }[grade] ?? 0;
  return Math.round(100 * comboMultiplier(combo) * multiplier);
}

export function shouldBerserk(bossIndex, bossHP, triggered) {
  return bossIndex === BOSSES.length - 1 && bossHP > 0 && bossHP <= BERSERK_HP && !triggered;
}

// 核心只使用注入的單調時計；不建立計時器或操作 DOM。
export class Battle {
  #clock;
  #random;
  #state;
  #lastTime;
  #phaseStart;
  #phaseEnd;
  #inputStart;
  #pausedAt;
  #session = 0;
  #picker;

  constructor({ clock = () => performance.now(), random = Math.random } = {}) {
    this.#clock = clock;
    this.#random = random;
    this.#reset('home', this.#clock());
  }

  #reset(phase, now) {
    this.#session += 1;
    this.#state = {
      phase, session: this.#session, turn: 0, bossIndex: 0, bossHP: BOSSES[0].hp,
      playerHP: HP.initial, combo: 0, highestCombo: 0, move: null, result: null,
      battleMs: 0, paused: false, exitConfirmation: false,
      mode: "challenge", difficulty: "normal", seenTutorialMoves: [],
      berserk: false, berserkTriggered: false, berserkPending: false, berserkCount: 0,
      stats: { correct: 0, wrong: 0, timeout: 0, PERFECT: 0, GREAT: 0, GOOD: 0 },
    };
    this.#lastTime = now;
    this.#inputStart = now;
    this.#phaseStart = now;
    this.#phaseEnd = now;
    this.#pausedAt = null;
    this.#picker = new MovePicker(this.#random);
  }

  start(mode = "challenge", difficulty = "normal") {
    if (!["challenge", "tutorial"].includes(mode)) throw new RangeError("未知模式");
    if (!Object.hasOwn(DIFFICULTIES, difficulty)) throw new RangeError("未知難度");
    const now = this.#clock();
    this.#reset('bossIntro', now);
    this.#state.mode = mode;
    this.#state.difficulty = difficulty;
    this.#phaseEnd = now + TIMING.intro;
  }

  home() {
    this.#reset('home', this.#clock());
  }

  #enter(phase, now, duration = 0) {
    this.#state.phase = phase;
    this.#phaseStart = now;
    this.#phaseEnd = now + duration;
  }

  #account(now) {
    if (ACTIVE.has(this.#state.phase)) this.#state.battleMs += Math.max(0, now - this.#lastTime);
    this.#lastTime = now;
  }

  #newTurn(now) {
    this.#state.move = this.#picker.next(this.#state.bossIndex);
    this.#state.turn += 1;
    this.#state.result = null;
    this.#enter(this.#state.mode === 'tutorial' && !this.#state.seenTutorialMoves.includes(this.#state.move.id)
      ? 'tutorial' : 'telegraph', now, TIMING.telegraph);
  }

  confirmTutorial({ session, turn }) {
    const state = this.#state;
    if (state.paused || state.phase !== "tutorial" || session !== state.session || turn !== state.turn) return false;
    state.seenTutorialMoves.push(state.move.id);
    const now = this.#clock();
    this.#lastTime = now;
    this.#enter("telegraph", now, TIMING.telegraph);
    return true;
  }

  tick(now = this.#clock()) {
    if (!Number.isFinite(now) || now < this.#lastTime || this.#state.paused || FINISHED.has(this.#state.phase)) return;
    if (this.#state.phase === "tutorial") { this.#lastTime = now; return; }
    // 超時用 >，保留截止時間當下的有效點擊；下一次更新才結算無操作。
    if (this.#state.phase === 'awaitingInput') {
      this.#account(Math.min(now, this.#phaseEnd));
      if (now > this.#phaseEnd) {
        const deadline = this.#phaseEnd;
        this.#settle('timeout', deadline);
        this.#lastTime = now;
        // 延遲喚醒仍完整呈現一次結算，不追補多個沒顯示的回合。
        if (this.#state.phase === 'resolving') this.#enter('resolving', now, TIMING.miss);
      }
      return;
    }
    this.#account(now);
    if (now < this.#phaseEnd) return;
    switch (this.#state.phase) {
      case 'bossIntro':
      case 'nextTurn':
        this.#newTurn(now);
        break;
      case 'telegraph':
        this.#inputStart = now;
        this.#enter('awaitingInput', now, BOSSES[this.#state.bossIndex].limit);
        break;
      case 'resolving':
        if (this.#state.bossHP === 0) {
          this.#enter('bossDefeated', now, TIMING.defeat);
        } else if (this.#state.berserkPending) {
          this.#state.berserk = true;
          this.#state.berserkPending = false;
          this.#state.berserkCount += 1;
          this.#enter('berserkTransition', now, TIMING.berserk);
        } else {
          this.#enter('nextTurn', now, TIMING.prepare);
        }
        break;
      case 'berserkTransition':
        this.#enter('nextTurn', now, TIMING.prepare);
        break;
      case 'bossDefeated':
        if (this.#state.bossIndex === BOSSES.length - 1) {
          this.#enter('victory', now);
        } else {
          this.#state.playerHP = Math.min(HP.initial, this.#state.playerHP + DIFFICULTIES[this.#state.difficulty].recovery);
          this.#state.bossIndex += 1;
          this.#state.bossHP = BOSSES[this.#state.bossIndex].hp;
          this.#enter('bossIntro', now, TIMING.intro);
        }
        break;
    }
  }

  submit(action, { session, turn }, at = this.#clock()) {
    const state = this.#state;
    if (state.paused || state.phase !== 'awaitingInput' || session !== state.session || turn !== state.turn
      || !ACTIONS.some(item => item.id === action) || !Number.isFinite(at) || at < this.#inputStart) return false;
    // UI 傳入事件的 performance 時間戳；同一回合鎖定後不接受第二次操作。
    if (at > this.#phaseEnd) {
      this.tick(at);
      return false;
    }
    this.#account(Math.max(this.#lastTime, at));
    const grade = action === state.move.action ? reactionGrade(at - this.#inputStart, BOSSES[state.bossIndex].limit) : 'wrong';
    this.#settle(grade, Math.max(at, this.#lastTime), action);
    return true;
  }

  #settle(grade, now, action = null) {
    const state = this.#state;
    let dealt = 0;
    if (grade === 'wrong' || grade === 'timeout') {
      state.playerHP = Math.max(0, state.playerHP - (grade === 'wrong' ? DIFFICULTIES[state.difficulty].wrong : DIFFICULTIES[state.difficulty].timeout));
      state.combo = 0;
      state.stats[grade] += 1;
    } else {
      state.combo += 1;
      state.highestCombo = Math.max(state.highestCombo, state.combo);
      dealt = damage(state.combo, grade);
      state.bossHP = Math.max(0, state.bossHP - dealt);
      state.stats.correct += 1;
      state.stats[grade] += 1;
      if (shouldBerserk(state.bossIndex, state.bossHP, state.berserkTriggered)) {
        state.berserkTriggered = true;
        state.berserkPending = true;
      }
    }
    state.result = { grade, damage: dealt, action };
    const duration = ACTIONS.find(item => item.id === action)?.duration ?? TIMING.miss;
    this.#enter(state.playerHP === 0 ? 'dead' : 'resolving', now,
      grade === 'wrong' || grade === 'timeout' ? TIMING.miss : duration);
  }

  // 覆蓋層保留原回合與截止時間，不另建計時器。
  pause(now = this.#clock()) {
    if (this.#state.paused || FINISHED.has(this.#state.phase)) return;
    this.tick(now);
    if (FINISHED.has(this.#state.phase)) return;
    this.#state.paused = true;
    this.#pausedAt = now;
  }

  resume(now = this.#clock()) {
    if (!this.#state.paused || this.#state.exitConfirmation) return;
    const delta = Math.max(0, now - this.#pausedAt);
    this.#phaseStart += delta;
    this.#phaseEnd += delta;
    this.#inputStart += delta;
    this.#lastTime = now;
    this.#state.paused = false;
    this.#pausedAt = null;
  }

  requestExit() {
    if (FINISHED.has(this.#state.phase)) return false;
    this.pause();
    if (!this.#state.paused) return false;
    this.#state.exitConfirmation = true;
    return true;
  }

  cancelExit() {
    if (!this.#state.exitConfirmation) return false;
    this.#state.exitConfirmation = false;
    return true;
  }

  confirmExit() {
    if (!this.#state.exitConfirmation) return false;
    this.home();
    return true;
  }

  snapshot(now = this.#clock()) {
    const state = structuredClone(this.#state);
    state.boss = BOSSES[state.bossIndex];
    // 呈現層沿用核心時計，不建立另一條動畫時間線或完成回呼。
    const visualNow = state.paused ? this.#pausedAt : FINISHED.has(state.phase) ? this.#phaseStart : now;
    state.phaseElapsedMs = state.phase === "tutorial" ? 0 : Math.max(0, visualNow - this.#phaseStart);
    state.phaseDurationMs = Math.max(0, this.#phaseEnd - this.#phaseStart);
    state.remainingMs = state.phase === 'awaitingInput'
      ? Math.max(0, this.#phaseEnd - (state.paused ? this.#pausedAt : now)) : state.boss.limit;
    return state;
  }
}
