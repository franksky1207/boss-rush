// 原創短音效由 Web Audio 合成；沒有背景音樂、外部音檔或 JS 音效計時器。
const NOTES = Object.freeze({
  button: [460], attack: [180, 420], defend: [260, 520], dodge: [720, 360], counter: [340, 820],
  PERFECT: [1040], GREAT: [880], GOOD: [660], wrong: [150, 110], timeout: [130, 90],
  combo: [880, 1100], bossDefeated: [390, 520, 780], berserkTransition: [120, 170, 220],
  dead: [220, 160, 90], victory: [520, 660, 780, 1040],
});

export class Sound {
  #createContext;
  #context = null;
  #master = null;
  #voices = new Set();
  #unlocking = null;
  #event = '';
  #settings = { sound: true, volume: 70 };
  unavailable = false;

  constructor({ createContext = () => {
    const Context = globalThis.AudioContext ?? globalThis.webkitAudioContext;
    if (!Context) throw new Error('瀏覽器不支援音效');
    return new Context();
  } } = {}) { this.#createContext = createContext; }

  configure(settings) {
    this.#settings = { sound: settings.sound, volume: settings.volume };
    if (!settings.sound || settings.volume === 0) this.stop();
    if (this.#master) this.#master.gain.value = settings.sound ? settings.volume / 100 * 0.22 : 0;
  }

  // 僅由使用者事件呼叫；不排隊重播失敗音效，避免切局後遲到的聲音。
  unlock() {
    if (!this.#settings.sound || this.#settings.volume === 0) return Promise.resolve(false);
    try {
      if (!this.#context || this.#context.state === 'closed') {
        this.#context = this.#createContext();
        this.#master = this.#context.createGain();
        this.#master.connect(this.#context.destination);
        this.configure(this.#settings);
      }
      if (this.#context.state === 'running') { this.unavailable = false; return Promise.resolve(true); }
      if (!this.#unlocking) {
        this.#unlocking = Promise.resolve(this.#context.resume())
          .then(() => { this.unavailable = this.#context.state !== 'running'; return !this.unavailable; })
          .catch(() => { this.unavailable = true; return false; })
          .finally(() => { this.#unlocking = null; });
      }
      return this.#unlocking;
    } catch { this.unavailable = true; return Promise.resolve(false); }
  }

  play(...names) {
    if (!this.#settings.sound || this.#settings.volume === 0 || this.#context?.state !== 'running') return false;
    this.stop();
    try {
      const notes = names.flatMap(name => NOTES[name] ?? []).slice(0, 6);
      for (const [index, frequency] of notes.entries()) {
        const oscillator = this.#context.createOscillator();
        const gain = this.#context.createGain();
        const voice = { oscillator, gain };
        this.#voices.add(voice);
        oscillator.type = names.includes('wrong') || names.includes('dead') ? 'triangle' : 'sine';
        oscillator.frequency.value = frequency;
        oscillator.connect(gain);
        gain.connect(this.#master);
        const start = this.#context.currentTime + index * 0.065;
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(0.55, start + 0.008);
        gain.gain.exponentialRampToValueAtTime(0.001, start + 0.12);
        oscillator.onended = () => {
          oscillator.disconnect(); gain.disconnect(); this.#voices.delete(voice);
        };
        oscillator.start(start);
        oscillator.stop(start + 0.13);
      }
      return notes.length > 0;
    } catch { this.stop(); this.unavailable = true; return false; }
  }

  update(state) {
    const event = `${state.session}:${state.turn}:${state.phase}`;
    if (state.paused || state.phase === 'home') this.stop();
    if (event === this.#event) return;
    this.#event = event;
    if (state.paused) return;
    if (['bossDefeated', 'berserkTransition', 'dead', 'victory'].includes(state.phase)) this.play(state.phase);
    else if (state.phase === 'resolving' && state.result) {
      const { grade, action } = state.result;
      const comboUp = [5, 10, 15, 20].includes(state.combo);
      this.play(grade === 'wrong' || grade === 'timeout' ? grade : action,
        grade === 'wrong' || grade === 'timeout' ? '' : grade, comboUp ? 'combo' : '');
    }
  }

  stop() {
    for (const { oscillator, gain } of this.#voices) {
      try { oscillator.stop(); } catch { /* 已結束的短音可直接釋放。 */ }
      try { oscillator.disconnect(); gain.disconnect(); } catch { /* 播放失敗不影響遊戲。 */ }
    }
    this.#voices.clear();
  }
}
